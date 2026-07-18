import { useEffect, useState, useCallback } from 'react';
import { auth, type BanRecord } from '../../lib/auth';
import { bus } from '../../lib/bus';
import { supabase } from '../../integrations/supabase/client';
import { ShieldBan, Search, Unlock, AlertTriangle, Activity, ShieldAlert, ShieldCheck, RefreshCw, Wifi, Hash } from 'lucide-react';

function useBannedUsers() {
  const [bans, setBans] = useState<BanRecord[]>(() => auth.getBannedUsers());
  useEffect(() => {
    void auth.loadBansFromSupabase();
    const unsub = bus.on('auth:bans', (payload) => {
      const all = payload as BanRecord[];
      setBans(all.filter((b) => !b.unbanDate));
    });
    return () => unsub();
  }, []);
  return bans;
}

function useLiveUsers() {
  const [users, setUsers] = useState<{ id: string; username: string; account_id: string; is_active: boolean }[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.rpc('admin_get_profiles');
      if (data) setUsers((data as { id: string; username: string | null; account_id: string; is_active: boolean }[]).map(u => ({
        id: u.id, username: u.username ?? '', account_id: u.account_id ?? '', is_active: u.is_active ?? true,
      })));
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  return { users, loading, reload: load };
}

// Real multi-account detection from ip_logs
interface IpMultiGroup {
  ip_address: string;
  user_count: number;
  user_ids: string[];
  usernames: string[];
  account_ids: string[];
  last_seen: string;
}

function useMultiAccounts() {
  const [groups, setGroups] = useState<IpMultiGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_ip_multi_accounts', { p_limit: 100 });
      if (error) throw error;
      setGroups((data ?? []) as IpMultiGroup[]);
    } catch (e) {
      console.error('[BanSectionTab] multiAccounts error:', e);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { groups, loading, reload: load };
}

export default function BanSectionTab() {
  const bans = useBannedUsers();
  const { users: liveUsers, loading: usersLoading } = useLiveUsers();
  const { groups: multiGroups, loading: multiLoading, reload: reloadMulti } = useMultiAccounts();

  const [search, setSearch] = useState('');
  const [banIdInput, setBanIdInput] = useState('');
  const [banReason, setBanReason] = useState('');
  const [unbanId, setUnbanId] = useState<string | null>(null);
  const [unbanReason, setUnbanReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [ipSearch, setIpSearch] = useState('');
  const [ipActionModal, setIpActionModal] = useState<{ userId: string; username: string; action: 'ban' | 'unban' } | null>(null);
  const [ipActionReason, setIpActionReason] = useState('');

  const filtered = bans.filter((b) => {
    const q = search.toLowerCase();
    return !q || b.username.toLowerCase().includes(q) || b.userId.toLowerCase().includes(q) || b.email.toLowerCase().includes(q) || b.ip.includes(q);
  });

  const filteredGroups = multiGroups.filter((g) => {
    if (!ipSearch) return true;
    const s = ipSearch.toLowerCase();
    return g.ip_address.toLowerCase().includes(s) || g.usernames.some(u => u.toLowerCase().includes(s)) || g.account_ids.some(a => a.includes(s));
  });

  function flash(ok: boolean, msg: string) {
    if (ok) { setSuccess(msg); setError(''); } else { setError(msg); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 3000);
  }

  function resolveUserByInput(input: string) {
    const t = input.trim();
    return liveUsers.find(u => u.account_id === t) || liveUsers.find(u => u.id === t) || liveUsers.find(u => u.username.toLowerCase() === t.toLowerCase());
  }

  function handleBanById() {
    const id = banIdInput.trim();
    if (!id) { flash(false, 'Please enter a User ID or Account ID.'); return; }
    if (!banReason.trim()) { flash(false, 'A ban reason is required.'); return; }
    const user = resolveUserByInput(id);
    if (!user) { flash(false, `No user found with ID "${id}". Use the 6-digit Account ID shown in the Users tab.`); return; }
    if (bans.find((b) => b.userId === user.id)) { flash(false, `${user.username} is already banned.`); return; }
    const ok = auth.banUser(user.id, banReason.trim());
    if (ok) {
      flash(true, `${user.username} (ID: ${user.account_id}) has been banned.`);
      setBanIdInput(''); setBanReason('');
    } else flash(false, 'Failed to ban user.');
  }

  function handleUnban() {
    if (!unbanId) return;
    if (!unbanReason.trim()) { flash(false, 'An unban reason is required.'); return; }
    const ok = auth.unbanUser(unbanId, unbanReason.trim());
    if (ok) { flash(true, 'User has been unbanned.'); setUnbanId(null); setUnbanReason(''); }
    else flash(false, 'Failed to unban user.');
  }

  function confirmIpAction() {
    if (!ipActionModal) return;
    if (!ipActionReason.trim()) { flash(false, 'A reason is required.'); return; }
    const ok = ipActionModal.action === 'ban'
      ? auth.banUser(ipActionModal.userId, ipActionReason)
      : auth.unbanUser(ipActionModal.userId, ipActionReason);
    if (ok) {
      flash(true, ipActionModal.action === 'ban' ? `${ipActionModal.username} banned.` : 'User unbanned.');
      setIpActionModal(null); setIpActionReason('');
      void reloadMulti();
    } else flash(false, `Failed to ${ipActionModal.action} user.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
            <ShieldBan className="w-5 h-5 text-coral-400" /> Ban Section
          </h2>
          <p className="text-xs text-slate-500">Bans saved to Supabase. Multi-account detection uses real IP logs.</p>
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

      {/* Ban user panel */}
      <div className="panel p-4 space-y-3">
        <div>
          <h3 className="font-display font-bold text-white text-sm flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-coral-400" /> Ban User by Account ID
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Enter the <span className="text-neon-300 font-semibold">6-digit Account ID</span> shown in the Users tab, or their username/UUID.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Account ID / Username / UUID</p>
            <input value={banIdInput} onChange={(e) => setBanIdInput(e.target.value)}
              placeholder="e.g. 483920 or username" className="input" list="live-user-list" />
            <datalist id="live-user-list">
              {liveUsers.map((u) => (
                <option key={u.id} value={u.account_id}>{u.username} (#{u.account_id})</option>
              ))}
            </datalist>
            {usersLoading && <p className="text-[10px] text-slate-500 mt-0.5">Loading users…</p>}
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Ban Reason</p>
            <input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Reason for ban" className="input" />
          </div>
        </div>
        <button onClick={handleBanById} className="btn-coral px-4 py-2 text-sm">Ban User</button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search banned users…" className="input pl-10" />
      </div>

      {/* Banned list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            {search ? 'No banned users match your search.' : 'No banned users.'}
          </div>
        )}
        {filtered.map((ban) => {
          const lu = liveUsers.find(u => u.id === ban.userId);
          return (
            <div key={ban.userId} className="panel p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-coral-500/15 border border-coral-500/30 grid place-items-center flex-shrink-0">
                <ShieldBan className="w-4 h-4 text-coral-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white">{ban.username}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                    ban.bannedBy === 'system' ? 'bg-amberx-500/15 border-amberx-500/30 text-amberx-300' : 'bg-coral-500/15 border-coral-500/30 text-coral-300'
                  }`}>{ban.bannedBy === 'system' ? 'Auto-Ban' : 'Admin'}</span>
                  {lu?.account_id && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-neon-500/10 border border-neon-500/20 font-mono font-bold text-neon-300 text-[10px]">
                      <Hash className="w-2.5 h-2.5" />#{lu.account_id}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">{ban.email}</p>
                <p className="text-[11px] text-slate-500">Reason: <span className="text-slate-300">{ban.banReason}</span></p>
                <p className="text-[10px] text-slate-600 mt-0.5">IP: {ban.ip} · {new Date(ban.banDate).toLocaleString()}</p>
              </div>
              <button onClick={() => { setUnbanId(ban.userId); setUnbanReason(''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emeraldwin-500/15 border border-emeraldwin-500/30 text-emeraldwin-300 text-xs font-semibold hover:bg-emeraldwin-500/25 transition-colors flex-shrink-0">
                <Unlock className="w-3 h-3" /> Unban
              </button>
            </div>
          );
        })}
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
                <p className="text-xs text-slate-500">{bans.find((b) => b.userId === unbanId)?.username} will be reactivated.</p>
              </div>
            </div>
            <input value={unbanReason} onChange={(e) => setUnbanReason(e.target.value)} placeholder="Unban reason…" className="input" />
            <div className="flex gap-2">
              <button onClick={() => { setUnbanId(null); setUnbanReason(''); }} className="flex-1 py-2 rounded-xl bg-slatepanel-700 text-slate-300 text-sm hover:bg-slatepanel-600">Cancel</button>
              <button onClick={handleUnban} className="flex-1 py-2 rounded-xl bg-emeraldwin-500/20 border border-emeraldwin-500/30 text-emeraldwin-300 font-semibold text-sm hover:bg-emeraldwin-500/30">Confirm Unban</button>
            </div>
          </div>
        </div>
      )}

      {/* Real IP Multi-Account Section */}
      <div className="panel p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-amberx-400" /> Multi-Account Detection
            <span className="text-[9px] bg-amberx-500/15 border border-amberx-500/30 text-amberx-300 px-1.5 py-0.5 rounded-full">
              {multiGroups.length} shared IPs
            </span>
          </h3>
          <button onClick={() => void reloadMulti()} disabled={multiLoading}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white text-[10px] font-semibold disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${multiLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Users sharing the same IP address from <span className="text-neon-300">ip_logs</span> table. Real-time Supabase data.
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input value={ipSearch} onChange={(e) => setIpSearch(e.target.value)} placeholder="Search by IP or username…" className="input pl-9 text-sm" />
        </div>
        <div className="space-y-3">
          {multiLoading ? (
            <div className="text-center py-4 text-slate-500 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />Loading IP logs…
            </div>
          ) : filteredGroups.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">
              {ipSearch ? 'No results match your search.' : 'No shared IPs detected in ip_logs.'}
            </p>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.ip_address} className="bg-slatepanel-800 rounded-xl border border-borderline-900 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">IP</span>
                    <span className="font-mono text-xs text-white font-semibold">{group.ip_address}</span>
                    <span className="text-[9px] text-slate-600">· Last seen {new Date(group.last_seen).toLocaleDateString('en-IN')}</span>
                  </div>
                  <span className="text-[9px] bg-amberx-500/10 border border-amberx-500/20 text-amberx-300 px-1.5 py-0.5 rounded-full">
                    {group.user_count} accounts
                  </span>
                </div>
                <div className="space-y-2">
                  {group.user_ids.map((uid, i) => {
                    const uname = group.usernames[i] ?? 'Unknown';
                    const accId = group.account_ids[i] ?? '';
                    const isBanned = bans.some(b => b.userId === uid);
                    return (
                      <div key={uid} className="flex items-center gap-2 text-[11px]">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isBanned ? 'bg-coral-400' : 'bg-emeraldwin-400'}`} />
                        <span className="font-semibold text-white">{uname}</span>
                        {accId && (
                          <span className="font-mono text-neon-300 text-[10px] bg-neon-500/10 px-1 rounded">#{accId}</span>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isBanned ? 'text-coral-300 bg-coral-500/10' : 'text-emeraldwin-300 bg-emeraldwin-500/10'}`}>
                          {isBanned ? 'Banned' : 'Active'}
                        </span>
                        <div className="ml-auto flex gap-1">
                          {!isBanned ? (
                            <button onClick={() => { setIpActionModal({ userId: uid, username: uname, action: 'ban' }); setIpActionReason(''); }}
                              className="px-2 py-0.5 rounded-lg bg-coral-500/15 border border-coral-500/30 text-coral-300 text-[10px] font-semibold">
                              Ban
                            </button>
                          ) : (
                            <button onClick={() => { setIpActionModal({ userId: uid, username: uname, action: 'unban' }); setIpActionReason(''); }}
                              className="px-2 py-0.5 rounded-lg bg-emeraldwin-500/15 border border-emeraldwin-500/30 text-emeraldwin-300 text-[10px] font-semibold">
                              Unban
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* IP Action modal */}
      {ipActionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 grid place-items-center p-4">
          <div className="panel p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl grid place-items-center ${
                ipActionModal.action === 'ban' ? 'bg-coral-500/15 border border-coral-500/30' : 'bg-emeraldwin-500/15 border border-emeraldwin-500/30'
              }`}>
                {ipActionModal.action === 'ban' ? <ShieldBan className="w-5 h-5 text-coral-400" /> : <Unlock className="w-5 h-5 text-emeraldwin-300" />}
              </div>
              <div>
                <h3 className="font-display font-bold text-white capitalize">{ipActionModal.action} User</h3>
                <p className="text-xs text-slate-500">{ipActionModal.username}</p>
              </div>
            </div>
            <input value={ipActionReason} onChange={(e) => setIpActionReason(e.target.value)} placeholder="Reason…" className="input" />
            <div className="flex gap-2">
              <button onClick={() => { setIpActionModal(null); setIpActionReason(''); }}
                className="flex-1 py-2 rounded-xl bg-slatepanel-700 text-slate-300 text-sm">Cancel</button>
              <button onClick={confirmIpAction}
                className={`flex-1 py-2 rounded-xl font-semibold text-sm ${
                  ipActionModal.action === 'ban'
                    ? 'bg-coral-500/20 border border-coral-500/30 text-coral-300 hover:bg-coral-500/30'
                    : 'bg-emeraldwin-500/20 border border-emeraldwin-500/30 text-emeraldwin-300 hover:bg-emeraldwin-500/30'
                }`}>
                Confirm {ipActionModal.action === 'ban' ? 'Ban' : 'Unban'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
