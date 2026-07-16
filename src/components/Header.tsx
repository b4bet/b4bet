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

/** Format money with compact Indian locale and no decimals when .00 */
function formatMoney(n: number) {
  const dec = n % 1 === 0 ? 0 : 2;
  return store.currency + n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: 2 });
}

/** Auto-shrinking balance pill. */
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
    <button
      onClick={onClick}
      className={`group min-w-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slatepanel-800 border border-borderline-900 hover:border-neon-400/60 transition-all ${pulse ? 'ring-2 ring-emeraldwin-500/40' : ''}`}
      style={{ maxWidth: '100%' }}
    >
      <div ref={wrapRef} className="min-w-0 flex-1 overflow-hidden">
        <span
          ref={textRef}
          className="tabular font-bold text-xs text-emeraldwin-400 whitespace-nowrap inline-block origin-right"
          style={{ transform: `scale(${scale})` }}
        >
          {formatted}
        </span>
      </div>
    </button>
  );
}

/** Insufficient balance popup — slides up from the bottom of the header area. */
function InsufficientBalancePopup({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] pointer-events-none flex items-center justify-center px-4 w-full max-w-sm">
      <div className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl bg-coral-500 text-white shadow-2xl animate-fade-in w-full">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <p className="text-sm font-bold flex-1">Insufficient balance, please deposit</p>
        <button onClick={onClose} className="flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity">
          <X className="w-4 h-4" />
        </button>
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
  /** When provided a Back button renders immediately right of the last logo (spec §1). */
  onBack?: () => void;
  /** Opens the floating auth modal with the given mode. */
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
    const off = bus.on(Topics.Balance, () => {
      setPulse(true);
      setTimeout(() => setPulse(false), 400);
    });
    return off;
  }, []);

  useEffect(() => {
    const off = bus.on(Topics.InsufficientBalance, () => {
      setShowInsufficientBal(true);
    });
    return off;
  }, []);

  useEffect(() => {
    const off = bus.on(Topics.AuthState, (s) => setSession(s as AuthSession | null));
    return off;
  }, []);

  const isLoggedIn = session !== null;

  return (
    <>
      <header className="sticky top-0 z-40 bg-midnight-900/85 backdrop-blur-xl border-b border-borderline-900">
        <div className="max-w-6xl mx-auto pl-0 pr-2 sm:pr-3 h-14 flex items-center gap-1">
          {/* Hamburger menu — pinned to the far left, taller icon, seamless (no box) */}
          {isLoggedIn && (
            <button
              onClick={onOpenWallet}
              className="relative -ml-1 h-14 w-11 grid place-items-center text-slate-200 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-8 h-8" strokeWidth={2.25} />
              {hasUnreadChat && (
                <span className="absolute top-2 right-1 w-2.5 h-2.5 rounded-full bg-coral-500 border-2 border-midnight-900 animate-pulse" />
              )}
            </button>
          )}

          {/* Logo block — shifted slightly left (tight gap after hamburger). Back button sits right of last logo. */}
          <div className={`flex items-center gap-2 flex-shrink-0 ${isLoggedIn ? '-ml-0.5' : 'pl-2 sm:pl-3'}`}>
            {logo ? (
              <img src={logo} alt="Logo" className="w-12 h-12 object-contain" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center">
                <span className="font-display font-extrabold text-white text-lg leading-none">M</span>
              </div>
            )}
            {textLogo && (
              <img src={textLogo} alt="Brand" className="h-7 max-w-[120px] object-contain" />
            )}
            {/* Back button — immediately right of last logo (spec §1) */}
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-0.5 h-7 px-2 rounded-lg bg-slatepanel-800 border border-borderline-900 hover:border-neon-400/60 transition-colors text-slate-300 hover:text-white active:scale-95 flex-shrink-0"
                aria-label="Go back"
              >
                <ChevronLeft className="w-3 h-3" strokeWidth={2.5} />
                <span className="text-[10px] font-bold">Back</span>
              </button>
            )}
          </div>

          {/* Right cluster — Deposit, Balance and Notification kept close together on the right */}
          <div className="flex-1 min-w-0 flex justify-end items-center">
            {isLoggedIn ? (
              /* Logged-in: Deposit (left) → Balance → Notification, tightly grouped */
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  onClick={() => onNavigate?.('deposit')}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gradient-to-br from-emeraldwin-400 to-emeraldwin-600 text-white text-xs font-bold hover:opacity-90 transition-opacity active:scale-95 shadow-emeraldwin-glow flex-shrink-0"
                >
                  <ArrowDownCircle className="w-3.5 h-3.5" />
                  Deposit
                </button>
                <div className="min-w-0 flex-shrink">
                  <BalancePill balance={balance} pulse={pulse} onClick={onOpenWallet} />
                </div>
                <button
                  onClick={onOpenNotifications}
                  className="relative w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60 transition-colors flex-shrink-0"
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4 text-slate-300" />
                  {unread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-coral-500 text-white text-[8px] font-bold grid place-items-center border-2 border-midnight-900">
                      {unread}
                    </span>
                  )}
                </button>
              </div>
            ) : (
              /* Guest: show Login / Sign Up buttons + Notification */
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenAuthModal?.('login')}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slatepanel-800 border border-borderline-900 hover:border-neon-400/60 transition-colors text-slate-300 hover:text-white text-xs font-bold active:scale-95"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Login
                </button>
                <button
                  onClick={() => onOpenAuthModal?.('signup')}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gradient-to-br from-neon-400 to-neon-600 text-white text-xs font-bold hover:opacity-90 transition-opacity active:scale-95 shadow-neon-glow"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Sign Up
                </button>
                <button
                  onClick={onOpenNotifications}
                  className="relative w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60 transition-colors flex-shrink-0"
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4 text-slate-300" />
                  {unread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-coral-500 text-white text-[8px] font-bold grid place-items-center border-2 border-midnight-900">
                      {unread}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>


      <InsufficientBalancePopup
        visible={showInsufficientBal}
        onClose={() => setShowInsufficientBal(false)}
      />
    </>
  );
}
