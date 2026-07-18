import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard, Users, ShieldCheck, Headphones, DollarSign,
  Cpu, Bell, Megaphone, Wallet, Trophy, Mail, Server, Coins,
  CreditCard, FileText, Image, Gift, Settings, History,
  ShieldBan, MessageSquare, Zap, BarChart2, LogOut, ChevronLeft, RefreshCw
} from 'lucide-react';
import type { Route } from '../components/BottomNav';
import { useFinance, useSupport, useStaff, useStaffSession } from '../lib/cmsHooks';
import { cms, type PermissionKey } from '../lib/cms';
import AdminLoginPage from '../components/AdminLoginPage';
import AdminChangePasswordModal from '../components/AdminChangePasswordModal';
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

type Tab = PermissionKey | 'email' | 'games' | 'notifications' | 'notificationManager' | 'manageProfile' | 'handlers' | 'topRankings' | 'balanceHistory' | 'requests' | 'signupBonus' | 'dashboard';

const tabs: { key: Tab; label: string; icon: typeof Cpu }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'finance', label: 'Finance', icon: DollarSign },
  { key: 'requests', label: 'Requests', icon: RefreshCw },
  { key: 'tickets', label: 'Tickets', icon: Headphones },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'staff', label: 'Staff', icon: ShieldCheck },
  { key: 'gateways', label: 'Auto Gateways', icon: Zap },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'marketing', label: 'Marketing', icon: Megaphone },
  { key: 'notificationManager', label: 'Notification Manager', icon: Bell },
  { key: 'algos', label: 'Game Algos', icon: Cpu },
  { key: 'games', label: 'Game Handlers', icon: Settings },
  { key: 'gameSettings', label: 'Game Settings', icon: Settings },
  { key: 'history', label: 'History', icon: History },
  { key: 'ban', label: 'Ban Section', icon: ShieldBan },
  { key: 'intercom', label: 'Intercom', icon: MessageSquare },
  { key: 'topRankings', label: 'Top Rankings', icon: Trophy },
  { key: 'balanceHistory', label: 'Balance History', icon: BarChart2 },
  { key: 'handlers', label: 'Handlers', icon: Wallet },
  { key: 'email', label: 'Email Manager', icon: Mail },
  { key: 'smtp', label: 'SMTP', icon: Server },
  { key: 'currencies', label: 'Currencies', icon: Coins },
  { key: 'paymentMethods', label: 'Payment Methods', icon: CreditCard },
  { key: 'dynamicPages', label: 'Dynamic Pages', icon: FileText },
  { key: 'banner', label: 'Banner & Logo', icon: Image },
  { key: 'redeem', label: 'Redeem Codes', icon: Gift },
  { key: 'signupBonus', label: 'Signup Bonus', icon: Gift },
  { key: 'crm', label: 'CRM', icon: Users },
];

const GAME_HANDLER_TABS = [
  { key: 'crash',     label: 'Crash',       Panel: CrashHandlingPanel },
  { key: 'wingo',     label: 'Win Go',      Panel: WingoHandlingPanel },
  { key: 'k3',        label: 'K3',          Panel: K3HandlingPanel },
  { key: 'fived',     label: '5D',          Panel: FiveDHandlingPanel },
  { key: 'sunvsmoon', label: 'Sun vs Moon', Panel: SunMoonHandlingPanel },
  { key: 'aviator',   label: 'Aviator',     Panel: AviatorHandlingPanel },
] as const;

type GameHandlerKey = (typeof GAME_HANDLER_TABS)[number]['key'];

export default function AdminView({ onNavigate, onOpenMenu }: { onNavigate: (r: Route) => void; onOpenMenu?: () => void }) {
  const sessionId = useStaffSession();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [gameHandlerTab, setGameHandlerTab] = useState<GameHandlerKey>('crash');
  const profileRef = useRef<HTMLDivElement | null>(null);
  const finance = useFinance();
  const support = useSupport();
  const staff = useStaff();
  const me = staff.find((s) => s.id === sessionId);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail as Tab;
      if (detail) setTab(detail);
    };
    window.addEventListener('admin-navigate', handler);
    return () => window.removeEventListener('admin-navigate', handler);
  }, []);

  const hasPermission = (key: PermissionKey) => {
    if (!me) return false;
    if (me.role === 'superadmin') return true;
    return me.permissions?.includes(key) ?? false;
  };

  if (!sessionId) return <AdminLoginPage />;

  const ActiveGamePanel = GAME_HANDLER_TABS.find((g) => g.key === gameHandlerTab)?.Panel ?? CrashHandlingPanel;

  return (
    <div className="flex h-screen bg-slate-950 text-white">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-slate-800 bg-slate-900 shrink-0">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-800">
          <ShieldCheck className="w-5 h-5 text-violet-400" />
          <span className="font-bold text-sm">Admin Panel</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
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
        <div className="border-t border-slate-800 p-3">
          <button
            onClick={() => { cms.staffLogout(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
          <button onClick={onOpenMenu} className="text-slate-400">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-bold text-sm">{tabs.find((t) => t.key === tab)?.label ?? 'Admin'}</span>
          <div />
        </header>

        <main className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          {tab === 'dashboard' && <DashboardOverviewTab />}
          {tab === 'finance' && <FinanceTab />}
          {tab === 'requests' && <RequestsTab />}
          {tab === 'tickets' && <TicketsTab />}
          {tab === 'gateways' && <AutoGatewaysTab />}
          {tab === 'handlers' && (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-lg text-white">Payment Handlers</h2>
              <p className="text-slate-500 text-sm">Configure deposit/withdrawal handler logic here.</p>
            </div>
          )}
          {tab === 'algos' && <GameAlgosTab />}
          {tab === 'games' && (
            <div className="space-y-4">
              {/* Game selector sub-tabs */}
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
              {/* Active panel */}
              <ActiveGamePanel />
            </div>
          )}
          {tab === 'users' && <UsersTab />}
          {tab === 'balanceHistory' && <BalanceHistoryTab />}
          {tab === 'topRankings' && (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-lg text-white">Top Rankings</h2>
              <p className="text-slate-500 text-sm">Top bets and leaderboard coming soon.</p>
            </div>
          )}
          {tab === 'staff' && hasPermission('staff') && <StaffTab />}
          {tab === 'notifications' && <NotificationsTab />}
          {tab === 'notificationManager' && <NotificationManagerTab />}
          {tab === 'marketing' && <MarketingTab />}
          {tab === 'crm' && <CrmTab />}
          {tab === 'email' && <EmailManagerTab />}
          {tab === 'smtp' && <SmtpTab />}
          {tab === 'currencies' && <CurrenciesTab />}
          {tab === 'paymentMethods' && <PaymentMethodsTab />}
          {tab === 'dynamicPages' && <DynamicPagesTab />}
          {tab === 'banner' && <BannerLogoTab />}
          {tab === 'redeem' && <RedeemCodesTab />}
          {tab === 'signupBonus' && <SignupBonusTab />}
          {tab === 'gameSettings' && <GameSettingsTab />}
          {tab === 'history' && <HistoryTab />}
          {tab === 'ban' && <BanSectionTab />}
          {tab === 'intercom' && <IntercomTab />}
          {tab === 'manageProfile' && (
            <div className="space-y-4" ref={profileRef}>
              <AdminChangePasswordModal />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
