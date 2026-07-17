// Floating authentication modal — Login, Signup, and Forgot Password.
// Accessible from the main Header via Login / Sign Up buttons.
// Uses the existing PasswordInput component for all password fields (Eye toggle built-in).
// Connects to the Admin's SMTP settings via lib/auth for forgot-password emails.

import { useState, useEffect } from 'react';
import { X, Mail, User, KeyRound, Tag, ArrowLeft, Loader2 } from 'lucide-react';
import PasswordInput from './PasswordInput';
import { auth } from '../lib/auth';
import { bus, Topics } from '../lib/bus';

export type AuthModalMode = 'login' | 'signup' | 'forgot' | 'change';

interface Props {
  open: boolean;
  initialMode?: AuthModalMode;
  onClose: () => void;
}

export default function AuthModal({ open, initialMode = 'login', onClose }: Props) {
  const [mode, setMode] = useState<AuthModalMode>(initialMode);

  // Reset mode whenever the modal opens
  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  // Scroll-lock the background while the modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[300] bg-midnight-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[301] flex items-center justify-center px-4 pointer-events-none"
      >
        <div className="pointer-events-auto w-full max-w-sm bg-slatepanel-900 border border-borderline-900 rounded-2xl shadow-2xl animate-fade-in">
          {/* Header row */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-borderline-900">
            <h2 className="font-display font-bold text-lg text-white">
              {mode === 'login' && 'Login'}
              {mode === 'signup' && 'Create Account'}
              {mode === 'forgot' && 'Forgot Password'}
              {mode === 'change' && 'Change Password'}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-slate-300" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-5">
            {mode === 'login' && (
              <LoginForm
                onSuccess={onClose}
                onForgot={() => setMode('forgot')}
                onSignup={() => setMode('signup')}
              />
            )}
            {mode === 'signup' && (
              <SignupForm
                onSuccess={onClose}
                onLogin={() => setMode('login')}
              />
            )}
            {mode === 'forgot' && (
              <ForgotForm onBack={() => setMode('login')} />
            )}
            {mode === 'change' && (
              <ChangePasswordForm onClose={onClose} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Login form ────────────────────────────────────────────────────────────────

function LoginForm({
  onSuccess,
  onForgot,
  onSignup,
}: {
  onSuccess: () => void;
  onForgot: () => void;
  onSignup: () => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setTimeout(async () => {
      const result = await auth.login(identifier, password);
      setLoading(false);
      if (result.ok) {
        onSuccess();
      } else {
        setError(result.error ?? 'Login failed.');
      }
    }, 400);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3">
        {/* Email / Username */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1 mb-1">
            <Mail className="w-3 h-3" /> Email or Username
          </label>
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.com"
            autoComplete="username"
            className="input w-full"
            required
          />
        </div>

        {/* Password */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1 mb-1">
            <KeyRound className="w-3 h-3" /> Password
          </label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>
      </div>

      {/* Forgot password link */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onForgot}
          className="text-xs text-neon-300 hover:text-neon-400 transition-colors font-semibold"
        >
          Forgot password?
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-coral-400 font-semibold bg-coral-500/10 border border-coral-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full py-2.5"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Logging in…' : 'Login'}
      </button>

      {/* Switch to signup */}
      <p className="text-center text-xs text-slate-500">
        Don&apos;t have an account?{' '}
        <button
          type="button"
          onClick={onSignup}
          className="text-neon-300 hover:text-neon-400 font-semibold transition-colors"
        >
          Sign up
        </button>
      </p>
    </form>
  );
}

// ── Signup form ───────────────────────────────────────────────────────────────

function SignupForm({
  onSuccess,
  onLogin,
}: {
  onSuccess: () => void;
  onLogin: () => void;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill referral code from URL query param (?ref=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) setReferralCode(ref);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setTimeout(async () => {
      const result = await auth.register(username, email, password, referralCode, mobile);
      setLoading(false);
      if (result.ok) {
        bus.emit(Topics.AuthState, auth.getSession());
        onSuccess();
      } else {
        setError(result.error ?? 'Registration failed.');
      }
    }, 400);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3">
        {/* Username */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1 mb-1">
            <User className="w-3 h-3" /> Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="player123"
            autoComplete="name"
            className="input w-full"
            required
          />
        </div>

        {/* Email */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1 mb-1">
            <Mail className="w-3 h-3" /> Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="input w-full"
            required
          />
        </div>

        {/* Mobile Number */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1 mb-1">
            <User className="w-3 h-3" /> Mobile Number
          </label>
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{7,15}"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
            placeholder="9876543210"
            autoComplete="tel"
            className="input w-full"
            required
          />
        </div>

        {/* Password */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1 mb-1">
            <KeyRound className="w-3 h-3" /> Password
          </label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 6 characters"
            autoComplete="new-password"
            required
          />
        </div>

        {/* Referral Code */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1 mb-1">
            <Tag className="w-3 h-3" /> Referral Code{' '}
            <span className="text-slate-600 normal-case tracking-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
            placeholder="Enter referral code..."
            className="input w-full"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-coral-400 font-semibold bg-coral-500/10 border border-coral-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full py-2.5"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Creating account…' : 'Create Account'}
      </button>

      {/* Switch to login */}
      <p className="text-center text-xs text-slate-500">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onLogin}
          className="text-neon-300 hover:text-neon-400 font-semibold transition-colors"
        >
          Login
        </button>
      </p>
    </form>
  );
}

// ── Forgot Password / email reset form ──────────────────────────────────────────

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'request' | 'verify' | 'success'>('request');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await auth.forgotPassword(email);
    setLoading(false);
    if (result.ok) {
      setCode('');
      setStep('verify');
    } else {
      setError(result.error ?? 'Could not send reset code.');
    }
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setTimeout(async () => {
      const result = await auth.resetPassword(code, newPassword);
      setLoading(false);
      if (result.ok) {
        setStep('success');
      } else {
        setError(result.error ?? 'Could not reset password.');
      }
    }, 600);
  };

  if (step === 'success') {
    return (
      <div className="space-y-4 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-emeraldwin-500/15 border border-emeraldwin-500/40 grid place-items-center">
          <Mail className="w-7 h-7 text-emeraldwin-400" />
        </div>
        <div>
          <p className="font-display font-bold text-white text-sm">Password updated!</p>
          <p className="text-xs text-slate-400 mt-1">
            You can now log in with your new password.
          </p>
        </div>
        <button type="button" onClick={onBack} className="btn-primary w-full py-2.5">
          Back to Login
        </button>
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <form onSubmit={handleVerify} className="space-y-4">
        <div className="rounded-lg bg-emeraldwin-500/10 border border-emeraldwin-500/40 px-3 py-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-emeraldwin-300 font-semibold mb-1">
            Check your email
          </p>
          <p className="text-xs text-emeraldwin-300/90">
            A 6-digit recovery code was sent to <span className="font-semibold">{email}</span>.
          </p>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1 mb-1">
            <KeyRound className="w-3 h-3" /> Reset Code
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            autoComplete="one-time-code"
            className="input w-full text-center font-mono text-lg tracking-[0.2em]"
            required
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1 mb-1">
            <KeyRound className="w-3 h-3" /> New Password
          </label>
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min. 6 characters"
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1 mb-1">
            <KeyRound className="w-3 h-3" /> Confirm Password
          </label>
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            autoComplete="new-password"
            required
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-coral-400 font-semibold bg-coral-500/10 border border-coral-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-2.5"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? 'Resetting…' : 'Reset Password'}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center gap-1.5 w-full py-2 text-xs text-slate-400 hover:text-white transition-colors font-semibold"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Login
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleRequest} className="space-y-4">
      <p className="text-xs text-slate-400">
        Enter your registered email address and we&apos;ll send a 6-digit recovery code via email.
      </p>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1 mb-1">
          <Mail className="w-3 h-3" /> Email Address
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="input w-full"
          required
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-coral-400 font-semibold bg-coral-500/10 border border-coral-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full py-2.5"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Sending…' : 'Send Reset Code'}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="flex items-center justify-center gap-1.5 w-full py-2 text-xs text-slate-400 hover:text-white transition-colors font-semibold"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Login
      </button>
    </form>
  );
}

// ── Change Password form (logged-in user) ───────────────────────────────────────

function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setLoading(true);
    setTimeout(async () => {
      const result = await auth.changePassword(currentPassword, newPassword);
      setLoading(false);
      if (result.ok) {
        setSuccess(true);
        setTimeout(onClose, 1500);
      } else {
        setError(result.error ?? 'Could not change password.');
      }
    }, 400);
  };

  if (success) {
    return (
      <div className="text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-full bg-emeraldwin-500/15 border border-emeraldwin-500/40 grid place-items-center">
          <KeyRound className="w-7 h-7 text-emeraldwin-400" />
        </div>
        <p className="font-display font-bold text-white text-sm">Password changed!</p>
        <p className="text-xs text-slate-400">Your password has been updated.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1 mb-1">
          <KeyRound className="w-3 h-3" /> Current Password
        </label>
        <PasswordInput
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          autoComplete="current-password"
          required
        />
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1 mb-1">
          <KeyRound className="w-3 h-3" /> New Password
        </label>
        <PasswordInput
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Min. 6 characters"
          autoComplete="new-password"
          required
        />
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1 mb-1">
          <KeyRound className="w-3 h-3" /> Confirm New Password
        </label>
        <PasswordInput
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter new password"
          autoComplete="new-password"
          required
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-coral-400 font-semibold bg-coral-500/10 border border-coral-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Updating…' : 'Change Password'}
      </button>
    </form>
  );
}
