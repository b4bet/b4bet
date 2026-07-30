import { useState, useRef, useEffect, useCallback, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import {
  LayoutDashboard, Users, ShieldCheck, Headphones, DollarSign,
  Cpu, Bell, Megaphone, Wallet, Trophy, Mail, Server, Coins,
  CreditCard, FileText, Image, Gift, Settings, History,
  ShieldBan, MessageSquare, Zap, BarChart2, LogOut, Menu, X,
  KeyRound, Eye, EyeOff, RefreshCw, Banknote, TrendingDown, Link2, Share2,
  Wrench, Activity, AlertTriangle,
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
import GameAlgosTab from './admin/GameAlgosTab';
import { CrashHandlingPanel } from './admin/CrashHandlingPanel';
import { AviatorHandlingPanel } from './admin/AviatorHandlingPanel';
import { SunMoonHandlingPanel } from './admin/GameAlgosTab';
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
import AffiliatesTab from './admin/AffiliatesTab';
import TopRankingsTab from './admin/TopRankingsTab';
import SocialLinksTab from './admin/SocialLinksTab';
import MaintenanceTab from './admin/MaintenanceTab';
import StatsSettingsTab from './admin/StatsSettingsTab';

// ─── Error Boundary ───────────────────────────────────────────────────────────
interface EBState { hasError: boolean; message: string }
class TabErrorBoundary extends Component<{ children: ReactNode; tabKey: string }, EBState> {
  constructor(props: { children: ReactNode; tabKey: string }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: unknown): EBState {
    const msg = error instanceof Error ? error.message : String(error);
    return { hasError: true, message: msg };
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[AdminView] Tab error:', error, info);
  }
  componentDidUpdate(prev: { tabKey: string }) {
    if (prev.tabKey !== this.props.tabKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 flex flex-col items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-red-400" />
          <p className="text-sm font-semibold text-white">Tab failed to load</p>
          <p className="text-xs text-slate-400 max-w-sm text-center">{this.state.message || 'Unknown error'}</p>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-4 py-2 text-xs bg-violet-600 hover:bg-violet-500 rounded-lg text-white font-semibold transition"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Tab keys — some map to PermissionKey directly, others are routed via TAB_PERM_MAP below
type Tab = PermissionKey | 'email' | 'games' | 'notifications' | 'notificationManager'
  | 'manageProfile' | 'handlers' | 'topRankings' | 'balanceHistory'
  | 'signupBonus' | 'dashboard' | 'socialLinks' | 'maintenance' | 'homeStats';

type GameHandlerKey = 'crash' | 'sunvsmoon' | 'aviator';
type FloatToast = { id: number; message: string; icon: 'deposit' | 'withdrawal' | 'support' };

const TABS: { key: Tab; label: string; icon: typeof Cpu }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'finance', label: 'Finance', icon: DollarSign },
  { key: 'requests', label: 'Requests', icon: RefreshCw },
  { key: 'tickets', label: 'Tickets', icon: Headphones },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'staff', label: 'Staff', icon: ShieldCheck },
  { key: 'affiliates', label: 'Affiliates', icon: Link2 },
  { key: 'socialLinks', label: 'Social Links', icon: Share2 },
  { key: 'gateways', label: 'Auto Gateways', icon: Zap },
  { key: 'algos', label: 'Game Algos', icon: Cpu },
  { key: 'games', label: 'Game Handlers', icon: Settings },
  { key: 'gameSettings', label: 'Game Settings', icon: Settings },
  { key: 'history', label: 'History', icon: History },
  { key: 'balanceHistory', label: 'Balance History', icon: BarChart2 },
  { key: 'topRankings', label: 'Top Rankings', icon: Trophy },
  { key: 'homeStats', label: 'Home Stats', icon: Activity },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'notificationManager', label: 'Notif. Manager', icon: Bell },
  { key: 'marketing', label: 'Refer & Earn', icon: Megaphone },
  { key: 'crm', label: 'CRM', icon: Users },
  { key: 'email', label: 'Email Manager', icon: Mail },
  { key: 'smtp', label: 'SMTP', icon: Server },
  { key: 'currencies', label: 'Currencies', icon: Coins },
  { key: 'paymentMethods', label: 'Payment Methods', icon: CreditCard },
  { key: 'handlers', label: 'Pay Handlers', icon: Wallet },
  { key: 'dynamicPages', label: 'Dynamic Pages', icon: FileText },
  { key: 'banner', label: 'Banner & Logo', icon: Image },
  { key: 'redeem', label: 'Redeem Codes', icon: Gift },
  { key: 'signupBonus', label: 'Signup Bonus', icon: Gift },
  { key: 'ban', label: 'Ban Section', icon: ShieldBan },
  { key: 'intercom', label: 'Intercom', icon: MessageSquare },
  { key: 'maintenance', label: 'Maintenance', icon: Wrench },
];

const TAB_PERM_MAP: Partial<Record<string, PermissionKey>> = {
  notifications: 'notify',
  notificationManager: 'notifyManager',
  email: 'emails',
  games: 'algos',
  handlers: 'paymentMethods',
  balanceHistory: 'history',
  topRankings: 'history',
  signupBonus: 'marketing',
  socialLinks: 'marketing',
  maintenance: 'banner',
  homeStats: 'algos',
};

const GAME_HANDLER_TABS: { key: GameHandlerKey; label: string }[] = [
  { key: 'crash', label: 'Crash' },
  { key: 'sunvsmoon', label: 'Sun vs Moon' },
  { key: 'aviator', label: 'Aviator' },
];

// Standalone component so React properly mounts/unmounts with hooks
function CrashPanel() { return <CrashHandlingPanel />; }
function SunMoonPanel() { return <SunMoonHandlingPanel />; }
function AviatorPanel() { return <AviatorHandlingPanel />; }

function GameHandlerContent({ activeKey }: { activeKey: GameHandlerKey }) {
  if (activeKey === 'crash') return <CrashPanel />;
  if (activeKey === 'sunvsmoon') return <SunMoonPanel />;
  return <AviatorPanel />;
}

async function sha256Hex(plain: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function PasswordChangeForm({ staffId, onDone }: { staffId: string; onDone: () => void }) {
  const [old, setOld] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  const submit = async () => {
    setError('');
    if (!old || !next || !confirm) { setError('All fields required'); return; }
    if (next !== confirm) { setError('Passwords do not match'); return; }
    if (next.length < 6) { setError('Min 6 characters'); return; }
    setLoading(true);
    try {
      const staff = await supabaseStaffLogin(staffId, await sha256Hex(old)).catch(() => null);
      if (!staff) { setError('Current password is wrong'); setLoading(false); return; }
      await supabaseUpdateStaffPassword(staffId, await sha256Hex(next));
      setOk(true);
      setTimeout(onDone, 1200);
    } catch { setError('Server error, try again'); }
    finally { setLoading(false); }
  };

  const FieldRow = ({ label, val, set, show, toggle }: { label: string; val: string; set: (v: string) => void; show: boolean; toggle: () => void }) => (
    <div className="space-y-1">
      <label className="text-[11px] text-slate-400">{label}</label>
      <div className="relative">
        <input type={show ? 'text' : 'password'} value={val} onChange={(e) => set(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white pr-9 outline-none" />
        <button type="button" onClick={toggle} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  if (ok) return <p className="text-xs text-emerald-400 font-semibold">Password changed!</p>;
  return (
    <div className="space-y-3">
      <FieldRow label="Current Password" val={old} set={setOld} show={showOld} toggle={() => setShowOld(v => !v)} />
      <FieldRow label="New Password" val={next} set={setNext} show={showNext} toggle={() => setShowNext(v => !v)} />
      <FieldRow label="Confirm Password" val={confirm} set={setConfirm} show={showConf} toggle={() => setShowConf(v => !v)} />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={() => void submit()} disabled={loading}
        className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition disabled:opacity-60">
        {loading ? 'Saving…' : 'Change Password'}
      </button>
    </div>
  );
}

function NotifRow({ icon: Icon, label, count, onClick, accent }: { icon: typeof Bell; label: string; count: number; onClick: () => void; accent: string }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 transition">
      <span className="flex items-center gap-2 text-xs text-slate-300"><Icon className={`w-4 h-4 ${accent}`} />{label}</span>
      <span className={`text-xs font-bold ${accent}`}>{count}</span>
    </button>
  );
}

function FloatingToasts({ toasts, onDismiss }: { toasts: FloatToast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  const MAP = {
    deposit: { Icon: Banknote, bg: 'bg-slate-900 border-emerald-500/40', color: 'text-emerald-400' },
    withdrawal: { Icon: TrendingDown, bg: 'bg-slate-900 border-red-500/40', color: 'text-red-400' },
    support: { Icon: MessageSquare, bg: 'bg-slate-900 border-violet-500/40', color: 'text-violet-400' },
  } as const;
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        const { Icon, bg, color } = MAP[t.icon];
        return (
          <div key={t.id} onClick={() => onDismiss(t.id)} style={{ pointerEvents: 'auto' }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-sm font-semibold text-white cursor-pointer ${bg}`}>
            <Icon className={`w-5 h-5 ${color}`} />
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

function NotifBell({ totalUnread, pendingDeposits, pendingWithdrawals, unreadSupport, onNavigate }: {
  totalUnread: number; pendingDeposits: number; pendingWithdrawals: number;
  unreadSupport: number; onNavigate: (tab: Tab) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 grid place-items-center hover:border-violet-500/50 transition-colors">
        <Bell className="w-4 h-4 text-slate-300" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 z-50">
          <p className="text-[11px] text-slate-400 px-3 pb-2 font-semibold uppercase tracking-wider">Notifications</p>
          {pendingDeposits > 0 && <NotifRow icon={Banknote} label="Pending Deposits" count={pendingDeposits} accent="text-emerald-400" onClick={() => { onNavigate('finance'); setOpen(false); }} />}
          {pendingWithdrawals > 0 && <NotifRow icon={TrendingDown} label="Pending Withdrawals" count={pendingWithdrawals} accent="text-red-400" onClick={() => { onNavigate('requests'); setOpen(false); }} />}
          {unreadSupport > 0 && <NotifRow icon={MessageSquare} label="Support Tickets" count={unreadSupport} accent="text-violet-400" onClick={() => { onNavigate('tickets'); setOpen(false); }} />}
          {totalUnread === 0 && <p className="text-xs text-slate-500 text-center py-3">All caught up!</p>}
        </div>
      )}
    </div>
  );
}

// ─── Game Handlers Tab ────────────────────────────────────────────────────────
function GameHandlersTab() {
  const [activeKey, setActiveKey] = useState<GameHandlerKey>('crash');
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap gap-2">
        {GAME_HANDLER_TABS.map(t => (
          <button key={t.key} onClick={() => setActiveKey(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${activeKey === t.key ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <TabErrorBoundary tabKey={activeKey}>
        <GameHandlerContent activeKey={activeKey} />
      </TabErrorBoundary>
    </div>
  );
}

export default function AdminView({ onNavigate, onOpenWallet }: { onNavigate: (r: Route) => void; onOpenWallet: () => void }) {
  const staffSessionId = useStaffSession();
  const staff = useStaff();
  const finance = useFinance();
  const support = useSupport();

  const pendingDeposits = finance.deposits.filter(d => d.status === 'processing').length;
  const pendingWithdrawals = finance.withdrawals.filter(w => w.status === 'processing').length;
  const unreadSupport = support.filter(t => !t.adminRead).length;
  const totalUnread = pendingDeposits + pendingWithdrawals + unreadSupport;

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [floatToasts, setFloatToasts] = useState<FloatToast[]>([]);
  const prevPending = useRef({ deposits: 0, withdrawals: 0, support: 0 });
  const toastIdRef = useRef(0);
  const activeTabRef = useRef<Tab>(activeTab);
  activeTabRef.current = activeTab;

  // Track tab history stack for back navigation
  const tabHistoryRef = useRef<Tab[]>(['dashboard']);

  const currentStaff = staffSessionId ? staff.find(s => s.id === staffSessionId) ?? null : null;

  useEffect(() => {
    const prev = prevPending.current;
    const newToasts: FloatToast[] = [];
    if (pendingDeposits > prev.deposits) {
      for (let i = 0; i < pendingDeposits - prev.deposits; i++) {
        newToasts.push({ id: ++toastIdRef.current, message: 'New deposit request', icon: 'deposit' });
      }
    }
    if (pendingWithdrawals > prev.withdrawals) {
      for (let i = 0; i < pendingWithdrawals - prev.withdrawals; i++) {
        newToasts.push({ id: ++toastIdRef.current, message: 'New withdrawal request', icon: 'withdrawal' });
      }
    }
    if (unreadSupport > prev.support) {
      for (let i = 0; i < unreadSupport - prev.support; i++) {
        newToasts.push({ id: ++toastIdRef.current, message: 'New support ticket', icon: 'support' });
      }
    }
    if (newToasts.length > 0) {
      setFloatToasts(prev => [...prev, ...newToasts]);
      newToasts.forEach(t => setTimeout(() => dismissToast(t.id), 5000));
    }
    prevPending.current = { deposits: pendingDeposits, withdrawals: pendingWithdrawals, support: unreadSupport };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDeposits, pendingWithdrawals, unreadSupport]);

  const dismissToast = useCallback((id: number) => {
    setFloatToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ─── Mobile back button support for admin panel ───
  useEffect(() => {
    if (activeTab !== 'dashboard') {
      window.history.pushState({ adminTab: activeTab }, '');
    }
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = () => {
      const history = tabHistoryRef.current;
      if (history.length > 1) {
        history.pop();
        const prevTab = history[history.length - 1];
        setActiveTab(prevTab);
      } else if (activeTabRef.current === 'dashboard') {
        onNavigate('home');
      } else {
        setActiveTab('dashboard');
        tabHistoryRef.current = ['dashboard'];
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onNavigate]);

  if (!staffSessionId) return <AdminLoginPage />;

  const canAccess = (tab: Tab): boolean => {
    if (currentStaff?.isOwner) return true;
    if (!currentStaff) return true;
    const permKey = (TAB_PERM_MAP[tab] ?? tab) as PermissionKey;
    return !!currentStaff.permissions?.[permKey];
  };

  const visibleTabs = TABS.filter(t => canAccess(t.key));
  const navigate = (tab: Tab) => {
    tabHistoryRef.current.push(tab);
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardOverviewTab onNavigate={navigate} />;
      case 'finance': return <FinanceTab />;
      case 'requests': return <RequestsTab />;
      case 'tickets': return <TicketsTab />;
      case 'users': return <UsersTab />;
      case 'staff': return <StaffTab />;
      case 'affiliates': return <AffiliatesTab />;
      case 'socialLinks': return <SocialLinksTab />;
      case 'gateways': return <AutoGatewaysTab />;
      case 'algos': return <GameAlgosTab />;
      case 'games': return <GameHandlersTab />;
      case 'gameSettings': return <GameSettingsTab />;
      case 'history': return <HistoryTab />;
      case 'balanceHistory': return <BalanceHistoryTab />;
      case 'topRankings': return <TopRankingsTab />;
      case 'homeStats': return <StatsSettingsTab />;
      case 'notifications': return <NotificationsTab />;
      case 'notificationManager': return <NotificationManagerTab />;
      case 'marketing': return <MarketingTab />;
      case 'crm': return <CrmTab />;
      case 'email': return <EmailManagerTab />;
      case 'smtp': return <SmtpTab />;
      case 'currencies': return <CurrenciesTab />;
      case 'paymentMethods': return <PaymentMethodsTab />;
      case 'handlers': return <PaymentMethodsTab />;
      case 'dynamicPages': return <DynamicPagesTab />;
      case 'banner': return <BannerLogoTab />;
      case 'redeem': return <RedeemCodesTab />;
      case 'signupBonus': return <SignupBonusTab />;
      case 'ban': return <BanSectionTab />;
      case 'intercom': return <IntercomTab />;
      case 'maintenance': return <MaintenanceTab />;
      default: return <div className="p-6 text-slate-400 text-sm">Tab not found.</div>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <FloatingToasts toasts={floatToasts} onDismiss={dismissToast} />
      <TicketAlertOverlay onNavigate={(tab) => { setActiveTab(tab as Tab); }} />

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-56 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800 flex-shrink-0">
          <span className="font-display font-extrabold text-white text-sm tracking-wide">B4BeT Admin</span>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
          {visibleTabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => navigate(tab.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs font-semibold transition-colors ${active ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-3 flex-shrink-0 space-y-2">
          {!changingPassword && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-violet-600/30 border border-violet-500/40 grid place-items-center flex-shrink-0">
                <span className="text-[10px] font-bold text-violet-300">{currentStaff?.name?.[0]?.toUpperCase() ?? 'A'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-white truncate">{currentStaff?.name ?? staffSessionId}</p>
                <p className="text-[10px] text-slate-500 capitalize">{currentStaff?.isOwner ? 'owner' : (currentStaff?.role ?? 'staff')}</p>
              </div>
              <button onClick={() => setChangingPassword(true)} title="Change Password"
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white">
                <KeyRound className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {changingPassword && (
            <div className="space-y-2">
              <PasswordChangeForm staffId={staffSessionId} onDone={() => setChangingPassword(false)} />
              <button onClick={() => setChangingPassword(false)} className="text-[10px] text-slate-500 hover:text-slate-300">Cancel</button>
            </div>
          )}
          <button
            onClick={() => { cms.logoutStaff(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 md:ml-0">
        <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white">
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="font-display font-bold text-white text-sm">{TABS.find(t => t.key === activeTab)?.label ?? activeTab}</h1>
          </div>
          <div className="flex items-center gap-2">
            <NotifBell
              totalUnread={totalUnread}
              pendingDeposits={pendingDeposits}
              pendingWithdrawals={pendingWithdrawals}
              unreadSupport={unreadSupport}
              onNavigate={navigate}
            />
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-950">
          <TabErrorBoundary tabKey={activeTab}>
            {renderTab()}
          </TabErrorBoundary>
        </main>
      </div>

      {staffSessionId && <AdminSupportNotification />}
    </div>
  );
}
