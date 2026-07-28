// Floating authentication modal — Login, Signup, and Forgot Password.
// Accessible from the main Header via Login / Sign Up buttons.
// Uses the existing PasswordInput component for all password fields (Eye toggle built-in).
// Connects to the Admin's SMTP settings via lib/auth for forgot-password emails.

import { useState, useEffect } from 'react';
import { X, Mail, Phone, User, KeyRound, Tag, CheckCircle2, Loader2 } from 'lucide-react';
import PasswordInput from './PasswordInput';
import { auth } from '../lib/auth';
import { bus, Topics } from '../lib/bus';
import { supabase } from '../integrations/supabase/client';

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

  // Detect Supabase PASSWORD_RECOVERY session and auto-open change mode
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('change');
        // Modal will be opened from App.tsx via bus event
        bus.emit('auth:recovery', null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

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
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative w-full max-w-md bg-[#0a0f1c] border border-white/10 rounded-2xl shadow-2xl pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header row */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10">
            <h2 className="text-lg font-bold text-white">
              {mode === 'login' && 'Login'}
              {mode === 'signup' && 'Create Account'}
              {mode === 'forgot' && 'Forgot Password'}
              {mode === 'change' && 'Set New Password'}
            </h2>
            <button
              onClick={onClose}
              className="text-white/50 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5">
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

// ── Login form ────────────────────────────────────────────────────────────────────────────────

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
    const digitsOnly = val.replace(/[\s+\-()]/g, '');
    const isMobile = /^\d{7,15}$/.test(digitsOnly);
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
      <div>
        {/* Email or Mobile */}
        <label className="block text-sm font-medium text-white/70 mb-1">
          Email or Mobile Number
        </label>
        <div className="relative">
          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Email or mobile number"
            autoComplete="username"
            className="input w-full pl-9"
            required
          />
        </div>
      </div>

      {/* Password */}
      <div>
        <label className="block text-sm font-medium text-white/70 mb-1">
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

      {/* Forgot password link */}
      <div className="text-right -mt-2">
        <button
          type="button"
          onClick={onForgot}
          className="text-xs text-[#00ff88] hover:underline"
        >
          Forgot password?
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : null}
        {loading ? 'Logging in…' : 'Login'}
      </button>

      {/* Switch to signup */}
      <p className="text-center text-sm text-white/50">
        Don&apos;t have an account?{' '}
        <button type="button" onClick={onSignup} className="text-[#00ff88] hover:underline">
          Sign up
        </button>
      </p>
    </form>
  );
}

// ── Signup form ─────────────────────────────────────────────────────────────────────────────────

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
      {/* Username */}
      <div>
        <label className="block text-sm font-medium text-white/70 mb-1">Username</label>
        <div className="relative">
          <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="player123"
            autoComplete="name"
            className="input w-full pl-9"
            required
          />
        </div>
      </div>

      {/* Email */}
      <div>
        <label className="block text-sm font-medium text-white/70 mb-1">Email</label>
        <div className="relative">
          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="input w-full pl-9"
            required
          />
        </div>
      </div>

      {/* Mobile Number */}
      <div>
        <label className="block text-sm font-medium text-white/70 mb-1">Mobile Number</label>
        <div className="relative">
          <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
            placeholder="9876543210"
            autoComplete="tel"
            className="input w-full pl-9"
            required
          />
        </div>
      </div>

      {/* Password */}
      <div>
        <label className="block text-sm font-medium text-white/70 mb-1">Password</label>
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
        <label className="block text-sm font-medium text-white/70 mb-1">
          Referral Code{' '}
          <span className="text-white/30 font-normal">(optional)</span>
        </label>
        <div className="relative">
          <Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
            placeholder="Enter referral code..."
            className="input w-full pl-9"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : null}
        {loading ? 'Creating account…' : 'Create Account'}
      </button>

      {/* Switch to login */}
      <p className="text-center text-sm text-white/50">
        Already have an account?{' '}
        <button type="button" onClick={onLogin} className="text-[#00ff88] hover:underline">
          Login
        </button>
      </p>
    </form>
  );
}

// ── Forgot Password form ────────────────────────────────────────────────────────────────────────
// Flow:
// 1. User enters email -> Supabase sends a reset link to their email
// 2. User clicks the link -> page reloads with #access_token in URL
// 3. Supabase fires PASSWORD_RECOVERY event -> AuthModal opens in 'change' mode
// 4. User sets new password

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await auth.forgotPassword(email);
    setLoading(false);
    if (result.ok) {
      setSent(true);
    } else {
      setError(result.error ?? 'Could not send reset link.');
    }
  };

  if (sent) {
    return (
      <div className="text-center py-4 space-y-4">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-[#00ff88]/10 flex items-center justify-center">
            <CheckCircle2 size={32} className="text-[#00ff88]" />
          </div>
        </div>
        <div>
          <p className="text-white font-semibold text-lg">Check your email</p>
          <p className="text-white/60 text-sm mt-1">
            A password reset link was sent to{' '}
            <span className="text-white font-medium">{email}</span>.
          </p>
          <p className="text-white/40 text-xs mt-3">
            Click the link in the email to set a new password.
            If you don’t see it, check your spam folder.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-[#00ff88] hover:underline mt-2"
        >
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleRequest} className="space-y-4">
      <p className="text-white/60 text-sm">
        Enter your registered email address and we’ll send you a password reset link.
      </p>

      <div>
        <label className="block text-sm font-medium text-white/70 mb-1">Email Address</label>
        <div className="relative">
          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="input w-full pl-9"
            required
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : null}
        {loading ? 'Sending…' : 'Send Reset Link'}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white/50 hover:text-white transition-colors"
        >
          Back to Login
        </button>
      </div>
    </form>
  );
}

// ── Change Password form (logged-in user OR after password recovery) ──────────────────────

function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      // Use Supabase directly to update password (works for both recovery and logged-in)
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) {
        setError(updateErr.message);
      } else {
        setSuccess(true);
        setTimeout(onClose, 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-6 space-y-3">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-[#00ff88]/10 flex items-center justify-center">
            <CheckCircle2 size={32} className="text-[#00ff88]" />
          </div>
        </div>
        <p className="text-white font-semibold text-lg">Password updated!</p>
        <p className="text-white/50 text-sm">You can now log in with your new password.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-white/60 text-sm">
        Enter and confirm your new password below.
      </p>

      <div>
        <label className="block text-sm font-medium text-white/70 mb-1">New Password</label>
        <PasswordInput
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Min. 6 characters"
          autoComplete="new-password"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-white/70 mb-1">Confirm Password</label>
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
        <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : null}
        {loading ? 'Updating…' : 'Set New Password'}
      </button>
    </form>
  );
}
