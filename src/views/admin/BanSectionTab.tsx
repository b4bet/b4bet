import { useEffect, useState, useCallback } from 'react';
import {
  supabaseGetUsers, supabaseBanUser, supabaseUnbanUser,
  supabaseGetIpMultiAccounts,
  type SupabaseProfile, type IpMultiAccount,
} from '../../lib/supabaseIntegration';
import {
  ShieldBan, Search, Unlock, AlertTriangle, Activity,
  ShieldAlert, ShieldCheck, RefreshCw, Mail, Phone, Clock, Zap,
} from 'lucide-react';

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useSupabaseUsers() {
  const [users, setUsers] = useState<SupabaseProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supabaseGetUsers();
      setUsers(data);
    } catch (e) {
      console.error('BanSectionTab load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { users, loading, reload: load, setUsers };
}

function useIpMultiAccounts() {
  const [ipData, setIpData] = useState<IpMultiAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supabaseGetIpMultiAccounts();
      setIpData(data);
    } catch (e) {
      console.error('useIpMultiAccounts load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { ipData, loading, reload: load };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(ts: string | undefined | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BanSectionTab() {
  const { users, loading: usersLoading, reload: reloadUsers, setUsers } = useSupabaseUsers();
  const { ipData, loading: ipLoading, reload: reloadIp } = useIpMultiAccounts();

  const [search, setSearch] = useState('');
  const [banIdInput, setBanIdInput] = useState('');
  const [banReason, setBanReason] = useState('');
  const [unbanModal, setUnbanModal] = useState<SupabaseProfile | null>(null);
  const [unbanReason, setUnbanReason] = useState('');
  const [ipSearch, setIpSearch] = useState('');
  const [ipActionModal, setIpActionModal] = useState<{ userId: string; username: string; action: 'ban' | 'unban' } | null>(null);
  const [ipActionReason, setIpActionReason] = useState('');
  const [expandedIp, setExpandedIp] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loading = usersLoading || ipLoading;

  function flash(ok: boolean, msg: string) {
    if (ok) { setSuccess(msg); setError(''); }
    else { setError(msg); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 3000);
  }

  function reload() { void reloadUsers(); void reloadIp(); }

  const bannedUsers = users.filter((u) => u.is_banned === true || u.is_active === false);

  const filtered = bannedUsers.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (u.username ?? '').toLowerCase().includes(q) ||
      (u.display_name ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.account_id ?? '').toLowerCase().includes(q)
    );
  });

  const filteredIpGroups = ipData.filter((g) => {
    const q = ipSearch.trim().toLowerCase();
    if (!q) return true;
    if (g.ip_address.toLowerCase().includes(q)) return true;
    return (
      g.usernames.some((u) => u?.toLowerCase().includes(q)) ||
      g.account_ids.some((a) => a?.toLowerCase().includes(q)) ||
      g.emails.some((e) => e?.toLowerCase().includes(q))
    );
  });

  // ─── Ban by ID ───────────────────────────────────────────────────────────
  async function handleBanById() {
    const id = banIdInput.trim();
    if (!id) { flash(false, 'Please enter a User ID or Account ID.'); return; }
    if (!banReason.trim()) { flash(false, 'A ban reason is required.'); return; }
    const user = users.find(
      (u) => u.id === id || (u.account_id ?? '').toLowerCase() === id.toLowerCase() || (u.username ?? '').toLowerCase() === id.toLowerCase(),
    );
    if (!user) { flash(false, `No user found with ID/username "${id}".`); return; }
    if (user.is_banned) { flash(false, `${user.username ?? user.id} is already banned.`); return; }
    try {
      await supabaseBanUser(user.id, banReason.trim());
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_banned: true, is_active: false } : u));
      flash(true, `${user.username ?? user.id} has been banned.`);
      setBanIdInput(''); setBanReason('');
    } catch {
      flash(false, 'Failed to ban user. Try again.');
    }
  }

  // ─── Unban ────────────────────────────────────────────────────────────────
  async function handleUnban(user: SupabaseProfile, reason: string) {
    try {
      await supabaseUnbanUser(user.id, reason.trim() || 'Unbanned by admin');
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_banned: false, is_active: true } : u));
      flash(true, `${user.username ?? user.id} has been unbanned.`);
      setUnbanModal(null);
      setUnbanReason('');
    } catch {
      flash(false, 'Failed to unban user. Try again.');
    }
  }

  // ─── IP action (ban/unban from IP activity) ───────────────────────────────
  async function confirmIpAction() {
    if (!ipActionModal) return;
    const reason = ipActionReason.trim();
    if (!reason) { flash(false, 'A reason is required.'); return; }
    try {
      if (ipActionModal.action === 'ban') {
        await supabaseBanUser(ipActionModal.userId, reason);
        setUsers((prev) => prev.map((u) => u.id === ipActionModal.userId ? { ...u, is_banned: true, is_active: false } : u));
        flash(true, `${ipActionModal.username} has been banned.`);
      } else {
        await supabaseUnbanUser(ipActionModal.userId, reason);
        setUsers((prev) => prev.map((u) => u.id === ipActionModal.userId ? { ...u, is_banned: false, is_active: true } : u));
        flash(true, `${ipActionModal.username} has been unbanned.`);
      }
      setIpActionModal(null);
      setIpActionReason('');
      void reloadIp();
    } catch {
      flash(false, `Failed to ${ipActionModal.action} user.`);
    }
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldBan className="w-6 h-6 text-coral-400" />
          <div>
            <h1 className="font-display font-bold text-xl text-white">Ban Section</h1>
            <p className="text-xs text-slate-500">
              {bannedUsers.length} banned user{bannedUsers.length !== 1 ? 's' : ''} ·{' '}
              {ipData.length} multi-account IP{ipData.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button onClick={reload} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white text-xs font-semibold disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-coral-500/15 border border-coral-500/30 text-coral-300 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emeraldwin-500/15 border border-emeraldwin-500/30 text-emeraldwin-300 text-sm">
          <ShieldCheck className="w-4 h-4 flex-shrink-0" />{success}
        </div>
      )}

      {/* Auto-ban notice */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-300 text-xs">
        <Zap className="w-4 h-4 flex-shrink-0 mt-0.5 text-violet-400" />
        <div>
          <span className="font-semibold text-violet-200">Auto-ban is active.</span>{' '}
          Any new account that signs up from an IP already linked to an existing account is automatically banned instantly.
        </div>
      </div>

      {/* Ban by ID / Username */}
      <div className="panel p-4 space-y-3">
        <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-coral-400" /> Ban User
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">User ID / Username / Account ID</p>
            <input
              type="text"
              value={banIdInput}
              onChange={(e) => setBanIdInput(e.target.value)}
              placeholder="Enter user ID or username…"
              list="user-list"
              className="input"
            />
            <datalist id="user-list">
              {users.map((u) => (
                <option key={u.id} value={u.username ?? u.id}>{u.username} (#{u.account_id})</option>
              ))}
            </datalist>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Reason</p>
            <input type="text" value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Ban reason…" className="input" />
          </div>
        </div>
        <button onClick={() => void handleBanById()} className="btn-coral px-5 py-2 text-sm">
          Ban User
        </button>
      </div>

      {/* Banned users list */}
      <div className="panel p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
            <ShieldBan className="w-4 h-4 text-coral-400" /> Banned Users
          </h2>
          <span className="text-[10px] bg-coral-500/15 text-coral-300 px-2 py-0.5 rounded-full border border-coral-500/30">{bannedUsers.length}</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input className="input pl-10" placeholder="Search banned users…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="space-y-2">
          {usersLoading && <p className="text-xs text-slate-500 text-center py-4">Loading users…</p>}
          {!usersLoading && filtered.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-4">{search ? 'No banned users match your search.' : 'No banned users.'}</p>
          )}
          {filtered.map((u) => (
            <div key={u.id} className="flex items-center gap-3 bg-slatepanel-800 rounded-xl p-3 border border-borderline-800">
              <div className="w-9 h-9 rounded-full bg-coral-500/20 border border-coral-500/30 grid place-items-center flex-shrink-0">
                <ShieldBan className="w-4 h-4 text-coral-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white text-sm">{u.username ?? '—'}</span>
                  <span className="text-[9px] bg-coral-500/15 text-coral-300 px-1.5 py-0.5 rounded-full border border-coral-500/30">Banned</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{u.email ?? '—'} · #{u.account_id ?? u.id.slice(0, 8)}</p>
                {u.registration_ip && <p className="text-[10px] text-slate-600 mt-0.5">Reg IP: {u.registration_ip}</p>}
              </div>
              <button
                onClick={() => { setUnbanModal(u); setUnbanReason(''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emeraldwin-500/15 border border-emeraldwin-500/30 text-emeraldwin-300 text-xs font-semibold hover:bg-emeraldwin-500/25 transition-colors flex-shrink-0"
              >
                <Unlock className="w-3.5 h-3.5" /> Unban
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Unban confirmation modal */}
      {unbanModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="panel p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <Unlock className="w-5 h-5 text-emeraldwin-300" />
              <h3 className="font-display font-bold text-white">Unban User</h3>
            </div>
            <p className="text-sm text-slate-400">You are unbanning <span className="text-white font-semibold">{unbanModal.username}</span>. This will restore their access.</p>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Reason (optional)</p>
              <input
                type="text"
                value={unbanReason}
                onChange={(e) => setUnbanReason(e.target.value)}
                placeholder="Unban reason…"
                className="input"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setUnbanModal(null); setUnbanReason(''); }} className="flex-1 py-2 rounded-xl bg-slatepanel-700 text-slate-300 text-sm hover:bg-slatepanel-600">Cancel</button>
              <button onClick={() => void handleUnban(unbanModal, unbanReason)} className="flex-1 py-2 rounded-xl bg-emeraldwin-500/20 border border-emeraldwin-500/40 text-emeraldwin-300 text-sm font-semibold">Confirm Unban</button>
            </div>
          </div>
        </div>
      )}

      {/* ── IP Tracker ──────────────────────────────────────────────────────── */}
      <div className="panel p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-neon-300" /> IP Tracker
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              IPs with <span className="text-white font-semibold">2+ accounts</span> — shows name, email, phone, IP, date & time per account.
            </p>
          </div>
          <span className="text-[10px] bg-neon-500/15 text-neon-300 px-2 py-0.5 rounded-full border border-neon-500/30">
            {ipData.length} multi-account IP{ipData.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input className="input pl-10" placeholder="Search by IP, username, email, account ID…" value={ipSearch} onChange={(e) => setIpSearch(e.target.value)} />
        </div>

        {ipLoading && <p className="text-xs text-slate-500 text-center py-4">Loading…</p>}
        {!ipLoading && filteredIpGroups.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-4">
            {ipSearch ? 'No IP activity matches your search.' : 'No multi-account IPs detected yet.'}
          </p>
        )}

        <div className="space-y-3">
          {filteredIpGroups.map((group) => {
            const userCount = Number(group.user_count);
            const isExpanded = expandedIp === group.ip_address;

            return (
              <div key={group.ip_address} className="bg-slatepanel-800 rounded-xl border border-borderline-800 overflow-hidden">
                {/* IP header */}
                <button
                  onClick={() => setExpandedIp(isExpanded ? null : group.ip_address)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slatepanel-700 border-b border-borderline-900 hover:bg-slatepanel-600 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-neon-400 flex-shrink-0" />
                    <span className="font-mono text-sm text-white font-bold">{group.ip_address}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                      userCount >= 3
                        ? 'bg-coral-500/20 border-coral-500/30 text-coral-300'
                        : 'bg-amberx-500/20 border-amberx-500/30 text-amberx-300'
                    }`}>
                      {userCount} accounts
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div className="hidden sm:block text-right">
                      <p className="text-[10px] text-slate-500">Last seen</p>
                      <p className="text-[10px] text-slate-300">{fmt(group.last_seen)}</p>
                    </div>
                    <span className="text-slate-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded user rows */}
                {isExpanded && (
                  <div className="divide-y divide-borderline-900/50">
                    {group.user_ids.map((userId, idx) => {
                      const username    = group.usernames[idx] ?? '—';
                      const accountId  = group.account_ids[idx] ?? '—';
                      const email      = group.emails?.[idx] ?? '';
                      const phone      = group.phones?.[idx] ?? '';
                      const signupTime = group.signup_times?.[idx] ?? '';
                      const profile    = users.find((u) => u.id === userId);
                      const isBanned   = profile
                        ? (profile.is_banned === true || profile.is_active === false)
                        : false;

                      return (
                        <div key={userId ?? idx} className="px-4 py-3 space-y-1.5">
                          {/* Row 1: name + status + action */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className={`w-7 h-7 rounded-full grid place-items-center flex-shrink-0 ${isBanned ? 'bg-coral-500/20' : 'bg-emeraldwin-500/15'}`}>
                              {isBanned
                                ? <ShieldBan className="w-3.5 h-3.5 text-coral-400" />
                                : <ShieldCheck className="w-3.5 h-3.5 text-emeraldwin-400" />}
                            </div>
                            <span className="text-sm font-semibold text-white">{username}</span>
                            {/* FIX: was a broken regular string, now a proper template literal */}
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold flex-shrink-0 ${isBanned ? 'bg-coral-500/15 border-coral-500/30 text-coral-300' : 'bg-emeraldwin-500/10 border-emeraldwin-500/20 text-emeraldwin-400'}`}>
                              {isBanned ? 'Banned' : 'Active'}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">#{accountId}</span>
                            <div className="ml-auto flex-shrink-0">
                              {userId && (
                                isBanned ? (
                                  <button
                                    onClick={() => { setIpActionModal({ userId, username, action: 'unban' }); setIpActionReason(''); }}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emeraldwin-500/15 border border-emeraldwin-500/30 text-emeraldwin-300 text-[11px] font-semibold hover:bg-emeraldwin-500/25 transition-colors"
                                  >
                                    Unban
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => { setIpActionModal({ userId, username, action: 'ban' }); setIpActionReason(''); }}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-coral-500/15 border border-coral-500/30 text-coral-300 text-[11px] font-semibold hover:bg-coral-500/25 transition-colors"
                                  >
                                    Ban
                                  </button>
                                )
                              )}
                            </div>
                          </div>

                          {/* Row 2: detail chips */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 pl-9">
                            {email && (
                              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                <Mail className="w-3 h-3 text-slate-500" />{email}
                              </span>
                            )}
                            {phone && (
                              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                <Phone className="w-3 h-3 text-slate-500" />{phone}
                              </span>
                            )}
                            {signupTime && (
                              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                <Clock className="w-3 h-3 text-slate-500" />{fmt(signupTime)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Collapsed summary */}
                {!isExpanded && (
                  <div className="px-4 py-2 flex flex-wrap gap-x-3 gap-y-1">
                    {group.usernames.slice(0, 4).map((u, i) => (
                      <span key={i} className="text-[10px] text-slate-400 truncate max-w-[120px]">{u ?? '—'}</span>
                    ))}
                    {group.usernames.length > 4 && (
                      <span className="text-[10px] text-slate-500">+{group.usernames.length - 4} more</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* IP Action modal */}
      {ipActionModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="panel p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              {ipActionModal.action === 'ban'
                ? <ShieldBan className="w-5 h-5 text-coral-400" />
                : <Unlock className="w-5 h-5 text-emeraldwin-300" />}
              <h3 className="font-display font-bold text-white capitalize">{ipActionModal.action} User</h3>
            </div>
            <p className="text-sm text-slate-400">
              You are {ipActionModal.action === 'ban' ? 'banning' : 'unbanning'}{' '}
              <span className="text-white font-semibold">{ipActionModal.username}</span>. Please provide a reason.
            </p>
            <input
              type="text"
              value={ipActionReason}
              onChange={(e) => setIpActionReason(e.target.value)}
              placeholder="Reason…"
              className="input"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setIpActionModal(null); setIpActionReason(''); }}
                className="flex-1 py-2 rounded-xl bg-slatepanel-700 text-slate-300 text-sm hover:bg-slatepanel-600"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmIpAction()}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold ${
                  ipActionModal.action === 'ban'
                    ? 'bg-coral-500/20 border border-coral-500/40 text-coral-300'
                    : 'bg-emeraldwin-500/20 border border-emeraldwin-500/40 text-emeraldwin-300'
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
