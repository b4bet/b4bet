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
import WingoView from './views/WingoView';
import K3View from './views/K3View';
import FiveDView from './views/FiveDView';
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

// Check if current page was loaded while maintenance was OFF.
// If maintenance is now ON and JS is from old cache, force a hard reload
// so the browser fetches fresh JS bundle and shows the maintenance page.
const MAINTENANCE_FLAG = 'b4bet_maint_v1';

function applyMaintenance(cfg: MaintenanceConfig | null, isStaff: boolean, isAdmin: boolean) {
  if (!cfg?.enabled || isStaff || isAdmin) return false;

  // If the maintenance flag is already set this session, no reload needed
  if (sessionStorage.getItem(MAINTENANCE_FLAG) === '1') return true;

  // Set flag and hard-reload to bust JS cache
  sessionStorage.setItem(MAINTENANCE_FLAG, '1');
  window.location.reload();
  return true;
}

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

  // Clear the reload flag when maintenance is turned OFF so future ON triggers reload again
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

  // Load maintenance mode + realtime + polling so cache never causes a stale state
  useEffect(() => {
    const isAdminRoute = window.location.pathname === '/aryan' ||
      window.location.hash === '#aryan' || window.location.hash === '#/aryan';

    const handleConfig = (cfg: MaintenanceConfig | null) => {
      if (cfg !== null) {
        setMaintenance(cfg);
        // If we just loaded and maintenance is ON — force hard reload to bust JS cache
        applyMaintenance(cfg, !!staffSession, isAdminRoute);
      }
    };

    // Initial load
    void fetchMaintenanceConfig().then(handleConfig);

    // Realtime subscription — fires instantly when admin toggles maintenance
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
            // Hard reload so cached JS is replaced with fresh bundle
            applyMaintenance(cfg, !!staffSession, isAdminRoute);
          }
        },
      )
      .subscribe();

    // Polling fallback every 10s — catches cache/network misses
    pollTimerRef.current = setInterval(() => {
      void fetchMaintenanceConfig().then(handleConfig);
    }, 10_000);

    // Re-fetch when the tab becomes visible (user switches back from another tab)
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

  const showHeader = route !== 'admin' && route !== 'affiliate' && route !== 'landing';
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
    <div className="min-h-screen bg-slatepanel-950 text-white">
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

      <div className={showHeader ? 'pb-16 pt-[62px]' : ''}>
        {route === 'home' && <HomeView onNavigate={navigate} />}
        {route === 'mines' && <MinesView onNavigate={navigate} />}
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
        {route === 'referral' && <ReferralView onNavigate={navigate} onOpenMenu={() => setWalletOpen(true)} />}
        {route === 'admin' && <AdminView onNavigate={navigate} onOpenMenu={() => setWalletOpen(true)} />}
        {route === 'history' && <HistoryView onNavigate={navigate} />}
        {route === 'ludo' && <LudoView onBack={() => navigate('home')} />}
        {route === 'crash' && <CrashView onNavigate={navigate} />}
        {route === 'aviator' && <AviatorView onBack={() => navigate('home')} />}
        {route === 'wingo' && <WingoView onNavigate={navigate} />}
        {route === 'k3' && <K3View onNavigate={navigate} />}
        {route === 'fived' && <FiveDView onNavigate={navigate} />}
        {route === 'sunvsmoon' && <SunVsMoonView onNavigate={navigate} />}
        {route === 'trading' && <TradingGameView onNavigate={navigate} />}
        {route === 'affiliate' && <AffiliatePortalView onBack={() => navigate('home')} />}
        {route === 'landing' && <LandingPage onNavigate={navigate} />}
      </div>

      {showBottomNav && <BottomNav route={route} onNavigate={navigate} />}

      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
      <ProfileDrawer
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        onNavigate={navigate}
        onOpenSupport={() => { setWalletOpen(false); setSupportChatOpen(true); }}
        onOpenAuthModal={openAuthModal}
      />
      <SupportChat open={supportChatOpen} onClose={() => setSupportChatOpen(false)} />
      <AuthModal open={authModalOpen} initialMode={authModalMode} onClose={() => setAuthModalOpen(false)} />
      {staffSession && <AdminSupportNotification />}

      {isLoggedIn && <BanPopup />}
    </div>
  );
}
