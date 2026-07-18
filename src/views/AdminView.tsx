import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard, Users, ShieldCheck, Headphones, DollarSign,
  Cpu, Bell, Megaphone, Wallet, Trophy, Mail, Server, Coins,
  CreditCard, FileText, Image, Gift, Settings, History,
  ShieldBan, MessageSquare, Zap, BarChart2, LogOut, Menu, X,
  ChevronDown, KeyRound, Eye, EyeOff, RefreshCw, Banknote, TrendingDown
} from 'lucide-react';
import type { Route } from '../components/BottomNav';
import { useFinance, useSupport, useStaff, useStaffSession } from '../lib/cmsHooks';
import { cms, type PermissionKey } from '../lib/cms';
import AdminLoginPage from '../components/AdminLoginPage';
import { supabaseStaffLogin, supabaseUpdateStaffPassword } from '../lib/supabaseIntegration';
import DashboardOverviewTab from './admin/DashboardOverviewTab';
import FinanceTab from './admin/FinanceTab';
import RequestsTab from './admin/RequestsTab';
import TicketsTab from './admin/TicketsTab';
import UsersTab from './admin/UsersTab';
import HistoryTab from './admin/HistoryTab';
import SmtpTab from './admin/SmtpTab';
import CurrenciesTab from './admin/CurrenciesTab';
import DynamicPagesTab from './admin/DynamicPagesTab';
import EmailManagerTab from './admin/EmailManagerTab';
import StaffTab from './admin/StaffTab';
import MarketingTab from './admin/MarketingTab';
import NotificationsTab from './admin/NotificationsTab';
import AutoGatewaysTab from './admin/AutoGatewaysTab';
import GameAlgosTab, {
  CrashHandlingPanel,
  WingoHandlingPanel,
  K3HandlingPanel,
  FiveDHandlingPanel,
  SunMoonHandlingPanel,
  AviatorHandlingPanel,
  TopRankingsAdminPanel,
  OnlineCountPanel,
  TopWinPaidOutPanel,
} from './admin/GameAlgosTab';
import GameSettingsTab from './admin/GameSettingsTab';
import BanSectionTab from './admin/BanSectionTab';
import IntercomTab from './admin/IntercomTab';
import BalanceHistoryTab from './admin/BalanceHistoryTab';
import NotificationManagerTab from './admin/NotificationManagerTab';
import PaymentMethodsTab from './admin/PaymentMethodsTab';
import RedeemCodesTab from './admin/RedeemCodesTab';
import SignupBonusTab from './admin/SignupBonusTab';
import BannerLogoTab from './admin/BannerLogoTab';
import CrmTab from './admin/CrmTab';
import TicketAlertOverlay from '../components/TicketAlertOverlay';
import AdminSupportNotification from '../components/AdminSupportNotification';

// ─── Types ───────────────────────────────────────────────────────────────────
type Tab = PermissionKey | 'email' | 'games' | 'notifications' | 'notificationManager'
  | 'manageProfile' | 'handlers' | 'topRankings' | 'balanceHistory'
  | 'requests' | 'signupBonus' | 'dashboard';

type GameHandlerKey = 'crash' | 'wingo' | 'k3' | 'fived' | 'sunvsmoon' | 'aviator';

// ─── Sidebar tab list ────────────────────────────────────────────────────────
const TABS: { key: Tab; label: string; icon: typeof Cpu }[] = [
  { key: 'dashboard',           label: 'Dashboard',           icon: LayoutDashboard },
  { key: 'finance',             label: 'Finance',             icon: DollarSign },
  { key: 'requests',            label: 'Requests',            icon: RefreshCw },
  { key: 'tickets',             label: 'Tickets',             icon: Headphones },
  { key: 'users',               label: 'Users',               icon: Users },
  { key: 'staff',               label: 'Staff',               icon: ShieldCheck },
  { key: 'gateways',            label: 'Auto Gateways',       icon: Zap },
  { key: 'algos',               label: 'Game Algos',          icon: Cpu },
  { key: 'games',               label: 'Game Handlers',       icon: Settings },
  { key: 'gameSettings',        label: 'Game Settings',       icon: Settings },
  { key: 'history',             label: 'History',             icon: History },
  { key: 'balanceHistory',      label: 'Balance History',     icon: BarChart2 },
  { key: 'topRankings',         label: 'Top Rankings',        icon: Trophy },
  { key: 'notifications',       label: 'Notifications',       icon: Bell },
  { key: 'notificationManager', label: 'Notif. Manager',      icon: Bell },
  { key: 'marketing',           label: 'Marketing',           icon: Megaphone },
  { key: 'crm',                 label: 'CRM',                 icon: Users },
  { key: 'email',               label: 'Email Manager',       icon: Mail },
  { key: 'smtp',                label: 'SMTP',                icon: Server },
  { key: 'currencies',          label: 'Currencies',          icon: Coins },
  { key: 'paymentMethods',      label: 'Payment Methods',     icon: CreditCard },
  { key: 'handlers',            label: 'Pay Handlers',        icon: Wallet },
  { key: 'dynamicPages',        label: 'Dynamic Pages',       icon: FileText },
  { key: 'banner',              label: 'Banner & Logo',       icon: Image },
  { key: 'redeem',              label: 'Redeem Codes',        icon: Gift },
  { key: 'signupBonus',         label: 'Signup Bonus',        icon: Gift },
  { key: 'ban',                 label: 'Ban Section',         icon: ShieldBan },
  { key: 'intercom',            label: 'Intercom',            icon: MessageSquare },
];

// ─── Game handler sub-tabs ───────────────────────────────────────────────────
const GAME_HANDLER_TABS: { key: GameHandlerKey; label: string; Panel: () => JSX.Element }[] = [
  { key: 'crash',     label: 'Crash',       Panel: CrashHandlingPanel },
  { key: 'wingo',     label: 'Win Go',      Panel: WingoHandlingPanel },
  { key: 'k3',        label: 'K3',          Panel: K3HandlingPanel },
  { key: 'fived',     label: '5D',          Panel: FiveDHandlingPanel },
  { key: 'sunvsmoon', label: 'Sun vs Moon', Panel: SunMoonHandlingPanel },
  { key: 'aviator',   label: 'Aviator',     Panel: AviatorHandlingPanel },
];

// ─── sha256 helper (for password) ────────────────────────────────────────────
async function sha256Hex(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Inline password change form ─────────────────────────────────────────────
function PasswordChangeForm({ staffId, onDone }: { staffId: string; onDone: () => void }) {
  const [old, setOld]         = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [showOld, setShowOld]     = useState(false);
  const [showNext, setShowNext]   = useState(false);
  const [showConf, setShowConf]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [ok, setOk]           = useState(false);

  const submit = async () => {
    setError('');
    if (!old || !next || !confirm) { setError('All fields required'); return; }
    if (next !== confirm) { setError('New passwords do not match'); return; }
    if (next.length < 6)  { setError('Min 6 characters'); return; }
    setLoading(true);
    try {
      const oldHash  = await sha256Hex(old);
      const nextHash = await sha256Hex(next);
      const staff    = await supabaseStaffLogin(staffId, oldHash).catch(() => null);
      if (!staff) { setError('Current password is wrong'); setLoading(false); return; }
      await supabaseUpdateStaffPassword(staffId, nextHash);
      setOk(true);
      setTimeout(onDone, 1200);
    } catch { setError('Server error, try again'); }
    finally { setLoading(false); }
  };

  const field = (
    label: string,
    val: string,
    set: (v: string) => void,
    show: boolean,
    toggle: () => void
  ) => (
    <div className="space-y-1">
      <label className="text-xs text-slate-400">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={val}
          onChange={(e) => set(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white pr-10"
        />
        <button
          type="button"
          onClick={toggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  if (ok) return <p className="text-green-400 text-sm text-center py-2">Password changed!</p>;

  return (
    <div className="space-y-3 pt-1">
      {field('Current Password', old, setOld, showOld, () => setShowOld((v) => !v))}
      {field('New Password',     next, setNext, showNext, () => setShowNext((v) => !v))}
      {field('Confirm New',      confirm, setConfirm, showConf, () => setShowConf((v) => !v))}
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <button
        onClick={submit}
        disabled={loading}
        className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm rounded py-2 transition-colors"
      >
        {loading ? 'Saving…' : 'Change Password'}
      </button>
    </div>
  );
}

// ─── Notification row helper ─────────────────────────────────────────────────
function NotifRow({ icon: Icon, label, count, onClick, accent }: {
  icon: typeof Bell; label: string; count: number; onClick: () => void; accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-left"
    >
      <span className="flex items-center gap-2 text-sm text-slate-300">
        <Icon className={`w-4 h-4 ${accent}`} /> {label}
      </span>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${count > 0 ? 'bg-red-500/20 text-red-300' : 'bg-slate-700 text-slate-500'}`}>
        {count}
      </span>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminView({ onNavigate: _onNavigate }: { onNavigate: (r: Route) => void; onOpenMenu?: () => void }) {
  const sessionId = useStaffSession();
  const [tab, setTab]                     = useState<Tab>('dashboard');
  const [gameHandlerTab, setGameHandlerTab] = useState<GameHandlerKey>('crash');
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [profileOpen, setProfileOpen]     = useState(false);
  const [notifOpen, setNotifOpen]         = useState(false);
  const [showPwForm, setShowPwForm]       = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const notifRef   = useRef<HTMLDivElement | null>(null);

  const staff = useStaff();
  const finance = useFinance();
  const support = useSupport();
  const me = staff.find((s) => s.id === sessionId);

  // Pending counts for bell badge
  const pendingDeposits    = finance.deposits.filter((d) => d.status === 'pending').length;
  const pendingWithdrawals = finance.withdrawals.filter((w) => w.status === 'pending').length;
  const unreadSupport      = support.filter((s) => !s.read).length;
  const totalUnread        = pendingDeposits + pendingWithdrawals + unreadSupport;

  // navigate event from elsewhere in the app
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail as Tab;
      if (detail) setTab(detail);
    };
    window.addEventListener('admin-navigate', handler);
    return () => window.removeEventListener('admin-navigate', handler);
  }, []);

  // close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    const close = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
        setShowPwForm(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [profileOpen]);

  // close notif dropdown on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const close = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [notifOpen]);

  const hasPermission = (key: PermissionKey) => {
    if (!me) return false;
    if (me.role === 'superadmin' || me.isOwner) return true;
    return me.permissions?.[key as keyof typeof me.permissions] === true;
  };

  if (!sessionId) return <AdminLoginPage />;

  const navigate = (t: Tab) => {
    setTab(t);
    setSidebarOpen(false);
  };

  const ActiveGamePanel = GAME_HANDLER_TABS.find((g) => g.key === gameHandlerTab)?.Panel ?? CrashHandlingPanel;

  // ── Sidebar content ──────────────────────────────────────────────────────────
  const SidebarContent = () => (
    <>
      <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-800 shrink-0">
        <ShieldCheck className="w-5 h-5 text-violet-400" />
        <span className="font-bold text-sm">Admin Panel</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => navigate(t.key)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
              tab === t.key
                ? 'bg-violet-600/20 text-violet-300 border-r-2 border-violet-500'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <t.icon className="w-4 h-4 shrink-0" />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  );

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-56 flex-col border-r border-slate-800 bg-slate-900 shrink-0">
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 border-r border-slate-800 flex flex-col z-50">
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-violet-400" />
                <span className="font-bold text-sm">Admin Panel</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => navigate(t.key)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    tab === t.key
                      ? 'bg-violet-600/20 text-violet-300 border-r-2 border-violet-500'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <t.icon className="w-4 h-4 shrink-0" />
                  <span>{t.label}</span>
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Top header ── */}
        <header className="flex items-center justify-between px-4 h-14 border-b border-slate-800 bg-slate-900 shrink-0">
          {/* Left: hamburger (mobile) + user name */}
          <div className="flex items-center gap-3">
            <button
              className="md:hidden text-slate-400 hover:text-white"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-slate-300">
              {me?.name ?? me?.email ?? 'Admin'}
            </span>
          </div>

          {/* Right: notification bell + profile */}
          <div className="flex items-center gap-2">
            {/* ── Notification bell with badge ── */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 grid place-items-center hover:border-violet-500/50 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4 text-slate-300" />
                {totalUnread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center border-2 border-slate-900">
                    {totalUnread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-11 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-2 overflow-hidden">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold px-3 py-1.5">Notifications</p>
                  <NotifRow
                    icon={Banknote}
                    accent="text-green-400"
                    label="Pending deposits"
                    count={pendingDeposits}
                    onClick={() => { navigate('finance'); setNotifOpen(false); }}
                  />
                  <NotifRow
                    icon={TrendingDown}
                    accent="text-red-400"
                    label="Pending withdrawals"
                    count={pendingWithdrawals}
                    onClick={() => { navigate('requests'); setNotifOpen(false); }}
                  />
                  <NotifRow
                    icon={MessageSquare}
                    accent="text-violet-400"
                    label="Unread support messages"
                    count={unreadSupport}
                    onClick={() => { cms.markSupportRead(); setNotifOpen(false); }}
                  />
                </div>
              )}
            </div>

            {/* ── Profile button ── */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => { setProfileOpen((v) => !v); setShowPwForm(false); }}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-sm transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold">
                  {(me?.name ?? me?.email ?? 'A')[0].toUpperCase()}
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Floating profile dropdown */}
              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-lg font-bold shrink-0">
                        {(me?.name ?? me?.email ?? 'A')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{me?.name ?? '—'}</p>
                        <p className="text-xs text-slate-400 truncate">{me?.email ?? '—'}</p>
                        <span className="text-[10px] bg-violet-600/30 text-violet-300 px-1.5 py-0.5 rounded-full">
                          {me?.role === 'superadmin' || me?.isOwner ? 'Super Admin' : me?.role ?? 'Staff'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Change password toggle */}
                  <div className="px-4 py-2 border-b border-slate-800">
                    <button
                      onClick={() => setShowPwForm((v) => !v)}
                      className="w-full flex items-center gap-2 text-sm text-slate-300 hover:text-white py-1 transition-colors"
                    >
                      <KeyRound className="w-4 h-4" />
                      Change Password
                      <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${showPwForm ? 'rotate-180' : ''}`} />
                    </button>
                    {showPwForm && me && (
                      <PasswordChangeForm
                        staffId={me.id}
                        onDone={() => { setShowPwForm(false); setProfileOpen(false); }}
                      />
                    )}
                  </div>

                  {/* Logout */}
                  <div className="px-4 py-2">
                    <button
                      onClick={() => { cms.staffLogout(); }}
                      className="w-full flex items-center gap-2 text-sm text-red-400 hover:text-red-300 py-1 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Tab content ── */}
        <main className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          {tab === 'dashboard'           && <DashboardOverviewTab />}
          {tab === 'finance'             && <FinanceTab />}
          {tab === 'requests'            && <RequestsTab />}
          {tab === 'tickets'             && <TicketsTab />}
          {tab === 'gateways'            && <AutoGatewaysTab />}
          {tab === 'handlers'            && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">Payment Handlers</h2>
              <p className="text-slate-500 text-sm">Configure deposit/withdrawal handler logic here.</p>
            </div>
          )}
          {tab === 'algos'              && <GameAlgosTab />}
          {tab === 'games'              && (
            <div className="space-y-4">
              {/* Extra panels from cloudflare */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <OnlineCountPanel />
                <TopWinPaidOutPanel />
              </div>
              <div className="flex flex-wrap gap-2">
                {GAME_HANDLER_TABS.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => setGameHandlerTab(g.key)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      gameHandlerTab === g.key
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <ActiveGamePanel />
            </div>
          )}
          {tab === 'users'              && <UsersTab />}
          {tab === 'balanceHistory'     && <BalanceHistoryTab />}
          {tab === 'topRankings'        && <TopRankingsAdminPanel />}
          {tab === 'staff'              && hasPermission('staff') && <StaffTab />}
          {tab === 'notifications'      && <NotificationsTab />}
          {tab === 'notificationManager'&& <NotificationManagerTab />}
          {tab === 'marketing'          && <MarketingTab />}
          {tab === 'crm'                && <CrmTab />}
          {tab === 'email'              && <EmailManagerTab />}
          {tab === 'smtp'               && <SmtpTab />}
          {tab === 'currencies'         && <CurrenciesTab />}
          {tab === 'paymentMethods'     && <PaymentMethodsTab />}
          {tab === 'dynamicPages'       && <DynamicPagesTab />}
          {tab === 'banner'             && <BannerLogoTab />}
          {tab === 'redeem'             && <RedeemCodesTab />}
          {tab === 'signupBonus'        && <SignupBonusTab />}
          {tab === 'gameSettings'       && <GameSettingsTab />}
          {tab === 'history'            && <HistoryTab />}
          {tab === 'ban'                && <BanSectionTab />}
          {tab === 'intercom'           && <IntercomTab />}
          {tab === 'manageProfile'      && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">Profile</h2>
              <p className="text-slate-500 text-sm">Use the profile button in the header to change your password.</p>
            </div>
          )}
        </main>
      </div>

      {/* ── Support overlays (from cloudflare) ── */}
      <TicketAlertOverlay />
      <AdminSupportNotification />
    </div>
  );
}
