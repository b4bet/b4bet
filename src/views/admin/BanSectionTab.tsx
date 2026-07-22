import { useEffect, useState, useCallback } from 'react';
import {
  supabaseGetUsers,
  supabaseBanUser,
  supabaseUnbanUser,
  supabaseGetIpMultiAccounts,
  supabaseGetBans,
  supabaseGetSettings,
  supabaseUpdateSetting,
  type SupabaseProfile,
  type IpMultiAccount,
  type SupabaseBan,
} from '../../lib/supabaseIntegration';
import {
  ShieldBan, Search, Unlock, AlertTriangle, Activity,
  ShieldAlert, ShieldCheck, RefreshCw, Mail, Phone, Clock, Zap,
  History, ChevronDown, ChevronUp, User, ToggleLeft, ToggleRight,
} from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(ts: string | undefined | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── hooks ────────────────────────────────────────────────────────────────────

function useSupabaseUsers() {
  const [users, setUsers] = useState<SupabaseProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await supabaseGetUsers()); }
    catch (e) { console.error('BanSectionTab users load error:', e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { users, loading, reload: load, setUsers };
}

function useIpMultiAccounts() {
  const [ipData, setIpData] = useState<IpMultiAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setIpData(await supabaseGetIpMultiAccounts()); }
    catch (e) { console.error('useIpMultiAccounts load error:', e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { ipData, loading, reload: load };
}

function useBanHistory() {
  const [bans, setBans] = useState<SupabaseBan[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setBans(await supabaseGetBans()); }
    catch (e) { console.error('useBanHistory load error:', e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { bans, loading, reload: load };
}

type SubTab = 'banned' | 'ip' | 'history';

// ─── main component ───────────────────────────────────────────────────────────

export default function BanSectionTab() {
  const { users, loading: usersLoading, reload: reloadUsers, setUsers } = useSupabaseUsers();
  const { ipData, loading: ipLoading, reload: reloadIp } = useIpMultiAccounts();
  const { bans: banHistory, loading: bansLoading, reload: reloadBans } = useBanHistory();

  const [subTab, setSubTab] = useState<SubTab>('banned');
  const [search, setSearch] = useState('');
  const [banIdInput, setBanIdInput] = useState('');
  const [banReason, setBanReason] = useState('');
  const [unbanModal, setUnbanModal] = useState<SupabaseProfile | null>(null);
  const [unbanReason, setUnbanReason] = useState('');
  const [ipSearch, setIpSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [ipActionModal, setIpActionModal] = useState<{ userId: string; username: string; action: 'ban' | 'unban' } | null>(null);
  const [ipActionReason, setIpActionReason] = useState('');
  const [expandedIp, setExpandedIp] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── Auto-ban toggle ──────────────────────────────────────────────────────
  const [autoBanEnabled, setAutoBanEnabled] = useState(true);
  const [autoBanLoading, setAutoBanLoading] = useState(true);

  // ── Support email ────────────────────────────────────────────────────────
  const [supportEmail, setSupportEmail] = useState('support@b4bet.com');
  const [supportEmailInput, setSupportEmailInput] = useState('support@b4bet.com');
  const [supportEmailSaving, setSupportEmailSaving] = useState(false);

  // Load settings
  useEffect(() => {
    void (async () => {
      try {
        const settings = await supabaseGetSettings();
        const ab = settings.find((s) => s.key === 'auto_ban_enabled');
        if (ab !== undefined) setAutoBanEnabled(String(ab.value) === 'true');
        const se = settings.find((s) => s.key === 'support_email');
        if (se) {
          const email = String(se.value).replace(/^"|"$/g, '');
          setSupportEmail(email);
          setSupportEmailInput(email);
        }
      } catch (e) { console.error('settings load error:', e); }
      finally { setAutoBanLoading(false); }
    })();
  }, []);

  const loading = usersLoading || ipLoading || bansLoading;

  function flash(ok: boolean, msg: string) {
    if (ok) { setSuccess(msg); setError(''); }
    else { setError(msg); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 3500);
  }

  function reload() { void reloadUsers(); void reloadIp(); void reloadBans(); }

  const bannedUsers = users.filter((u) => u.is_banned === true || u.is_active === false);

  const filteredBanned = bannedUsers.filter((u) => {
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

  const filteredHistory = banHistory.filter((b) => {
    const q = historySearch.toLowerCase();
    if (!q) return true;
    return (
      (b.username ?? '').toLowerCase().includes(q) ||
      (b.email ?? '').toLowerCase().includes(q) ||
      (b.account_id ?? '').toLowerCase().includes(q) ||
      (b.ip ?? '').toLowerCase().includes(q) ||
      (b.ban_reason ?? '').toLowerCase().includes(q)
    );
  });

  // ── toggle auto-ban ──────────────────────────────────────────────────────
  async function toggleAutoBan() {
    const newVal = !autoBanEnabled;
    setAutoBanEnabled(newVal);
    try {
      await supabaseUpdateSetting('auto_ban_enabled', String(newVal));
      flash(true, `Auto-ban ${newVal ? 'enabled' : 'disabled'}.`);
    } catch {
      setAutoBanEnabled(!newVal);
      flash(false, 'Failed to update auto-ban setting.');
    }
  }

  // ── save support email ───────────────────────────────────────────────────
  async function saveSupportEmail() {
    const email = supportEmailInput.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      flash(false, 'Please enter a valid email address.'); return;
    }
    setSupportEmailSaving(true);
    try {
      await supabaseUpdateSetting('support_email', `"${email}"`);
      setSupportEmail(email);
      flash(true, 'Support email updated.');
    } catch {
      flash(false, 'Failed to save support email.');
    } finally { setSupportEmailSaving(false); }
  }

  // ── ban by ID ────────────────────────────────────────────────────────────
  async function handleBanById() {
    const id = banIdInput.trim();
    if (!id) { flash(false, 'Please enter a User ID, username, or Account ID.'); return; }
    if (!banReason.trim()) { flash(false, 'A ban reason is required.'); return; }
    const user = users.find(
      (u) => u.id === id ||
        (u.account_id ?? '').toLowerCase() === id.toLowerCase() ||
        (u.username ?? '').toLowerCase() === id.toLowerCase(),
    );
    if (!user) { flash(false, `No user found for "${id}".`); return; }
    if (user.is_banned) { flash(false, `${user.username ?? user.id} is already banned.`); return; }
    try {
      await supabaseBanUser(user.id, banReason.trim());
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_banned: true, is_active: false } : u));
      flash(true, `${user.username ?? user.id} has been banned.`);
      setBanIdInput(''); setBanReason('');
      void reloadBans();
    } catch { flash(false, 'Failed to ban user. Please try again.'); }
  }

  // ── unban ────────────────────────────────────────────────────────────────
  async function handleUnban(user: SupabaseProfile, reason: string) {
    try {
      await supabaseUnbanUser(user.id, reason.trim() || 'Unbanned by admin');
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_banned: false, is_active: true } : u));
      flash(true, `${user.username ?? user.id} has been unbanned.`);
      setUnbanModal(null); setUnbanReason('');
      void reloadBans();
    } catch { flash(false, 'Failed to unban user. Please try again.'); }
  }

  // ── IP action ────────────────────────────────────────────────────────────
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
      setIpActionModal(null); setIpActionReason('');
      void reloadIp(); void reloadBans();
    } catch { flash(false, `Failed to ${ipActionModal.action} user.`); }
  }

  return (
    <div className="space-y-4 pb-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <ShieldBan className="w-6 h-6 text-coral-400" />
          <div>
            <h1 className="font-display font-bold text-xl text-white">Ban Section</h1>
            <p className="text-xs text-slate-500">
              {bannedUsers.length} banned · {ipData.length} multi-account IPs · {banHistory.length} ban records
            </p>
          </div>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* ── Alerts ── */}
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

      {/* ── Settings panel (auto-ban + support email) ── */}
      <div className="panel p-4 space-y-4">
        <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
          <Zap className="w-4 h-4 text-violet-400" /> Settings
        </h2>

        {/* Auto-ban toggle */}
        <div className="flex items-center justify-between gap-4 py-2 border-b border-borderline-900">
          <div>
            <p className="text-sm font-semibold text-white">Auto-Ban Duplicate IP</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Automatically ban new accounts that sign up from an IP already linked to another account.
            </p>
          </div>
          <button
            onClick={() => void toggleAutoBan()}
            disabled={autoBanLoading}
            className="flex-shrink-0 disabled:opacity-50"
            title={autoBanEnabled ? 'Auto-ban is ON — click to disable' : 'Auto-ban is OFF — click to enable'}
          >
            {autoBanEnabled
              ? <ToggleRight className="w-10 h-10 text-neon-400" />
              : <ToggleLeft className="w-10 h-10 text-slate-600" />}
          </button>
        </div>

        {/* Support email */}
        <div>
          <p className="text-sm font-semibold text-white mb-1">Support Email</p>
          <p className="text-[11px] text-slate-500 mb-2">
            Shown in the ban popup so banned users can contact support.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={supportEmailInput}
              onChange={(e) => setSupportEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void saveSupportEmail(); }}
              placeholder="support@example.com"
              className="input flex-1"
            />
            <button
              onClick={() => void saveSupportEmail()}
              disabled={supportEmailSaving}
              className="px-4 py-2 rounded-xl bg-neon-500/20 border border-neon-500/40 text-neon-300 text-sm font-semibold hover:bg-neon-500/30 disabled:opacity-50"
            >
              {supportEmailSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-1">Current: {supportEmail}</p>
        </div>
      </div>

      {/* ── Quick ban form ── */}
      <div className="panel p-4 space-y-3">
        <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-coral-400" /> Ban a User
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Username / User ID / Account ID</p>
            <input
              type="text"
              value={banIdInput}
              onChange={(e) => setBanIdInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleBanById(); }}
              placeholder="e.g. john_doe or 123456"
              list="ban-user-list"
              className="input"
            />
            <datalist id="ban-user-list">
              {users
                .filter((u) => !u.is_banned)
                .map((u) => (
                  <option key={u.id} value={u.username ?? u.id}>
                    {u.username} (#{u.account_id})
                  </option>
                ))}
            </datalist>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Reason</p>
            <input
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleBanById(); }}
              placeholder="Ban reason…"
              className="input"
            />
          </div>
        </div>
        <button onClick={() => void handleBanById()} className="btn-coral px-5 py-2 text-sm">
          Ban User
        </button>
      </div>

      {/* ── Sub-tabs ── */}
      <div className="flex gap-1 border-b border-borderline-900">
        {([
          { key: 'banned' as SubTab, label: `Banned (${bannedUsers.length})`, icon: ShieldBan },
          { key: 'ip' as SubTab, label: `IP Tracker (${ipData.length})`, icon: Activity },
          { key: 'history' as SubTab, label: `Ban History (${banHistory.length})`, icon: History },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
              subTab === key
                ? 'text-neon-300 border-neon-400'
                : 'text-slate-500 border-transparent hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ══════════════════ SUB-TAB: BANNED USERS ══════════════════ */}
      {subTab === 'banned' && (
        <div className="panel p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              className="input pl-10"
              placeholder="Search by username, email, account ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {usersLoading && <p className="text-xs text-slate-500 text-center py-6">Loading users…</p>}
          {!usersLoading && filteredBanned.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-6">
              {search ? 'No banned users match your search.' : 'No banned users.'}
            </p>
          )}

          <div className="space-y-2">
            {filteredBanned.map((u) => (
              <div key={u.id} className="flex items-center gap-3 bg-slatepanel-800 rounded-xl p-3 border border-borderline-800">
                <div className="w-9 h-9 rounded-full bg-coral-500/20 border border-coral-500/30 grid place-items-center flex-shrink-0">
                  <ShieldBan className="w-4 h-4 text-coral-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm truncate">{u.username ?? '—'}</span>
                    <span className="text-[9px] bg-coral-500/15 text-coral-300 px-1.5 py-0.5 rounded-full border border-coral-500/30 flex-shrink-0">Banned</span>
                    <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">#{u.account_id ?? u.id.slice(0, 8)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {u.email ?? '—'}{u.phone ? ` · ${u.phone}` : ''}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    Joined {fmt(u.created_at)}{u.registration_ip ? ` · IP: ${u.registration_ip}` : ''}
                  </p>
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
      )}

      {/* ══════════════════ SUB-TAB: IP TRACKER ══════════════════ */}
      {subTab === 'ip' && (
        <div className="panel p-4 space-y-3">
          <p className="text-[11px] text-slate-500">
            IPs with <span className="text-white font-semibold">2+ accounts</span> — username, email, phone, account ID, signup date per account.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              className="input pl-10"
              placeholder="Search by IP, username, email, account ID…"
              value={ipSearch}
              onChange={(e) => setIpSearch(e.target.value)}
            />
          </div>

          {ipLoading && <p className="text-xs text-slate-500 text-center py-6">Loading…</p>}
          {!ipLoading && filteredIpGroups.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-6">
              {ipSearch ? 'No results.' : 'No multi-account IPs detected yet.'}
            </p>
          )}

          <div className="space-y-3">
            {filteredIpGroups.map((group) => {
              const userCount = Number(group.user_count);
              const isExpanded = expandedIp === group.ip_address;
              return (
                <div key={group.ip_address} className="bg-slatepanel-800 rounded-xl border border-borderline-800 overflow-hidden">
                  <button
                    onClick={() => setExpandedIp(isExpanded ? null : group.ip_address)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-slatepanel-700 border-b border-borderline-900 hover:bg-slatepanel-600 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Activity className="w-4 h-4 text-neon-400 flex-shrink-0" />
                      <span className="font-mono text-sm text-white font-bold">{group.ip_address}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                        userCount >= 3 ? 'bg-coral-500/20 border-coral-500/30 text-coral-300' : 'bg-amberx-500/20 border-amberx-500/30 text-amberx-300'
                      }`}>{userCount} accounts</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden sm:block text-right">
                        <p className="text-[10px] text-slate-500">Last seen</p>
                        <p className="text-[10px] text-slate-300">{fmt(group.last_seen)}</p>
                      </div>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="divide-y divide-borderline-900/50">
                      {group.user_ids.map((userId, idx) => {
                        const username   = group.usernames[idx] ?? '—';
                        const accountId  = group.account_ids[idx] ?? '—';
                        const email      = group.emails?.[idx] ?? '';
                        const phone      = group.phones?.[idx] ?? '';
                        const signupTime = group.signup_times?.[idx] ?? '';
                        const profile    = users.find((u) => u.id === userId);
                        const isBanned   = profile ? (profile.is_banned === true || profile.is_active === false) : false;
                        return (
                          <div key={userId ?? idx} className="px-4 py-3 space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className={`w-7 h-7 rounded-full grid place-items-center flex-shrink-0 ${isBanned ? 'bg-coral-500/20' : 'bg-emeraldwin-500/15'}`}>
                                {isBanned ? <ShieldBan className="w-3.5 h-3.5 text-coral-400" /> : <ShieldCheck className="w-3.5 h-3.5 text-emeraldwin-400" />}
                              </div>
                              <span className="text-sm font-semibold text-white">{username}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold flex-shrink-0 ${
                                isBanned ? 'bg-coral-500/15 border-coral-500/30 text-coral-300' : 'bg-emeraldwin-500/10 border-emeraldwin-500/20 text-emeraldwin-400'
                              }`}>{isBanned ? 'Banned' : 'Active'}</span>
                              <span className="text-[10px] text-slate-500 font-mono">#{accountId}</span>
                              {userId && (
                                <div className="ml-auto flex-shrink-0">
                                  {isBanned ? (
                                    <button onClick={() => { setIpActionModal({ userId, username, action: 'unban' }); setIpActionReason(''); }}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emeraldwin-500/15 border border-emeraldwin-500/30 text-emeraldwin-300 text-[11px] font-semibold hover:bg-emeraldwin-500/25 transition-colors">
                                      Unban
                                    </button>
                                  ) : (
                                    <button onClick={() => { setIpActionModal({ userId, username, action: 'ban' }); setIpActionReason(''); }}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-coral-500/15 border border-coral-500/30 text-coral-300 text-[11px] font-semibold hover:bg-coral-500/25 transition-colors">
                                      Ban
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 pl-9">
                              {email && <span className="flex items-center gap-1 text-[10px] text-slate-400"><Mail className="w-3 h-3 text-slate-500" />{email}</span>}
                              {phone && <span className="flex items-center gap-1 text-[10px] text-slate-400"><Phone className="w-3 h-3 text-slate-500" />{phone}</span>}
                              {signupTime && <span className="flex items-center gap-1 text-[10px] text-slate-400"><Clock className="w-3 h-3 text-slate-500" />{fmt(signupTime)}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!isExpanded && (
                    <div className="px-4 py-2 flex flex-wrap gap-x-3 gap-y-1">
                      {group.usernames.slice(0, 5).map((u, i) => (
                        <span key={i} className="text-[10px] text-slate-400 truncate max-w-[120px]">{u ?? '—'}</span>
                      ))}
                      {group.usernames.length > 5 && <span className="text-[10px] text-slate-500">+{group.usernames.length - 5} more</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════ SUB-TAB: BAN HISTORY ══════════════════ */}
      {subTab === 'history' && (
        <div className="panel p-4 space-y-3">
          <p className="text-[11px] text-slate-500">
            Full ban/unban history — username, 6-digit account ID, date/time, email, phone, IP, reason.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              className="input pl-10"
              placeholder="Search by username, email, account ID, IP, reason…"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
          </div>

          {bansLoading && <p className="text-xs text-slate-500 text-center py-6">Loading…</p>}
          {!bansLoading && filteredHistory.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-6">
              {historySearch ? 'No records match your search.' : 'No ban records yet.'}
            </p>
          )}

          <div className="space-y-2">
            {filteredHistory.map((ban) => (
              <div key={ban.id} className="bg-slatepanel-800 rounded-xl border border-borderline-800 p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className={`w-8 h-8 rounded-full grid place-items-center flex-shrink-0 ${ban.is_active_ban ? 'bg-coral-500/20' : 'bg-emeraldwin-500/15'}`}>
                    {ban.is_active_ban ? <ShieldBan className="w-3.5 h-3.5 text-coral-400" /> : <Unlock className="w-3.5 h-3.5 text-emeraldwin-400" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white text-sm">{ban.username || '—'}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${
                        ban.is_active_ban ? 'bg-coral-500/15 border-coral-500/30 text-coral-300' : 'bg-emeraldwin-500/10 border-emeraldwin-500/25 text-emeraldwin-400'
                      }`}>{ban.is_active_ban ? 'Active Ban' : 'Unbanned'}</span>
                      {ban.banned_by === 'system' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-violet-500/15 border-violet-500/30 text-violet-300 font-semibold">Auto-Ban</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Detail grid — IP shown even if empty as '—' */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 pl-10">
                  <BanDetail icon={User} label="Account ID" value={ban.account_id || '—'} mono />
                  <BanDetail icon={Mail} label="Email" value={ban.email || '—'} />
                  <BanDetail icon={Phone} label="Phone" value={ban.phone || '—'} />
                  {/* IP: always show, never show dash when value exists */}
                  <BanDetail icon={Activity} label="IP Address" value={ban.ip && ban.ip.trim() ? ban.ip : 'Unknown'} mono />
                  <BanDetail icon={Clock} label="Banned" value={fmt(ban.ban_date)} />
                  {ban.unban_date && <BanDetail icon={Unlock} label="Unbanned" value={fmt(ban.unban_date)} />}
                </div>

                <div className="pl-10 space-y-0.5">
                  <p className="text-[10px] text-slate-400">
                    <span className="text-slate-600 uppercase tracking-wider font-semibold">Ban reason: </span>
                    {ban.ban_reason || '—'}
                  </p>
                  {ban.unban_reason && (
                    <p className="text-[10px] text-slate-400">
                      <span className="text-slate-600 uppercase tracking-wider font-semibold">Unban reason: </span>
                      {ban.unban_reason}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-600">Banned by: {ban.banned_by || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Unban modal ── */}
      {unbanModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="panel p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <Unlock className="w-5 h-5 text-emeraldwin-300" />
              <h3 className="font-display font-bold text-white">Unban User</h3>
            </div>
            <p className="text-sm text-slate-400">
              Unbanning <span className="text-white font-semibold">{unbanModal.username}</span>{' '}
              (#{unbanModal.account_id || unbanModal.id.slice(0, 8)}). This restores their access.
            </p>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Reason (optional)</p>
              <input type="text" value={unbanReason} onChange={(e) => setUnbanReason(e.target.value)} placeholder="Unban reason…" className="input" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setUnbanModal(null); setUnbanReason(''); }} className="flex-1 py-2 rounded-xl bg-slatepanel-700 text-slate-300 text-sm hover:bg-slatepanel-600">Cancel</button>
              <button onClick={() => void handleUnban(unbanModal, unbanReason)} className="flex-1 py-2 rounded-xl bg-emeraldwin-500/20 border border-emeraldwin-500/40 text-emeraldwin-300 text-sm font-semibold">Confirm Unban</button>
            </div>
          </div>
        </div>
      )}

      {/* ── IP action modal ── */}
      {ipActionModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="panel p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              {ipActionModal.action === 'ban' ? <ShieldBan className="w-5 h-5 text-coral-400" /> : <Unlock className="w-5 h-5 text-emeraldwin-300" />}
              <h3 className="font-display font-bold text-white capitalize">{ipActionModal.action} User</h3>
            </div>
            <p className="text-sm text-slate-400">
              You are {ipActionModal.action === 'ban' ? 'banning' : 'unbanning'}{' '}
              <span className="text-white font-semibold">{ipActionModal.username}</span>. Please provide a reason.
            </p>
            <input type="text" value={ipActionReason} onChange={(e) => setIpActionReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void confirmIpAction(); }} placeholder="Reason…" className="input" />
            <div className="flex gap-2">
              <button onClick={() => { setIpActionModal(null); setIpActionReason(''); }} className="flex-1 py-2 rounded-xl bg-slatepanel-700 text-slate-300 text-sm hover:bg-slatepanel-600">Cancel</button>
              <button onClick={() => void confirmIpAction()} className={`flex-1 py-2 rounded-xl text-sm font-semibold ${
                ipActionModal.action === 'ban' ? 'bg-coral-500/20 border border-coral-500/40 text-coral-300' : 'bg-emeraldwin-500/20 border border-emeraldwin-500/40 text-emeraldwin-300'
              }`}>Confirm {ipActionModal.action === 'ban' ? 'Ban' : 'Unban'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BanDetail({
  icon: Icon, label, value, mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-1.5 min-w-0">
      <Icon className="w-3 h-3 text-slate-600 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wider text-slate-600 font-semibold">{label}</p>
        <p className={`text-[10px] text-slate-300 truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
    </div>
  );
}
