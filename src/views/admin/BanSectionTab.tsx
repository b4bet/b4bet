import { useEffect, useMemo, useState } from 'react';
import { auth, type BanRecord } from '../../lib/auth';
import { bus } from '../../lib/bus';
import { supabase } from '../../integrations/supabase/client';
import { ShieldBan, Search, Unlock, AlertTriangle, Activity, ShieldAlert, ShieldCheck, RefreshCw, Wifi } from 'lucide-react';

function useBannedUsers() {
  const [bans, setBans] = useState<BanRecord[]>(() => auth.getBannedUsers());
  useEffect(() => {
    // Load fresh from Supabase on mount
    void auth.loadBansFromSupabase();
    const unsub = bus.on('auth:bans', (payload) => {
      const all = payload as BanRecord[];
      setBans(all.filter((b) => !b.unbanDate));
    });
    return () => unsub();
  }, []);
  return bans;
}

function useAllBanHistory() {
  const [history, setHistory] = useState<BanRecord[]>(() => auth.getAllBanHistory());
  useEffect(() => {
    const unsub = bus.on('auth:bans', (payload) => {
      setHistory(payload as BanRecord[]);
    });
    return () => unsub();
  }, []);
  return history;
}

// Live Supabase users for Ban by ID search
function useLiveUsers() {
  const [users, setUsers] = useState<{ id: string; username: string; account_id: string; email?: string; is_active: boolean }[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.rpc('admin_get_profiles');
      if (data) {
        setUsers((data as { id: string; username: string | null; account_id: string; is_active: boolean }[]).map(u => ({
          id: u.id,
          username: u.username ?? '',
          account_id: u.account_id ?? '',
          is_active: u.is_active ?? true,
        })));
      }
    } catch (e) {
      console.error('[BanSection] useLiveUsers error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return { users, loading, reload: load };
}

export default function BanSectionTab() {
  const bans = useBannedUsers();
  const banHistory = useAllBanHistory();
  const { users: liveUsers, loading: usersLoading } = useLiveUsers();

  const [search, setSearch] = useState('');
  // Ban by ID input accepts 6-digit account_id OR UUID
  const [banIdInput, setBanIdInput] = useState('');
  const [banReason, setBanReason] = useState('');
  const [unbanId, setUnbanId] = useState<string | null>(null); // userId
  const [unbanReason, setUnbanReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [ipSearch, setIpSearch] = useState('');
  const [ipActionModal, setIpActionModal] = useState<{ userId: string; action: 'ban' | 'unban' } | null>(null);
  const [ipActionReason, setIpActionReason] = useState('');

  // Group all registered users by their IP (from ban history)
  const ipGroups = useMemo(() => {
    const groups = new Map<string, typeof bans>();
    for (const b of banHistory) {
      const ip = b.ip || 'unknown';
      const arr = groups.get(ip) ?? [];
      arr.push(b);
      groups.set(ip, arr);
    }
    return Array.from(groups.entries())
      .map(([ip, records]) => ({ ip, records: [...records].sort((a, b) => a.banDate - b.banDate) }))
      .sort((a, b) => b.records.length - a.records.length);
  }, [banHistory]);

  const multiIpGroups = ipGroups.filter(g => g.records.length > 1);
  const filteredIpGroups = multiIpGroups.filter((g) => {
    const q = ipSearch.trim().toLowerCase();
    if (!q) return true;
    if (g.ip.toLowerCase().includes(q)) return true;
    return g.records.some(r =>
      r.username.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.userId.toLowerCase().includes(q)
    );
  });

  const filtered = bans.filter((b) => {
    const q = search.toLowerCase();
    return (
      !q ||
      b.username.toLowerCase().includes(q) ||
      b.userId.toLowerCase().includes(q) ||
      b.email.toLowerCase().includes(q) ||
      b.ip.includes(q)
    );
  });

  function flash(ok: boolean, msg: string) {
    if (ok) { setSuccess(msg); setError(''); }
    else { setError(msg); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 3000);
  }

  function resolveUserByInput(input: string) {
    const trimmed = input.trim();
    // Try 6-digit account_id first
    const byAccountId = liveUsers.find(u => u.account_id === trimmed);
    if (byAccountId) return byAccountId;
    // Try UUID
    const byId = liveUsers.find(u => u.id === trimmed);
    if (byId) return byId;
    // Try username
    const byUsername = liveUsers.find(u => u.username.toLowerCase() === trimmed.toLowerCase());
    if (byUsername) return byUsername;
    return null;
  }

  function handleBanById() {
    const id = banIdInput.trim();
    if (!id) { flash(false, 'Please enter a User ID or Account ID.'); return; }
    if (!banReason.trim()) { flash(false, 'A ban reason is required.'); return; }
    const user = resolveUserByInput(id);
    if (!user) { flash(false, `No user found with ID "${id}". Make sure you use the 6-digit Account ID shown in the Users tab.`); return; }
    const alreadyBanned = bans.find((b) => b.userId === user.id);
    if (alreadyBanned) { flash(false, `${user.username} is already banned.`); return; }
    const ok = auth.banUser(user.id, banReason.trim());
    if (ok) {
      flash(true, `${user.username} (ID: ${user.account_id}) has been banned.`);
      setBanIdInput('');
      setBanReason('');
    } else {
      flash(false, 'Failed to ban user.');
    }
  }

  function handleUnban() {
    if (!unbanId) return;
    if (!unbanReason.trim()) { flash(false, 'An unban reason is required.'); return; }
    const ok = auth.unbanUser(unbanId, unbanReason.trim());
    if (ok) {
      flash(true, 'User has been unbanned.');
      setUnbanId(null);
      setUnbanReason('');
    } else {
      flash(false, 'Failed to unban user.');
    }
  }

  function confirmIpAction() {
    if (!ipActionModal) return;
    const reason = ipActionReason.trim();
    if (!reason) { flash(false, 'A reason is required.'); return; }
    const user = liveUsers.find(u => u.id === ipActionModal.userId);
    const ok = ipActionModal.action === 'ban'
      ? auth.banUser(ipActionModal.userId, reason)
      : auth.unbanUser(ipActionModal.userId, reason);
    if (ok) {
      flash(true, ipActionModal.action === 'ban'
        ? `${user?.username ?? ipActionModal.userId} has been banned.`
        : 'User has been unbanned.');
      setIpActionModal(null);
      setIpActionReason('');
    } else {
      flash(false, `Failed to ${ipActionModal.action} user.`);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
            <ShieldBan className="w-5 h-5 text-coral-400" /> Ban Section
          </h2>
          <p className="text-xs text-slate-500">Bans are saved permanently to Supabase — survive server restarts.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emeraldwin-300 bg-emeraldwin-500/10 border border-emeraldwin-500/20 px-2 py-0.5 rounded-full">
            <Wifi className="w-2.5 h-2.5" /> Supabase
          </span>
          <span className="text-[10px] font-bold text-coral-300 bg-coral-500/10 border border-coral-500/20 px-2 py-0.5 rounded-full">
            {bans.length} banned
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-coral-500/10 border border-coral-500/30 text-coral-300 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emeraldwin-500/10 border border-emeraldwin-500/30 text-emeraldwin-300 text-sm">
          <ShieldCheck className="w-4 h-4 flex-shrink-0" />{success}
        </div>
      )}

      {/* Ban User by ID Panel */}
      <div className="panel p-4 space-y-3">
        <div>
          <h3 className="font-display font-bold text-white text-sm flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-coral-400" /> Ban User by Account ID
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Enter the <span className="text-neon-300 font-semibold">6-digit Account ID</span> shown in the Users tab.
            You can also use their username or UUID.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Account ID / Username / UUID</p>
            <input
              value={banIdInput}
              onChange={(e) => setBanIdInput(e.target.value)}
              placeholder="e.g. 483920 or username"
              className="input"
              list="live-user-list"
            />
            <datalist id="live-user-list">
              {liveUsers.map((u) => (
                <option key={u.id} value={u.account_id}>{u.username} (#{u.account_id})</option>
              ))}
            </datalist>
            {usersLoading && <p className="text-[10px] text-slate-500 mt-0.5">Loading users…</p>}
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Ban Reason</p>
            <input
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason for ban"
              className="input"
            />
          </div>
        </div>
        <button onClick={handleBanById} className="btn-coral px-4 py-2 text-sm">
          Ban User
        </button>
      </div>

      {/* Search banned list */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search banned users…"
          className="input pl-10"
        />
      </div>

      {/* Banned list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            {search ? 'No banned users match your search.' : 'No banned users.'}
          </div>
        )}
        {filtered.map((ban) => (
          <div key={ban.userId} className="panel p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-coral-500/15 border border-coral-500/30 grid place-items-center flex-shrink-0">
              <ShieldBan className="w-4 h-4 text-coral-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-white">{ban.username}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                  ban.bannedBy === 'system'
                    ? 'bg-amberx-500/15 border-amberx-500/30 text-amberx-300'
                    : 'bg-coral-500/15 border-coral-500/30 text-coral-300'
                }`}>
                  {ban.bannedBy === 'system' ? 'Auto-Ban' : 'Admin'}
                </span>
                {/* Show 6-digit account ID from liveUsers */}
                {(() => {
                  const lu = liveUsers.find(u => u.id === ban.userId);
                  return lu?.account_id ? (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-neon-500/10 border border-neon-500/20 font-mono font-bold text-neon-300 text-[10px]">
                      #{lu.account_id}
                    </span>
                  ) : null;
                })()}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{ban.email}</p>
              <p className="text-[11px] text-slate-500">
                Reason: <span className="text-slate-300">{ban.banReason}</span>
              </p>
              <p className="text-[10px] text-slate-600 mt-0.5">
                IP: {ban.ip} · {new Date(ban.banDate).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => { setUnbanId(ban.userId); setUnbanReason(''); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emeraldwin-500/15 border border-emeraldwin-500/30 text-emeraldwin-300 text-xs font-semibold hover:bg-emeraldwin-500/25 transition-colors flex-shrink-0"
            >
              <Unlock className="w-3 h-3" /> Unban
            </button>
          </div>
        ))}
      </div>

      {/* Unban modal */}
      {unbanId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 grid place-items-center p-4">
          <div className="panel p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emeraldwin-500/15 border border-emeraldwin-500/30 grid place-items-center">
                <Unlock className="w-5 h-5 text-emeraldwin-300" />
              </div>
              <div>
                <h3 className="font-display font-bold text-white">Unban User</h3>
                <p className="text-xs text-slate-500">
                  {bans.find((b) => b.userId === unbanId)?.username} will be reactivated.
                </p>
              </div>
            </div>
            <input
              value={unbanReason}
              onChange={(e) => setUnbanReason(e.target.value)}
              placeholder="Unban reason…"
              className="input"
            />
            <div className="flex gap-2">
              <button onClick={() => { setUnbanId(null); setUnbanReason(''); }} className="flex-1 py-2 rounded-xl bg-slatepanel-700 text-slate-300 text-sm hover:bg-slatepanel-600 transition-colors">
                Cancel
              </button>
              <button onClick={handleUnban} className="flex-1 py-2 rounded-xl bg-emeraldwin-500/20 border border-emeraldwin-500/30 text-emeraldwin-300 font-semibold text-sm hover:bg-emeraldwin-500/30 transition-colors">
                Confirm Unban
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IP Activity section */}
      <div className="panel p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-amberx-400" /> IP Activity
            <span className="text-[9px] bg-amberx-500/15 border border-amberx-500/30 text-amberx-300 px-1.5 py-0.5 rounded-full">
              {multiIpGroups.length} multi-account IPs
            </span>
          </h3>
        </div>
        <p className="text-xs text-slate-500">
          Users grouped by ban registration IP. Shows potential multi-account activity.
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={ipSearch}
            onChange={(e) => setIpSearch(e.target.value)}
            placeholder="Search by IP or username…"
            className="input pl-9 text-sm"
          />
        </div>
        <div className="space-y-3">
          {filteredIpGroups.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-4">
              {ipSearch ? 'No IP activity matches your search.' : 'No multi-account activity in ban history.'}
            </p>
          )}
          {filteredIpGroups.map((group) => (
            <div key={group.ip} className="bg-slatepanel-800 rounded-xl border border-borderline-900 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">IP</span>
                  <span className="font-mono text-xs text-white font-semibold">{group.ip}</span>
                </div>
                <span className="text-[9px] bg-amberx-500/10 border border-amberx-500/20 text-amberx-300 px-1.5 py-0.5 rounded-full">
                  {group.records.length} bans from this IP
                </span>
              </div>
              <div className="space-y-2">
                {group.records.map((ban, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px]">
                    <div className={`w-2 h-2 mt-1 rounded-full flex-shrink-0 ${!ban.unbanDate ? 'bg-coral-400' : 'bg-slate-600'}`} />
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-white">{ban.username}</span>
                      <span className="text-slate-500 ml-1">{ban.email}</span>
                      <p className="text-slate-600">{new Date(ban.banDate).toLocaleString()} — {ban.banReason}</p>
                    </div>
                    {!ban.unbanDate ? (
                      <button
                        onClick={() => { setIpActionModal({ userId: ban.userId, action: 'unban' }); setIpActionReason(''); }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emeraldwin-500/15 border border-emeraldwin-500/30 text-emeraldwin-300 text-[10px] font-semibold flex-shrink-0"
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        onClick={() => { setIpActionModal({ userId: ban.userId, action: 'ban' }); setIpActionReason(''); }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-coral-500/15 border border-coral-500/30 text-coral-300 text-[10px] font-semibold flex-shrink-0"
                      >
                        Re-ban
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* IP Action modal */}
      {ipActionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 grid place-items-center p-4">
          <div className="panel p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl grid place-items-center ${
                ipActionModal.action === 'ban'
                  ? 'bg-coral-500/15 border border-coral-500/30'
                  : 'bg-emeraldwin-500/15 border border-emeraldwin-500/30'
              }`}>
                {ipActionModal.action === 'ban'
                  ? <ShieldBan className="w-5 h-5 text-coral-400" />
                  : <Unlock className="w-5 h-5 text-emeraldwin-300" />
                }
              </div>
              <div>
                <h3 className="font-display font-bold text-white capitalize">{ipActionModal.action} User</h3>
                <p className="text-xs text-slate-500">
                  {liveUsers.find(u => u.id === ipActionModal.userId)?.username ?? ipActionModal.userId}
                </p>
              </div>
            </div>
            <input
              value={ipActionReason}
              onChange={(e) => setIpActionReason(e.target.value)}
              placeholder="Reason…"
              className="input"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setIpActionModal(null); setIpActionReason(''); }}
                className="flex-1 py-2 rounded-xl bg-slatepanel-700 text-slate-300 text-sm hover:bg-slatepanel-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmIpAction}
                className={`flex-1 py-2 rounded-xl font-semibold text-sm transition-colors ${
                  ipActionModal.action === 'ban'
                    ? 'bg-coral-500/20 border border-coral-500/30 text-coral-300 hover:bg-coral-500/30'
                    : 'bg-emeraldwin-500/20 border border-emeraldwin-500/30 text-emeraldwin-300 hover:bg-emeraldwin-500/30'
                }`}
              >
                Confirm {ipActionModal.action === 'ban' ? 'Ban' : 'Unban'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
