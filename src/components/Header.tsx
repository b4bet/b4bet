import { useEffect, useRef, useState } from 'react';
import { bus, Topics } from '../lib/bus';
import { store } from '../lib/store';
import { useBalance, useNotifications } from '../lib/hooks';
import { useLogo, useTextLogo, useHasUnreadAgentMessage } from '../lib/cmsHooks';
import { Bell, ChevronLeft, AlertCircle, X, LogIn, UserPlus, ArrowDownCircle, Menu } from 'lucide-react';
import { auth } from '../lib/auth';
import type { AuthSession } from '../lib/auth';
import type { AuthModalMode } from './AuthModal';
import type { Route } from './BottomNav';

function formatMoney(n: number) {
  const dec = n % 1 === 0 ? 0 : 2;
  return store.currency + n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: 2 });
}

function BalancePill({ balance, pulse, onClick }: { balance: number; pulse: boolean; onClick: () => void }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const formatted = formatMoney(balance);

  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      const text = textRef.current;
      if (!wrap || !text) return;
      text.style.transform = 'scale(1)';
      const avail = wrap.clientWidth;
      const needed = text.scrollWidth;
      const next = needed > avail && needed > 0 ? Math.max(0.55, avail / needed) : 1;
      setScale(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [formatted]);

  return (
    <div ref={wrapRef} onClick={onClick}
      className={`relative flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slatepanel-800 border ${
        pulse ? 'border-emeraldwin-400/60' : 'border-borderline-900'
      } cursor-pointer overflow-hidden min-w-[72px] max-w-[120px] transition-all`}>
      <span ref={textRef} className="text-white text-xs font-bold tabular-nums whitespace-nowrap" style={{ transform: `scale(${scale})`, transformOrigin: 'left center' }}>
        {formatted}
      </span>
    </div>
  );
}

function InsufficientBalancePopup({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [visible, onClose]);
  if (!visible) return null;
  return (
    <div className="absolute top-full left-0 right-0 z-40 px-3 pt-1.5">
      <div className="flex items-center gap-2 bg-coral-500/15 border border-coral-500/40 rounded-xl px-3 py-2 text-xs text-coral-300 shadow-lg animate-fade-in">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span>Insufficient balance, please deposit</span>
        <button onClick={onClose} className="ml-auto text-coral-400 hover:text-coral-300"><X className="w-3 h-3" /></button>
      </div>
    </div>
  );
}

export default function Header({
  onOpenNotifications,
  onOpenWallet,
  onBack,
  onOpenAuthModal,
  onNavigate,
}: {
  onOpenNotifications: () => void;
  onOpenWallet: () => void;
  onBack?: () => void;
  onOpenAuthModal?: (mode: AuthModalMode) => void;
  onNavigate?: (r: Route) => void;
}) {
  const balance = useBalance();
  const notifications = useNotifications();
  const logo = useLogo();
  const textLogo = useTextLogo();
  const unread = notifications.filter((n) => !n.read).length;
  const hasUnreadChat = useHasUnreadAgentMessage();
  const [pulse, setPulse] = useState(false);
  const [showInsufficientBal, setShowInsufficientBal] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(auth.getSession());

  useEffect(() => {
    const off = bus.on(Topics.Balance, () => { setPulse(true); setTimeout(() => setPulse(false), 400); });
    return off;
  }, []);

  useEffect(() => {
    const off = bus.on(Topics.InsufficientBalance, () => setShowInsufficientBal(true));
    return off;
  }, []);

  useEffect(() => {
    const off = bus.on(Topics.AuthState, (s) => setSession(s as AuthSession | null));
    return off;
  }, []);

  const isLoggedIn = session !== null;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-30 bg-midnight-900/95 backdrop-blur border-b border-borderline-900" style={{ height: '56px' }}>
        <div className="flex items-center gap-2 h-full px-3">
          {/* Hamburger — ALWAYS visible (guest + logged in) */}
          <button onClick={onOpenWallet} className="relative w-9 h-9 rounded-xl grid place-items-center hover:bg-slatepanel-800 transition-colors">
            <Menu className="w-5 h-5 text-slate-300" />
            {hasUnreadChat && isLoggedIn && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-coral-500 rounded-full" />
            )}
          </button>

          {/* Logo */}
          <div className="flex items-center gap-1.5">
            {logo ? (
              <img src={logo} alt="logo" className="h-7 w-auto" />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center">
                <span className="text-white font-black text-xs">M</span>
              </div>
            )}
            {textLogo && <img src={textLogo} alt="" className="h-5 w-auto" />}
            {onBack && (
              <button onClick={onBack} className="flex items-center gap-1 text-slate-400 hover:text-white text-xs ml-1">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
          </div>

          <div className="flex-1" />

          {/* Right cluster */}
          <div className="flex items-center gap-1.5">
            {isLoggedIn ? (
              <>
                <button onClick={() => onNavigate?.('deposit')}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gradient-to-br from-emeraldwin-400 to-emeraldwin-600 text-white text-xs font-bold hover:opacity-90 transition-opacity active:scale-95 shadow-emerald-glow">
                  <ArrowDownCircle className="w-3.5 h-3.5" /> Deposit
                </button>
                <BalancePill balance={balance} pulse={pulse} onClick={onOpenWallet} />
                <button onClick={onOpenNotifications}
                  className="relative w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60 transition-colors">
                  <Bell className="w-4 h-4 text-slate-300" />
                  {unread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-coral-500 text-white text-[9px] font-bold grid place-items-center border border-midnight-900">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => onOpenAuthModal?.('login')}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slatepanel-800 border border-borderline-900 hover:border-neon-400/60 transition-colors text-slate-300 hover:text-white text-xs font-bold active:scale-95">
                  <LogIn className="w-3.5 h-3.5" /> Login
                </button>
                <button onClick={() => onOpenAuthModal?.('signup')}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gradient-to-br from-neon-400 to-neon-600 text-white text-xs font-bold hover:opacity-90 transition-opacity active:scale-95 shadow-neon-glow">
                  <UserPlus className="w-3.5 h-3.5" /> Sign Up
                </button>
                <button onClick={onOpenNotifications}
                  className="relative w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60 transition-colors">
                  <Bell className="w-4 h-4 text-slate-300" />
                  {unread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-coral-500 text-white text-[9px] font-bold grid place-items-center border border-midnight-900">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
        <InsufficientBalancePopup visible={showInsufficientBal} onClose={() => setShowInsufficientBal(false)} />
      </header>
    </>
  );
}
