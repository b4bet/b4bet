import { useEffect, useMemo, useState } from 'react';
import { auth, type BanRecord } from '../../lib/auth';
import { bus } from '../../lib/bus';
import { ShieldBan, Search, Unlock, AlertTriangle, Activity, ShieldAlert, ShieldCheck } from 'lucide-react';

function useBannedUsers() {
  const [bans, setBans] = useState<BanRecord[]>(() => auth.getBannedUsers());
  useEffect(() => {
    const unsub = bus.on('auth:bans', (payload) => {
      const all = payload as BanRecord[];
      setBans(all.filter((b) => !b.unbanDate));
    });
    return () => unsub();
  }, []);
  return bans;
}

/** Subscribes to any user/ban change so IP Activity re-renders live. */
function useAllUsers() {
  const [users, setUsers] = useState(() => auth.getUsers());
  useEffect(() => {
    const refresh = () => setUsers(auth.getUsers());
    const unsubBans = bus.on('auth:bans', refresh);
    const unsubAuth = bus.on('auth:state', refresh);
    return () => { unsubBans(); unsubAuth(); };
  }, []);
  return users;
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

function getUserForBan(id: string) {
  return auth.getUserById(id) || auth.getUserByAccountId(id);
}

export default function BanSectionTab() {
  const bans = useBannedUsers();
  const allUsers = useAllUsers();
  const [search, setSearch] = useState('');
  const [banIdInput, setBanIdInput] = useState('');
  const [banReason, setBanReason] = useState('');
  const [unbanId, setUnbanId] = useState<string | null>(null);
  const [unbanReason, setUnbanReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [ipSearch, setIpSearch] = useState('');
  const [ipActionModal, setIpActionModal] = useState<{ userId: string; action: 'ban' | 'unban' } | null>(null);
  const [ipActionReason, setIpActionReason] = useState('');
  const banHistory = useAllBanHistory();

  // Group all registered users by their registration IP.
  // Each group shows every account created from that IP with time/date and
  // current ban status + latest ban/unban reason.
  const ipGroups = useMemo(() => {
    const groups = new Map<string, typeof allUsers>();
    for (const u of allUsers) {
      const ip = u.registrationIp ?? 'unknown';
      const arr = groups.get(ip) ?? [];
      arr.push(u);
      groups.set(ip, arr);
    }
    return Array.from(groups.entries())
      .map(([ip, users]) => ({
        ip,
        users: [...users].sort((a, b) => a.createdAt - b.createdAt),
      }))
      .sort((a, b) => b.users.length - a.users.length);
  }, [allUsers]);

  const multiAccountIpGroups = ipGroups.filter((g) => g.users.length > 1);
  const filteredIpGroups = multiAccountIpGroups.filter((g) => {
    const q = ipSearch.trim().toLowerCase();
    if (!q) return true;
    if (g.ip.toLowerCase().includes(q)) return true;
    return g.users.some(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.accountId.toLowerCase().includes(q),
    );
  });

  function latestBanRecordFor(userId: string): BanRecord | undefined {
    const recs = banHistory.filter((b) => b.userId === userId);
    if (!recs.length) return undefined;
    return [...recs].sort((a, b) => b.banDate - a.banDate)[0];
  }


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

  function handleBanById() {
    const id = banIdInput.trim();
    if (!id) { flash(false, 'Please enter a User ID.'); return; }
    if (!banReason.trim()) { flash(false, 'A ban reason is required.'); return; }
    const user = getUserForBan(id);
    if (!user) { flash(false, `No user found with ID "${id}".`); return; }
    const alreadyBanned = bans.find((b) => b.userId === user.id);
    if (alreadyBanned) { flash(false, `${user.username} is already banned.`); return; }
    const ok = auth.banUser(user.id, banReason.trim());
    if (ok) {
      flash(true, `${user.username} has been banned.`);
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
    const ok = ipActionModal.action === 'ban'
      ? auth.banUser(ipActionModal.userId, reason)
      : auth.unbanUser(ipActionModal.userId, reason);
    if (ok) {
      flash(true, ipActionModal.action === 'ban' ? 'User has been banned.' : 'User has been unbanned.');
      setIpActionModal(null);
      setIpActionReason('');
    } else {
      flash(false, `Failed to ${ipActionModal.action} user.`);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <ShieldBan className="w-5 h-5 text-coral-400" />
        <h2 className="font-display font-bold text-white text-lg">Ban Section</h2>
        <span className="chip bg-coral-500/20 text-coral-300 text-[10px]">{bans.length} banned</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-coral-500/15 border border-coral-500/30 text-coral-300 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="px-4 py-2 rounded-xl bg-emeraldwin-500/15 border border-emeraldwin-500/30 text-emeraldwin-300 text-sm">
          {success}
        </div>
      )}

      {/* Search-to-Ban by User ID */}
      <div className="panel p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ban User by ID</p>
        <div className="flex gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder="User ID (6-digit, e.g. 123456)"
            value={banIdInput}
            onChange={(e) => setBanIdInput(e.target.value)}
            list="user-id-list"
          />
          <datalist id="user-id-list">
            {allUsers.map((u) => (
              <option key={u.id} value={u.accountId}>{u.username} (#{u.accountId})</option>
            ))}
          </datalist>
        </div>
        <input
          className="input w-full text-sm"
          placeholder="Ban reason (required)"
          value={banReason}
          onChange={(e) => setBanReason(e.target.value)}
        />
        <button onClick={handleBanById} className="btn-primary bg-coral-500 hover:bg-coral-400 text-sm px-4 py-2 rounded-xl flex items-center gap-2">
          <ShieldBan className="w-4 h-4" /> Ban User
        </button>
      </div>

      {/* Search banned list */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          className="input w-full pl-9 text-sm"
          placeholder="Search banned users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Banned list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="panel p-6 text-center text-slate-500 text-sm">
            {search ? 'No banned users match your search.' : 'No banned users.'}
          </div>
        )}
        {filtered.map((ban) => (
          <div key={ban.userId} className="panel p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white text-sm">{ban.username}</span>
                  <span className={`chip text-[10px] ${ban.bannedBy === 'system' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-coral-500/20 text-coral-300'}`}>
                    {ban.bannedBy === 'system' ? 'Auto-Ban' : 'Admin'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{ban.email}</p>
                <p className="text-xs text-slate-600 font-mono mt-0.5">ID: {auth.getUserById(ban.userId)?.accountId ?? ban.userId}</p>
              </div>
              <button
                onClick={() => { setUnbanId(ban.userId); setUnbanReason(''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emeraldwin-500/15 border border-emeraldwin-500/30 text-emeraldwin-300 text-xs font-semibold hover:bg-emeraldwin-500/25 transition-colors"
              >
                <Unlock className="w-3.5 h-3.5" /> Unban
              </button>
            </div>
            <div className="text-xs text-slate-400 bg-midnight-900/60 rounded-lg px-3 py-2">
              <span className="text-slate-500">Reason: </span>{ban.banReason}
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-600">
              <span>IP: <span className="text-slate-500 font-mono">{ban.ip}</span></span>
              <span>{new Date(ban.banDate).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Unban modal */}
      {unbanId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="panel w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Unlock className="w-5 h-5 text-emeraldwin-400" />
              <h3 className="font-bold text-white">Unban User</h3>
            </div>
            <p className="text-sm text-slate-400">
              You are unbanning <span className="text-white font-semibold">{bans.find((b) => b.userId === unbanId)?.username}</span>.
              Please provide a reason.
            </p>
            <textarea
              className="input w-full text-sm h-20 resize-none"
              placeholder="Unban reason (required)"
              value={unbanReason}
              onChange={(e) => setUnbanReason(e.target.value)}
            />
            <div className="flex gap-3">
              <button onClick={() => { setUnbanId(null); setUnbanReason(''); }} className="flex-1 py-2 rounded-xl bg-slatepanel-700 text-slate-300 text-sm hover:bg-slatepanel-600 transition-colors">
                Cancel
              </button>
              <button onClick={handleUnban} className="flex-1 py-2 rounded-xl bg-emeraldwin-500 text-white text-sm font-semibold hover:bg-emeraldwin-400 transition-colors">
                Confirm Unban
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Activity: accounts grouped by registration IP ────────────────── */}
      <div className="pt-2 space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-neon-400" />
          <h3 className="font-display font-bold text-white text-base">IP Activity</h3>
          <span className="chip bg-neon-500/20 text-neon-300 text-[10px]">
            {multiAccountIpGroups.length} multi-account IPs
          </span>
        </div>
        <p className="text-xs text-slate-500">
          All accounts grouped by the IP they were registered from — with
          registration time and current ban / unban status.
        </p>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="input w-full pl-9 text-sm"
            placeholder="Search by IP, username, email or ID…"
            value={ipSearch}
            onChange={(e) => setIpSearch(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          {filteredIpGroups.length === 0 && (
            <div className="panel p-6 text-center text-slate-500 text-sm">
              {ipSearch ? 'No IP activity matches your search.' : 'No registration activity yet.'}
            </div>
          )}
          {filteredIpGroups.map((group) => {
            const isMulti = group.users.length > 1;
            return (
              <div key={group.ip} className={`panel p-4 space-y-3 ${isMulti ? 'border border-yellow-500/30' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">IP</span>
                    <span className="font-mono text-sm text-white">{group.ip}</span>
                  </div>
                  <span className={`chip text-[10px] ${isMulti ? 'bg-yellow-500/20 text-yellow-300' : 'bg-slatepanel-700 text-slate-400'}`}>
                    {group.users.length} account{group.users.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="space-y-2">
                  {group.users.map((u) => {
                    const rec = latestBanRecordFor(u.id);
                    const isBanned = u.isActive === false;
                    return (
                      <div key={u.id} className="rounded-lg bg-midnight-900/60 p-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-white text-sm truncate">{u.username}</span>
                              <span className={`chip text-[10px] ${isBanned ? 'bg-coral-500/20 text-coral-300' : 'bg-emeraldwin-500/15 text-emeraldwin-300'}`}>
                                {isBanned ? 'Banned' : 'Active'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                            <p className="text-[10px] text-slate-600 font-mono">
                              ID: {u.accountId} · Registered {new Date(u.createdAt).toLocaleString()}
                            </p>
                          </div>
                          {isBanned ? (
                            <button
                              onClick={() => { setIpActionModal({ userId: u.id, action: 'unban' }); setIpActionReason(''); }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emeraldwin-500/15 border border-emeraldwin-500/30 text-emeraldwin-300 text-[11px] font-semibold hover:bg-emeraldwin-500/25 transition-colors flex-shrink-0"
                            >
                              <ShieldCheck className="w-3 h-3" /> Unban
                            </button>
                          ) : (
                            <button
                              onClick={() => { setIpActionModal({ userId: u.id, action: 'ban' }); setIpActionReason(''); }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-coral-500/15 border border-coral-500/30 text-coral-300 text-[11px] font-semibold hover:bg-coral-500/25 transition-colors flex-shrink-0"
                            >
                              <ShieldAlert className="w-3 h-3" /> Ban
                            </button>
                          )}
                        </div>

                        {rec && (
                          <div className="text-[10px] text-slate-400 border-t border-white/5 pt-1.5 space-y-0.5">
                            <div>
                              <span className="text-coral-400">Ban:</span>{' '}
                              <span className="text-slate-500">{new Date(rec.banDate).toLocaleString()}</span>
                              {' — '}
                              <span className="text-slate-300">{rec.banReason}</span>
                            </div>
                            {rec.unbanDate && (
                              <div>
                                <span className="text-emeraldwin-400">Unban:</span>{' '}
                                <span className="text-slate-500">{new Date(rec.unbanDate).toLocaleString()}</span>
                                {rec.unbanReason ? <>{' — '}<span className="text-slate-300">{rec.unbanReason}</span></> : null}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* IP Activity ban/unban modal */}
      {ipActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="panel w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-2">
              {ipActionModal.action === 'ban' ? (
                <ShieldAlert className="w-5 h-5 text-coral-400" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-emeraldwin-400" />
              )}
              <h3 className="font-bold text-white capitalize">{ipActionModal.action} User</h3>
            </div>
            <p className="text-sm text-slate-400">
              You are {ipActionModal.action === 'ban' ? 'banning' : 'unbanning'}{' '}
              <span className="text-white font-semibold">
                {auth.getUserById(ipActionModal.userId)?.username}
              </span>. Please provide a reason.
            </p>
            <textarea
              className="input w-full text-sm h-20 resize-none"
              placeholder={`${ipActionModal.action === 'ban' ? 'Ban' : 'Unban'} reason (required)`}
              value={ipActionReason}
              onChange={(e) => setIpActionReason(e.target.value)}
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setIpActionModal(null); setIpActionReason(''); }}
                className="flex-1 py-2 rounded-xl bg-slatepanel-700 text-slate-300 text-sm hover:bg-slatepanel-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmIpAction}
                className={`flex-1 py-2 rounded-xl text-white text-sm font-semibold transition-colors ${
                  ipActionModal.action === 'ban'
                    ? 'bg-coral-500 hover:bg-coral-400'
                    : 'bg-emeraldwin-500 hover:bg-emeraldwin-400'
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
