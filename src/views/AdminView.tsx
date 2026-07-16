import { useMemo, useState, useEffect, useRef } from 'react';
import GameAlgosTab, { CrashHandlingPanel, TopRankingsAdminPanel, AviatorHandlingPanel, WingoHandlingPanel, K3HandlingPanel, FiveDHandlingPanel, SunMoonHandlingPanel, OnlineCountPanel, TopWinPaidOutPanel } from './admin/GameAlgosTab';
import GameSettingsTab from './admin/GameSettingsTab';
import PaymentMethodsTab from './admin/PaymentMethodsTab';
import DynamicPagesTab from './admin/DynamicPagesTab';
import UsersTab from './admin/UsersTab';
import HistoryTab from './admin/HistoryTab';
import SmtpTab from './admin/SmtpTab';
import CurrenciesTab from './admin/CurrenciesTab';
import CrmTab from './admin/CrmTab';
import IntercomTab from './admin/IntercomTab';
import BannerLogoTab from './admin/BannerLogoTab';
import FinanceTab from './admin/FinanceTab';
import RequestsTab from './admin/RequestsTab';

import EmailManagerTab from './admin/EmailManagerTab';
import StaffTab from './admin/StaffTab';
import MarketingTab from './admin/MarketingTab';
import NotificationsTab from './admin/NotificationsTab';
import AutoGatewaysTab from './admin/AutoGatewaysTab';
import TicketsTab from './admin/TicketsTab';
import RedeemCodesTab from './admin/RedeemCodesTab';
import BanSectionTab from './admin/BanSectionTab';
import BalanceHistoryTab from './admin/BalanceHistoryTab';
import SignupBonusTab from './admin/SignupBonusTab';
import NotificationManagerTab from './admin/NotificationManagerTab';
import TicketAlertOverlay from '../components/TicketAlertOverlay';
import AdminSupportNotification from '../components/AdminSupportNotification';
import {
  Cpu, Users, Mail, Coins, Megaphone, Headphones, ShieldCheck,
  Image as ImageIcon, TrendingUp, Wallet, UserCog, Bell, Banknote, MessageSquare, Zap, History,
  TrendingDown, Ticket, Sliders, CreditCard, FileText, ShieldBan, BellRing, Gamepad2, Trophy, Gift,
  User as UserIcon, KeyRound, LogOut, ChevronDown,
} from 'lucide-react';
import type { Route } from '../components/BottomNav';
import { useFinance, useSupport, useStaff, useStaffSession } from '../lib/cmsHooks';
import { cms, type PermissionKey } from '../lib/cms';
import AdminLoginPage from '../components/AdminLoginPage';
import AdminChangePasswordModal from '../components/AdminChangePasswordModal';

type Tab = PermissionKey | 'handlers' | 'topRankings' | 'balanceHistory' | 'requests' | 'signupBonus';

const tabs: { key: Tab; label: string; icon: typeof Cpu }[] = [
  { key: 'finance', label: 'Finance', icon: TrendingUp },
  { key: 'requests', label: 'Deposit/Withdraw', icon: Banknote },
  { key: 'tickets', label: 'Live Tickets', icon: Headphones },

  { key: 'gateways', label: 'Auto Gateways', icon: Zap },
  { key: 'handlers', label: 'Handlers', icon: Gamepad2 },
  { key: 'paymentMethods', label: 'Payment Methods', icon: CreditCard },
  { key: 'dynamicPages', label: 'Dynamic Pages', icon: FileText },
  { key: 'redeem', label: 'Redeem Codes', icon: Ticket },
  { key: 'signupBonus', label: 'Signup Bonus', icon: Gift },
  { key: 'gameSettings', label: '8-Game Settings', icon: Sliders },
  { key: 'banner', label: 'Banners & Logo', icon: ImageIcon },
  { key: 'emails', label: 'Email Manager', icon: Mail },
  { key: 'staff', label: 'Staff & Chat', icon: UserCog },
  { key: 'marketing', label: 'Marketing', icon: Megaphone },
  { key: 'algos', label: 'Game Algos', icon: Cpu },
  { key: 'users', label: 'User Profiles', icon: Users },
  { key: 'balanceHistory', label: 'Balance History', icon: Wallet },
  { key: 'history', label: 'History', icon: History },
  { key: 'smtp', label: 'SMTP Setup', icon: Mail },
  { key: 'currencies', label: 'Currencies', icon: Coins },
  { key: 'crm', label: 'CRM Campaign', icon: Megaphone },
  { key: 'intercom', label: 'Intercom Chat', icon: Headphones },
  { key: 'notify', label: 'Notifications', icon: Bell },
  { key: 'ban', label: 'Ban Section', icon: ShieldBan },
  { key: 'notifyManager', label: 'Notification Manager', icon: BellRing },
];


export default function AdminView({ onNavigate, onOpenMenu }: { onNavigate: (r: Route) => void; onOpenMenu?: () => void }) {
  const sessionId = useStaffSession();
  const [tab, setTab] = useState<Tab>('finance');
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePassOpen, setChangePassOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const finance = useFinance();
  const support = useSupport();
  const staff = useStaff();
  const me = sessionId ? staff.find((s) => s.id === sessionId) ?? null : null;

  // Close profile dropdown when clicking outside
  useEffect(() => {
    if (!profileOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [profileOpen]);

  // Gate: require staff login for admin panel
  if (!sessionId || !me) {
    return <AdminLoginPage />;
  }

  const visibleTabs = tabs.filter((t) => {
    if (t.key === 'handlers' || t.key === 'topRankings' || t.key === 'requests' || t.key === 'signupBonus') return true;
    return !!(me.permissions as any)?.[t.key];
  });
  const pendingDeposits = finance.deposits.filter((d) => d.status === 'pending').length;
  const pendingWithdrawals = finance.withdrawals.filter((w) => w.status === 'pending').length;
  const unreadSupport = support.filter((s) => !s.read).length;
  const totalUnread = pendingDeposits + pendingWithdrawals + unreadSupport;


  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top header with notification badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <h1 className="font-display font-extrabold text-xl text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-neon-300" /> Admin Dashboard
          </h1>
          <p className="text-xs text-slate-500">Master command control</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setNotifOpen((o) => !o)}
              className="relative w-10 h-10 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60 transition-colors"
              aria-label="Admin notifications"
            >
              <Bell className="w-5 h-5 text-slate-300" />
              {totalUnread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-coral-500 text-white text-[10px] font-bold grid place-items-center border-2 border-midnight-900">
                  {totalUnread}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-12 z-30 w-72 panel border border-borderline-900 bg-midnight-900/95 backdrop-blur-xl p-2">
                <NotifRow icon={Banknote} accent="text-emeraldwin-300" label="Pending deposits" count={pendingDeposits} onClick={() => { setTab('finance'); setNotifOpen(false); }} />
                <NotifRow icon={Wallet} accent="text-coral-300" label="Pending withdrawals" count={pendingWithdrawals} onClick={() => { setTab('finance'); setNotifOpen(false); }} />
                <NotifRow icon={MessageSquare} accent="text-neon-300" label="Unread support messages" count={unreadSupport} onClick={() => { cms.markSupportRead(); setNotifOpen(false); }} />
              </div>
            )}
          </div>

          {/* Profile menu — current username + Change Password + Logout */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((o) => !o)}
              className="flex items-center gap-2 h-10 px-2.5 rounded-xl bg-slatepanel-800 border border-borderline-900 hover:border-neon-400/60 transition-colors"
              aria-label="Admin profile"
            >
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center">
                <UserIcon className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-xs font-bold text-white max-w-[100px] truncate">{me.name}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 z-30 w-60 panel border border-borderline-900 bg-midnight-900/95 backdrop-blur-xl p-2">
                <div className="px-3 py-2 border-b border-borderline-900 mb-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Signed in as</div>
                  <div className="text-sm text-white font-bold truncate">{me.name}</div>
                  {me.email && <div className="text-[11px] text-slate-500 truncate">{me.email}</div>}
                </div>
                <button
                  onClick={() => { setProfileOpen(false); setChangePassOpen(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slatepanel-800 transition-colors text-left"
                >
                  <KeyRound className="w-4 h-4 text-neon-300" />
                  <span className="text-sm text-slate-200 font-semibold">Change Password</span>
                </button>
                <button
                  onClick={() => { setProfileOpen(false); cms.setStaffSession(null); cms.toast({ title: 'Signed out', body: 'You have been signed out.', kind: 'info' }); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slatepanel-800 transition-colors text-left"
                >
                  <LogOut className="w-4 h-4 text-coral-300" />
                  <span className="text-sm text-slate-200 font-semibold">Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all border ${active ? 'bg-slatepanel-700 border-slate-500 text-white' : 'bg-slatepanel-800 border-borderline-900 text-slate-400 hover:text-white hover:border-borderline-800'}`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div>
        {me && tab !== 'handlers' && tab !== 'topRankings' && tab !== 'requests' && tab !== 'signupBonus' && !(me.permissions as any)?.[tab] ? (
          <div className="panel p-6 text-center text-slate-400">
            <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-coral-400" />
            Access restricted for this section.
          </div>
        ) : (
          <>
            {tab === 'finance' && <FinanceTab />}
            {tab === 'requests' && <RequestsTab />}

            {tab === 'tickets' && <TicketsTab />}
            {tab === 'gateways' && <AutoGatewaysTab />}
            {tab === 'handlers' && (
              <div className="space-y-4">
                <OnlineCountPanel />
                <TopWinPaidOutPanel />
                <CrashHandlingPanel />
                <AviatorHandlingPanel />
                <WingoHandlingPanel />
                <K3HandlingPanel />
                <FiveDHandlingPanel />
                <SunMoonHandlingPanel />
              </div>
            )}
            {tab === 'paymentMethods' && <PaymentMethodsTab />}
            {tab === 'dynamicPages' && <DynamicPagesTab />}
            {tab === 'banner' && <BannerLogoTab />}
            {tab === 'redeem' && <RedeemCodesTab />}
            {tab === 'signupBonus' && <SignupBonusTab />}
            {tab === 'gameSettings' && <GameSettingsTab />}
            {tab === 'emails' && <EmailManagerTab />}
            {tab === 'staff' && <StaffTab />}
            {tab === 'marketing' && <MarketingTab />}
            {tab === 'algos' && <GameAlgosTab />}
            {tab === 'users' && <UsersTab />}
            {tab === 'balanceHistory' && <BalanceHistoryTab />}
            {tab === 'history' && <HistoryTab />}
            {tab === 'smtp' && <SmtpTab />}
            {tab === 'currencies' && <CurrenciesTab />}
            {tab === 'crm' && <CrmTab />}
            {tab === 'intercom' && <IntercomTab />}
            {tab === 'notify' && <NotificationsTab />}
            {tab === 'ban' && <BanSectionTab />}
            {tab === 'notifyManager' && <NotificationManagerTab />}
            {tab === 'topRankings' && <TopRankingsAdminPanel />}
          </>
        )}
      </div>

      <TicketAlertOverlay />
      <AdminSupportNotification />

      <AdminChangePasswordModal
        open={changePassOpen}
        onClose={() => setChangePassOpen(false)}
        staffId={me.id}
        staffName={me.name}
      />
    </div>
  );
}

function NotifRow({ icon: Icon, accent, label, count, onClick }: { icon: typeof Bell; accent: string; label: string; count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slatepanel-800 transition-colors">
      <span className="flex items-center gap-2 text-sm text-slate-200">
        <Icon className={`w-4 h-4 ${accent}`} /> {label}
      </span>
      <span className={`chip text-[10px] tabular ${count > 0 ? 'bg-coral-500/20 text-coral-300' : 'bg-midnight-850 text-slate-500'}`}>{count}</span>
    </button>
  );
}
