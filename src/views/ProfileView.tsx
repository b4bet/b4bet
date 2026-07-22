import { useState } from 'react';
import { auth } from '../lib/auth';
import { useAuth } from '../lib/hooks';
import { store } from '../lib/store';
import { getOrCreateAccountId } from '../lib/accountId';
import { X, User, ChevronRight, ShieldCheck, Hash, LogIn, UserPlus, Mail, Phone, Lock, Gift, TicketPercent } from 'lucide-react';
import type { Route } from '../components/BottomNav';
import type { AuthModalMode } from '../components/AuthModal';

export default function ProfileView({
  onNavigate,
  onOpenAuthModal,
  onOpenMenu,
}: {
  onNavigate: (r: Route) => void;
  onOpenSupportChat?: () => void;
  onOpenAuthModal?: (mode: AuthModalMode) => void;
  onOpenMenu?: () => void;
}) {
  const session = useAuth();
  const accountId = session ? session.accountId : getOrCreateAccountId();
  const userMobile = session
    ? auth.getUsers().find((u) => u.id === session.userId)?.mobile ?? '—'
    : '—';

  // ── Logged-out state ──────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="font-display font-extrabold text-xl text-white">Account</h1>
            <p className="text-xs text-slate-500">Login or create an account</p>
          </div>
          <button onClick={() => onNavigate('home')} className="md:hidden w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center">
            <X className="w-5 h-5 text-slate-300" />
          </button>
        </div>

        <div className="panel p-8 flex flex-col items-center gap-5">
          <div className="w-20 h-20 rounded-3xl bg-slatepanel-800 border border-borderline-900 grid place-items-center">
            <User className="w-10 h-10 text-slate-500" />
          </div>
          <div className="text-center space-y-1">
            <h2 className="font-display font-bold text-lg text-white">You're not logged in</h2>
            <p className="text-sm text-slate-400">Sign in to view your profile, balance and history.</p>
          </div>
          <div className="w-full space-y-3">
            <button
              onClick={() => onOpenAuthModal?.('login')}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" /> Login
            </button>
            <button
              onClick={() => onOpenAuthModal?.('signup')}
              className="w-full py-3 rounded-xl bg-slatepanel-800 border border-borderline-900 hover:border-neon-400/60 transition-colors text-white font-bold flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" /> Sign Up
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Logged-in state ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display font-extrabold text-xl text-white">Profile</h1>
          <p className="text-xs text-slate-500">Account & security</p>
        </div>
        <button onClick={() => onNavigate('home')} className="md:hidden w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center">
          <X className="w-5 h-5 text-slate-300" />
        </button>
      </div>

      {/* Profile card — read-only details */}
      <div className="panel p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center shadow-neon-glow">
            <User className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-bold text-lg text-white truncate">{session.username}</h2>
            <span className="inline-flex items-center gap-1 chip mt-1 bg-emeraldwin-500/15 border border-emeraldwin-500/40 text-emeraldwin-400 text-[10px]">
              <ShieldCheck className="w-3 h-3" /> Verified
            </span>
          </div>
        </div>

        <div className="space-y-2 rounded-xl bg-midnight-850 border border-borderline-900 p-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Hash className="w-3 h-3 text-neon-300" />
            <span className="tabular tracking-wider font-semibold text-neon-200">ID #{accountId}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Mail className="w-3 h-3 text-slate-500" />
            <span className="truncate text-slate-300">{session.email}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Phone className="w-3 h-3 text-slate-500" />
            <span className="tabular text-slate-300">{userMobile}</span>
          </div>
        </div>

        <button
          onClick={() => onOpenAuthModal?.('change')}
          className="w-full flex items-center gap-3 p-4 rounded-2xl bg-slatepanel-800 border border-borderline-900 hover:border-neon-400/60 transition-colors text-left"
        >
          <Lock className="w-5 h-5 text-neon-300" />
          <span className="flex-1 text-sm font-semibold text-white">Change Password</span>
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>
      </div>
    </div>
  );
}

/** Redeem Code Section — uses real Supabase userId for tracking */
export function RedeemCodeSection() {
  const session = useAuth();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<
    | { kind: 'success'; message: string }
    | { kind: 'used'; message: string }
    | { kind: 'invalid'; message: string }
    | null
  >(null);

  const apply = async () => {
    if (submitting) return;
    const trimmed = code.trim();
    if (!trimmed) return;

    // Use real Supabase userId if logged in, else fallback to anonymous accountId
    const userId = session?.userId ?? getOrCreateAccountId();

    setSubmitting(true);
    try {
      const result = await store.applyRedeemCodeAsync(trimmed, userId);
      if (result.status === 'success') {
        setStatus({
          kind: 'success',
          message: `Success! ${store.currency}${result.bonus} bonus credited.`,
        });
        setCode('');
      } else if (result.status === 'used') {
        setStatus({ kind: 'used', message: 'This code has already been used.' });
      } else {
        setStatus({ kind: 'invalid', message: 'Invalid code. Please check and try again.' });
      }
    } catch {
      setStatus({ kind: 'invalid', message: 'Something went wrong. Please try again.' });
    } finally {
      setTimeout(() => setSubmitting(false), 500);
    }
  };

  const statusStyle =
    status?.kind === 'success'
      ? 'bg-emeraldwin-500/15 border-emeraldwin-400/40 text-emeraldwin-300'
      : status?.kind === 'used'
        ? 'bg-amberx-500/15 border-amberx-400/40 text-amberx-300'
        : 'bg-coral-500/15 border-coral-400/40 text-coral-300';

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Gift className="w-5 h-5 text-neon-300" />
        <h3 className="font-display font-bold text-white text-sm">Redeem Code</h3>
      </div>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (status) setStatus(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!submitting) void apply();
            }
          }}
          placeholder="Enter redeem code..."
          className="input flex-1 text-sm py-2"
          disabled={submitting}
        />
        <button
          type="button"
          onClick={() => void apply()}
          disabled={submitting}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <TicketPercent className="w-4 h-4" /> {submitting ? 'Applying…' : 'Apply'}
        </button>
      </div>
      {status && (
        <div
          role="status"
          aria-live="polite"
          className={`text-xs font-semibold rounded-lg border px-3 py-2 ${statusStyle}`}
        >
          {status.message}
        </div>
      )}
    </div>
  );
}
