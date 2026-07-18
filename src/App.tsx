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
import WingoView from './views/WingoView';
import K3View from './views/K3View';
import FiveDView from './views/FiveDView';
import SunVsMoonView from './views/SunVsMoonView';
import TradingGameView from './views/TradingGameView';
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

export default function App() {
  const staffSession = useStaffSession();
  const [route, setRoute] = useState<Route>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      const h = window.location.hash;
      if (p === '/aryan' || p.startsWith('/aryan/') || h === '#aryan' || h === '#/aryan') {
        return 'admin';
      }
    }
    return 'home';
  });
  const [notifOpen, setNotifOpen]           = useState(false);
  const [walletOpen, setWalletOpen]         = useState(false);
  const [supportChatOpen, setSupportChatOpen] = useState(false);

  // Auth modal state
  const [authModalOpen, setAuthModalOpen]   = useState(false);
  const [authModalMode, setAuthModalMode]   = useState<AuthModalMode>('login');

  useEffect(() => {
    const off = bus.on('auth:open_modal', (payload: unknown) => {
      setAuthModalMode(payload === 'signup' ? 'signup' : 'login');
      setAuthModalOpen(true);
    });
    return off;
  }, []);

  const openAuthModal = (mode: AuthModalMode) => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const navigate = (r: Route) => setRoute(r);

  useEffect(() => {
    const off = bus.on('ui:open_support_chat', () => setSupportChatOpen(true));
    return off;
  }, []);

  // Global game engines — keeps all round-based games running in background
  useEffect(() => {
    crashEngine.start();
    startAllPersistentGameEngines();
  }, []);

  const showHeader    = route !== 'admin';
  const showBottomNav = route !== 'admin';

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-slate-950 text-white">
      <GeoBlockOverlay />

      {showHeader && (
        <Header
          route={route}
          onOpenNotifications={() => setNotifOpen(true)}
          onOpenWallet={() => setWalletOpen(true)}
          onBack={undefined}
          onOpenAuthModal={openAuthModal}
          onNavigate={navigate}
        />
      )}

      <main className="flex-1 overflow-y-auto">
        {route === 'home'      && <HomeView onNavigate={navigate} />}
        {route === 'mines'     && <MinesView onNavigate={navigate} />}
        {route === 'games'     && <GamesView onNavigate={navigate} />}
        {route === 'deposit'   && <DepositView onNavigate={navigate} />}
        {route === 'wallet'    && <WalletView onNavigate={navigate} />}
        {route === 'withdraw'  && <WithdrawView onNavigate={navigate} />}
        {route === 'profile'   && (
          <ProfileView
            onNavigate={navigate}
            onOpenSupport={() => setSupportChatOpen(true)}
            onOpenAuthModal={openAuthModal}
            onOpenMenu={() => setWalletOpen(true)}
          />
        )}
        {route === 'referral'  && <ReferralView onNavigate={navigate} onOpenMenu={() => setWalletOpen(true)} />}
        {route === 'admin'     && <AdminView onNavigate={navigate} onOpenMenu={() => setWalletOpen(true)} />}
        {route === 'history'   && <HistoryView onNavigate={navigate} />}

        {route === 'crash'     && <CrashView onNavigate={navigate} />}
        {route === 'aviator'   && <AviatorView onNavigate={navigate} />}
        {route === 'wingo'     && <WingoView onNavigate={navigate} />}
        {route === 'k3'        && <K3View onNavigate={navigate} />}
        {route === 'fived'     && <FiveDView onNavigate={navigate} />}
        {route === 'sunvsmoon' && <SunVsMoonView onNavigate={navigate} />}
        {route === 'trading'   && <TradingGameView onNavigate={navigate} />}
      </main>

      {showBottomNav && (
        <BottomNav route={route} onNavigate={navigate} />
      )}

      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
      <ProfileDrawer
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        onNavigate={navigate}
        onOpenSupport={() => { setWalletOpen(false); setSupportChatOpen(true); }}
        onOpenAuthModal={openAuthModal}
      />
      <SupportChat open={supportChatOpen} onClose={() => setSupportChatOpen(false)} />

      <AuthModal
        open={authModalOpen}
        mode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
      />

      {staffSession && <AdminSupportNotification />}
      <ToastHost />
    </div>
  );
}
