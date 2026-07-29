// Floating authentication modal — Login, Signup, and Forgot Password.
// Accessible from the main Header via Login / Sign Up buttons.
// Uses the existing PasswordInput component for all password fields (Eye toggle built-in).
// Connects to the Admin's SMTP settings via lib/auth for forgot-password emails.

import { useState, useEffect } from 'react';
import { X, Phone, User, KeyRound, Tag, ArrowLeft, Loader2 } from 'lucide-react';
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

  // Reset mode whenever the modal opens or initialMode changes
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
      <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal card */}
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-sm bg-slatepanel-900 border border-borderline-900 rounded-2xl shadow-2xl pointer-events-auto overflow-hidden">
          {/* Header row */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-borderline-900">
            <h2 className="text-base font-bold text-white">
              {mode === 'login' && 'Login'}
              {mode === 'signup' && 'Create Account'}
              {mode === 'forgot' && 'Forgot Password'}
              {mode === 'change' && 'Change Password'}
            </h2>
            <button onClick={onClose} className="w-7 h-7 rounded-lg bg-slatepanel-800 grid place-items-center hover:bg-red-500/20 transition-colors">
              <X className="w-4 h-4 text-white/60" />
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

// ── Login form ──────────────────────────────────────────────────────────────────────────────────

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

    // Validate: must be email or mobile number (not plain username)
    const val = identifier.trim();
    const isMobile = /^[\d\s+\-()]{7,15}$/.test(val);
    const isEmail = val.includes('@');
    if (!isMobile && !isEmail) {
      setError('Please enter a valid email address or mobile number.');
      return;
    }

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
      <div className="space-y-1">
        {/* Email or Mobile — no icon in label */}
        <div>
          <label className="text-xs font-medium text-slate-400 mb-1 block">
            Email or Mobile Number
          </label>
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Email or mobile number"
            autoComplete="username"
            className="input w-full"
            required
          />
        </div>

        {/* Password */}
        <div>
          <label className="text-xs font-medium text-slate-400 mb-1 block">
            Password
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
      <div className="text-right">
        <button type="button" onClick={onForgot} className="text-xs text-neon-400 hover:underline">
          Forgot password?
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Submit */}
      <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-sm font-bold flex items-center justify-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Logging in…' : 'Login'}
      </button>

      {/* Switch to signup */}
      <p className="text-center text-xs text-slate-400">
        Don&apos;t have an account?{' '}
        <button type="button" onClick={onSignup} className="text-neon-400 font-semibold hover:underline">
          Sign up
        </button>
      </p>
    </form>
  );
}

// ── Signup form ───────────────────────────────────────────────────────────────────────────

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
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Username */}
      <div>
        <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
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
        <label className="text-xs font-medium text-slate-400 mb-1 block">
          Email
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
        <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
          <Phone className="w-3 h-3" /> Mobile Number
        </label>
        <input
          type="tel"
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
        <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
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
        <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
          <Tag className="w-3 h-3" /> Referral Code{' '}
          <span className="text-slate-500">(optional)</span>
        </label>
        <input
          type="text"
          value={referralCode}
          onChange={(e) => setReferralCode(e.target.value)}
          placeholder="Enter referral code..."
          className="input w-full"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Submit */}
      <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-sm font-bold flex items-center justify-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Creating account…' : 'Create Account'}
      </button>

      {/* Switch to login */}
      <p className="text-center text-xs text-slate-400">
        Already have an account?{' '}
        <button type="button" onClick={onLogin} className="text-neon-400 font-semibold hover:underline">
          Login
        </button>
      </p>
    </form>
  );
}

// ── Forgot Password / email reset form ──────────────────────────────────────────────────────────────────────────────────────

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
      <div className="py-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-emeraldwin-500/20 border border-emeraldwin-500/40 grid place-items-center mx-auto">
          <span className="text-2xl">✓</span>
        </div>
        <div>
          <p className="font-bold text-white">Password updated!</p>
          <p className="text-sm text-slate-400 mt-1">You can now log in with your new password.</p>
        </div>
        <button type="button" onClick={onBack} className="btn-primary w-full py-2.5 text-sm font-bold">
          Back to Login
        </button>
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <form onSubmit={handleVerify} className="space-y-4">
        <div className="text-center space-y-1">
          <p className="font-semibold text-white">Check your email</p>
          <p className="text-xs text-slate-400">A 6-digit recovery code was sent to {email}.</p>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-400 mb-1 block">Reset Code</label>
          <input
            type="text"
            inputMode="numeric"
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
          <label className="text-xs font-medium text-slate-400 mb-1 block">New Password</label>
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min. 6 characters"
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-400 mb-1 block">Confirm Password</label>
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            autoComplete="new-password"
            required
          />
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-sm font-bold flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? 'Resetting…' : 'Reset Password'}
        </button>

        <button type="button" onClick={onBack} className="w-full flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-3 h-3" /> Back to Login
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
        <label className="text-xs font-medium text-slate-400 mb-1 block">Email Address</label>
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

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-sm font-bold flex items-center justify-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Sending…' : 'Send Reset Code'}
      </button>

      <button type="button" onClick={onBack} className="w-full flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="w-3 h-3" /> Back to Login
      </button>
    </form>
  );
}

// ── Change Password form (logged-in user) ───────────────────────────────────────────────────────────────────────────

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
      <div className="py-6 text-center space-y-2">
        <p className="font-bold text-emeraldwin-400">Password changed!</p>
        <p className="text-sm text-slate-400">Your password has been updated.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-medium text-slate-400 mb-1 block">Current Password</label>
        <PasswordInput
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          autoComplete="current-password"
          required
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-400 mb-1 block">New Password</label>
        <PasswordInput
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Min. 6 characters"
          autoComplete="new-password"
          required
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-400 mb-1 block">Confirm New Password</label>
        <PasswordInput
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter password"
          autoComplete="new-password"
          required
        />
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-sm font-bold flex items-center justify-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Updating…' : 'Change Password'}
      </button>
    </form>
  );
}
