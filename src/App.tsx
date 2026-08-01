import { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import BottomNav, { type Route } from './components/BottomNav';
import HomeView from './views/HomeView';
import CrashView from './views/CrashView';
import MinesView from './views/MinesView';
import AviatorView from './views/AviatorView';
import GamesView from './views/GamesView';
import DepositView from './views/DepositView';
import WalletView from './views/WalletView';
import WithdrawView from './views/WithdrawView';
import ProfileView from './views/ProfileView';
import ReferralView from './views/ReferralView';
import AdminView from './views/AdminView';
import HistoryView from './views/HistoryView';
import LudoView from './views/LudoView';
import SunVsMoonView from './views/SunVsMoonView';
import TradingGameView from './views/TradingGameView';
import AffiliatePortalView from './views/AffiliatePortalView';
import LandingPage from './views/LandingPage';
import NotificationDrawer from './components/NotificationDrawer';
import ProfileDrawer from './components/ProfileDrawer';
import ToastHost from './components/ToastHost';
import GeoBlockOverlay from './components/GeoBlockOverlay';
import SupportChat from './components/SupportChat';
import AuthModal, { type AuthModalMode } from './components/AuthModal';
import AdminSupportNotification from './components/AdminSupportNotification';
import BanPopup from './components/BanPopup';
import MaintenancePage from './components/MaintenancePage';
import { bus } from './lib/bus';
import { crashEngine } from './lib/crashEngine';
import { startAllPersistentGameEngines } from './lib/persistentGameEngine';
import { useStaffSession } from './lib/cmsHooks';
import { auth } from './lib/auth';
import { supabase } from './integrations/supabase/client';

interface MaintenanceConfig {
  enabled: boolean;
  title: string;
  message: string;
  estimated_time: string;
}

async function fetchMaintenanceConfig(): Promise<MaintenanceConfig | null> {
  try {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'maintenance_mode')
      .single();
    if (data?.value) {
      const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      return val as MaintenanceConfig;
    }
  } catch {
    // settings table may not have this key yet — ignore
  }
  return null;
}

const MAINTENANCE_FLAG = 'b4bet_maint_v1';

function applyMaintenance(cfg: MaintenanceConfig | null, isStaff: boolean, isAdmin: boolean) {
  if (!cfg?.enabled || isStaff || isAdmin) return false;
  if (sessionStorage.getItem(MAINTENANCE_FLAG) === '1') return true;
  sessionStorage.setItem(MAINTENANCE_FLAG, '1');
  window.location.reload();
  return true;
}

// Routes where header should be hidden (full-screen game/admin routes)
const ROUTES_WITHOUT_HEADER: Route[] = ['admin', 'affiliate', 'landing', 'crash', 'mines', 'aviator', 'sunvsmoon', 'trading'];

export default function App() {
  const staffSession = useStaffSession();
  const [route, setRoute] = useState<Route>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      const h = window.location.hash;
      if (p === '/aryan' || p.startsWith('/aryan/') || h === '#aryan' || h === '#/aryan') return 'admin';
      if (p === '/affiliate' || h === '#affiliate') return 'affiliate';
      if (p === '/landing') return 'landing';
    }
    return 'home';
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [supportChatOpen, setSupportChatOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintenanceConfig | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (maintenance && !maintenance.enabled) {
      sessionStorage.removeItem(MAINTENANCE_FLAG);
    }
  }, [maintenance?.enabled]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        auth.logout();
        setIsLoggedIn(false);
      } else if (session) {
        setIsLoggedIn(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const isAdminRoute = window.location.pathname === '/aryan' ||
      window.location.hash === '#aryan' || window.location.hash === '#/aryan';

    const handleConfig = (cfg: MaintenanceConfig | null) => {
      if (cfg !== null) {
        setMaintenance(cfg);
        applyMaintenance(cfg, !!staffSession, isAdminRoute);
      }
    };

    void fetchMaintenanceConfig().then(handleConfig);

    const channel = supabase
      .channel('maintenance_mode_watch')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'settings', filter: 'key=eq.maintenance_mode' },
        (payload) => {
          if (payload.new?.value) {
            const val = typeof payload.new.value === 'string'
              ? JSON.parse(payload.new.value as string)
              : payload.new.value;
            const cfg = val as MaintenanceConfig;
            setMaintenance(cfg);
            applyMaintenance(cfg, !!staffSession, isAdminRoute);
          }
        },
      )
      .subscribe();

    pollTimerRef.current = setInterval(() => {
      void fetchMaintenanceConfig().then(handleConfig);
    }, 10_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchMaintenanceConfig().then(handleConfig);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      void supabase.removeChannel(channel);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const off = bus.on('auth:open_modal', (payload: unknown) => {
      setAuthModalMode(payload === 'signup' ? 'signup' : 'login');
      setAuthModalOpen(true);
    });
    return off;
  }, []);

  const openAuthModal = (mode: AuthModalMode) => { setAuthModalMode(mode); setAuthModalOpen(true); };
  const navigate = (r: Route) => setRoute(r);

  useEffect(() => {
    const off = bus.on('ui:open_support_chat', () => setSupportChatOpen(true));
    return off;
  }, []);

  useEffect(() => {
    crashEngine.start();
    startAllPersistentGameEngines();
  }, []);

  const showHeader = !ROUTES_WITHOUT_HEADER.includes(route);
  const showBottomNav = route !== 'admin' && route !== 'affiliate' && route !== 'landing';

  const isAdminRoute = route === 'admin';
  const isStaffLoggedIn = !!staffSession;
  const showMaintenance = maintenance?.enabled && !isAdminRoute && !isStaffLoggedIn;

  if (showMaintenance) {
    return (
      <MaintenancePage
        title={maintenance?.title}
        message={maintenance?.message}
        estimatedTime={maintenance?.estimated_time}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <GeoBlockOverlay />
      <ToastHost />

      {showHeader && (
        <Header
          onOpenNotifications={() => setNotifOpen(true)}
          onOpenWallet={() => setWalletOpen(true)}
          onBack={undefined}
          onOpenAuthModal={openAuthModal}
          onNavigate={navigate}
        />
      )}

      <main className={showHeader ? 'pt-[62px]' : ''}>
        {route === 'home' && <HomeView onNavigate={navigate} />}
        {route === 'mines' && <MinesView />}
        {route === 'games' && <GamesView onNavigate={navigate} />}
        {route === 'deposit' && <DepositView onNavigate={navigate} />}
        {route === 'wallet' && <WalletView onNavigate={navigate} />}
        {route === 'withdraw' && <WithdrawView onNavigate={navigate} />}
        {route === 'profile' && (
          <ProfileView
            onNavigate={navigate}
            onOpenSupport={() => setSupportChatOpen(true)}
            onOpenAuthModal={openAuthModal}
            onOpenMenu={() => setWalletOpen(true)}
          />
        )}
        {route === 'referral' && <ReferralView onNavigate={navigate} onOpenWallet={() => setWalletOpen(true)} />}
        {route === 'admin' && <AdminView onNavigate={navigate} onOpenWallet={() => setWalletOpen(true)} />}
        {route === 'history' && <HistoryView onClose={() => navigate('home')} />}
        {route === 'ludo' && <LudoView onBack={() => navigate('home')} />}
        {route === 'crash' && <CrashView />}
        {route === 'aviator' && <AviatorView onBack={() => navigate('home')} />}
        {route === 'sunvsmoon' && <SunVsMoonView />}
        {route === 'trading' && <TradingGameView />}
        {route === 'affiliate' && <AffiliatePortalView onBack={() => navigate('home')} />}
        {route === 'landing' && <LandingPage onNavigate={navigate} />}
      </main>

      {showBottomNav && <BottomNav current={route} onNavigate={navigate} />}

      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
      <ProfileDrawer
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        onNavigate={navigate}
        onOpenSupport={() => { setWalletOpen(false); setSupportChatOpen(true); }}
        onOpenAuthModal={openAuthModal}
      />
      <SupportChat open={supportChatOpen} onClose={() => setSupportChatOpen(false)} />
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      {staffSession && <AdminSupportNotification />}

      {isLoggedIn && <BanPopup />}
    </div>
  );
}
