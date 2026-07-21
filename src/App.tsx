import { useState, useEffect } from 'react';
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
import { bus } from './lib/bus';
import { crashEngine } from './lib/crashEngine';
import { startAllPersistentGameEngines } from './lib/persistentGameEngine';
import { useStaffSession } from './lib/cmsHooks';
import { auth } from './lib/auth';
import { supabase } from './integrations/supabase/client';

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

  // Session persistence
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') auth.logout();
    });
    return () => subscription.unsubscribe();
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

      {/* pt-[70px] matches new header height */}
      <div className={showHeader ? 'pb-16 pt-[70px]' : ''}>
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
    </div>
  );
}
