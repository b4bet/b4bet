import { useState, useEffect, useRef } from 'react';
import NotificationManagerTab from './admin/NotificationManagerTab';
import TicketAlertOverlay from '../components/TicketAlertOverlay';
import AdminSupportNotification from '../components/AdminSupportNotification';
import {
  Cpu, Users, Mail, Coins, Megaphone, Headphones, ShieldCheck,
  Image as ImageIcon, TrendingUp, Wallet, UserCog, Bell, Banknote, MessageSquare, Zap, History,
  TrendingDown, Ticket, Sliders, CreditCard, FileText, ShieldBan, BellRing, Gamepad2, Trophy, Gift,
  User as UserIcon, KeyRound, LogOut, ChevronDown, LayoutDashboard,
} from 'lucide-react';
import type { Route } from '../components/BottomNav';
import { useFinance, useSupport, useStaff, useStaffSession } from '../lib/cmsHooks';
import { cms, type PermissionKey } from '../lib/cms';
import AdminLoginPage from '../components/AdminLoginPage';
import AdminChangePasswordModal from '../components/AdminChangePasswordModal';

import DashboardOverviewTab from './admin/DashboardOverviewTab';
import BannerLogoTab from './admin/BannerLogoTab';
import FinanceTab from './admin/FinanceTab';
import RequestsTab from './admin/RequestsTab';

import EmailManagerTab from './admin/EmailManagerTab';
import StaffTab from './admin/StaffTab';
import MarketingTab from './admin/MarketingTab';
import NotificationsTab from './admin/NotificationsTab';
import AutoGatewaysTab from './admin/AutoGatewaysTab';
import GameAlgosTab from './admin/GameAlgosTab';
import GameSettingsTab from './admin/GameSettingsTab';
import CrmTab from './admin/CrmTab';
import DynamicPagesTab from './admin/DynamicPagesTab';
import UsersTab from './admin/UsersTab';
import HistoryTab from './admin/HistoryTab';
import SmtpTab from './admin/SmtpTab';
import CurrenciesTab from './admin/CurrenciesTab';
import PaymentMethodsTab from './admin/PaymentMethodsTab';
import TicketsTab from './admin/TicketsTab';
import RedeemCodesTab from './admin/RedeemCodesTab';
import SignupBonusTab from './admin/SignupBonusTab';
import BanSectionTab from './admin/BanSectionTab';
import IntercomTab from './admin/IntercomTab';
import BalanceHistoryTab from './admin/BalanceHistoryTab';

type Tab = PermissionKey | 'handlers' | 'topRankings' | 'balanceHistory' | 'requests' | 'signupBonus' | 'dashboard';

const tabs: { key: Tab; label: string; icon: typeof Cpu }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'finance', label: 'Finance', icon: TrendingUp },
  { key: 'requests', label: 'Deposit/Withdraw', icon: Banknote },
  { key: 'tickets', label: 'Tickets', icon: Headphones },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'staff', label: 'Staff', icon: ShieldCheck },
  { key: 'games', label: 'Games', icon: Gamepad2 },
  { key: 'algos', label: 'Algos', icon: Cpu },
  { key: 'gameSettings', label: '8-Game Settings', icon: Sliders },
  { key: 'banner', label: 'Banners', icon: ImageIcon },
  { key: 'paymentMethods', label: 'Payment Methods', icon: CreditCard },
  { key: 'gateways', label: 'Auto Gateways', icon: Zap },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'marketing', label: 'Marketing', icon: Megaphone },
  { key: 'crm', label: 'CRM', icon: MessageSquare },
  { key: 'email', label: 'Email Manager', icon: Mail },
  { key: 'smtp', label: 'SMTP', icon: Mail },
  { key: 'currencies', label: 'Currencies', icon: Coins },
  { key: 'dynamicPages', label: 'Dynamic Pages', icon: FileText },
  { key: 'redeem', label: 'Redeem Codes', icon: Ticket },
  { key: 'signupBonus', label: 'Signup Bonus', icon: Gift },
  { key: 'handlers', label: 'Handlers', icon: Wallet },
  { key: 'topRankings', label: 'Top Rankings', icon: Trophy },
  { key: 'history', label: 'History', icon: History },
  { key: 'balanceHistory', label: 'Balance History', icon: Wallet },
  { key: 'ban', label: 'Ban Section', icon: ShieldBan },
  { key: 'intercom', label: 'Intercom', icon: BellRing },
  { key: 'notificationManager', label: 'Notif Manager', icon: BellRing },
  { key: 'manageProfile', label: 'Profile', icon: UserCog },
];


export default function AdminView({ onNavigate, onOpenMenu }: { onNavigate: (r: Route) => void; onOpenMenu?: () => void }) {
  const sessionId = useStaffSession();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePassOpen, setChangePassOpen] = useState(false);

  const profileRef = useRef<HTMLDivElement | null>(null);
  const finance = useFinance();
  const support = useSupport();
  const staff = useStaff();
  const me = staff.find((s) => s.id === sessionId);

  // Listen for quick-action navigation events from DashboardOverviewTab
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail as Tab;
      if (detail) setTab(detail);
    };
    window.addEventListener('admin-tab', handler);
    return () => window.removeEventListener('admin-tab', handler);
  }, []);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);

  // Gate: require staff login for admin panel
  if (!sessionId || !me) {
    return <AdminLoginPage />;
  }

  const hasPermission = (key: PermissionKey) => {
    if (me.role === 'super_admin') return true;
    return (me as unknown as { permissions?: Record<string, boolean> }).permissions?.[key] ?? false;
  };

  const pendingDepositCount = finance.deposits.filter((d) => d.status === 'pending' || d.status === 'processing').length;
  const pendingTicketCount = support.filter((t) => t.status === 'open').length;

  return (
    <div className="flex h-screen bg-midnight-900 text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r border-borderline-900 bg-midnight-950 shrink-0">
        <div className="p-4 border-b border-borderline-900">
          <span className="font-display font-extrabold text-neon-400 text-lg tracking-tight">B4Bet Admin</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isCurrent = tab === t.key;
            const badge =
              t.key === 'requests' ? pendingDepositCount :
              t.key === 'tickets' ? pendingTicketCount : 0;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-all relative ${
                  isCurrent
                    ? 'bg-neon-500/15 text-neon-300 border-r-2 border-neon-400'
                    : 'text-slate-400 hover:bg-slatepanel-800/50 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{t.label}</span>
                {badge > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-coral-500 text-white text-[9px] font-bold grid place-items-center">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Profile section */}
        <div className="p-3 border-t border-borderline-900 relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slatepanel-800 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-neon-500/20 border border-neon-500/40 grid place-items-center shrink-0">
              <UserIcon className="w-3.5 h-3.5 text-neon-400" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="text-xs font-semibold text-white truncate">{me.name}</div>
              <div className="text-[10px] text-slate-500 capitalize">{me.role}</div>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
          </button>
          {profileOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-1 panel p-1 space-y-0.5 z-50">
              <button
                onClick={() => { setChangePassOpen(true); setProfileOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slatepanel-800 text-sm text-slate-300 hover:text-white"
              >
                <KeyRound className="w-3.5 h-3.5" /> Change Password
              </button>
              <button
                onClick={() => { cms.clearStaffSession(); setProfileOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-coral-500/10 text-sm text-coral-400 hover:text-coral-300"
              >
                <LogOut className="w-3.5 h-3.5" /> Logout
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="md:hidden flex items-center justify-between p-3 border-b border-borderline-900 bg-midnight-950">
          <button onClick={onOpenMenu} className="text-slate-400 hover:text-white">
            <Cpu className="w-5 h-5" />
          </button>
          <span className="font-display font-extrabold text-neon-400 text-base">B4Bet Admin</span>
          <button onClick={() => setNotifOpen(true)} className="relative text-slate-400 hover:text-white">
            <Bell className="w-5 h-5" />
            {(pendingDepositCount + pendingTicketCount) > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-coral-500 text-white text-[9px] font-bold grid place-items-center">
                {pendingDepositCount + pendingTicketCount}
              </span>
            )}
          </button>
        </header>

        {/* Mobile tab bar */}
        <nav className="md:hidden flex overflow-x-auto scrollbar-thin border-b border-borderline-900 bg-midnight-950">
          {tabs.slice(0, 8).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex flex-col items-center gap-0.5 px-4 py-2 shrink-0 text-[10px] font-semibold transition-colors ${
                  tab === t.key ? 'text-neon-300 border-b-2 border-neon-400' : 'text-slate-500 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Page content */}
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
              <h2 className="font-display font-bold text-lg text-white">Games Management</h2>
              <p className="text-slate-500 text-sm">Manage live game sessions and round outcomes.</p>
            </div>
          )}
          {tab === 'users' && <UsersTab />}
          {tab === 'balanceHistory' && <BalanceHistoryTab />}
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
          {tab === 'topRankings' && (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-lg text-white">Top Rankings</h2>
              <p className="text-slate-500 text-sm">Leaderboard and top winners view.</p>
            </div>
          )}
          {tab === 'manageProfile' && (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-lg text-white">Manage Profile</h2>
              <p className="text-slate-500 text-sm">Update your staff profile settings.</p>
            </div>
          )}
        </main>
      </div>

      {/* Notification panel */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center p-4" onClick={() => setNotifOpen(false)}>
          <div className="w-full max-w-sm panel p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-white">Notifications</h3>
              <button onClick={() => setNotifOpen(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>
            <AdminSupportNotification onOpenTickets={() => { setTab('tickets'); setNotifOpen(false); }} />
          </div>
        </div>
      )}

      {/* Ticket alert overlay */}
      <TicketAlertOverlay onOpenTickets={() => setTab('tickets')} />

      {/* Change password modal */}
      {changePassOpen && (
        <AdminChangePasswordModal
          staffId={sessionId}
          onClose={() => setChangePassOpen(false)}
        />
      )}
    </div>
  );
}
