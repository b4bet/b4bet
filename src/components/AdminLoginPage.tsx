import { useState } from 'react';
import { ShieldCheck, LogIn, Mail, ArrowLeft, KeyRound } from 'lucide-react';
import { cms } from '../lib/cms';
import PasswordInput from './PasswordInput';

/**
 * Admin login page. Shown whenever no staff session is active.
 * Authenticates against Supabase `staff` table via RPC staff_login.
 * Includes a "Forgot password?" flow using the configured SMTP server.
 */
export default function AdminLoginPage() {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Forgot state
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const acc = await cms.verifyStaffCredentialsAsync(email, password);
      if (!acc) {
        setError('Invalid email or password.');
        return;
      }
      cms.setStaffSession(acc.id);
      cms.toast({ title: 'Welcome back', body: `Signed in as ${acc.name}.`, kind: 'success' });
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = (e: React.FormEvent) => {
    e.preventDefault();
    setResetErr(null);
    setResetMsg(null);
    setResetBusy(true);
    const res = cms.requestStaffPasswordReset(email);
    if (!res.ok) {
      setResetErr(res.error || 'Unable to send reset email.');
    } else {
      setResetMsg(
        `A password reset email has been dispatched to ${email}. Please check your inbox and follow the instructions to sign in.`,
      );
    }
    setResetBusy(false);
  };

  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center px-4 py-8 animate-fade-in">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center shadow-neon-glow mb-3">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display font-extrabold text-xl text-white">Admin Panel</h1>
          <p className="text-xs text-slate-500 mt-1">Secure access · Authorized staff only</p>
        </div>

        <div className="panel p-6 space-y-5">
          {mode === 'login' && (
            <form onSubmit={submitLogin} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="admin@example.com"
                  className="input mt-1 w-full"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <KeyRound className="w-3 h-3" /> Password
                </label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="mt-1 w-full"
                  required
                />
              </div>

              {error && (
                <div className="text-xs text-coral-300 bg-coral-500/10 border border-coral-500/30 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                {busy ? 'Signing in…' : 'Sign In'}
              </button>

              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(null); }}
                className="w-full text-xs text-neon-300 hover:text-neon-200 font-semibold text-center"
              >
                Forgot password?
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={submitForgot} className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setResetErr(null); setResetMsg(null); }}
                  className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center text-slate-300 hover:text-white"
                  aria-label="Back to sign in"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h3 className="font-display font-bold text-white text-sm">Reset password</h3>
                  <p className="text-[11px] text-slate-500">We'll email a recovery link via SMTP.</p>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Recovery email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="input mt-1 w-full"
                  required
                />
              </div>

              {resetErr && (
                <div className="text-xs text-coral-300 bg-coral-500/10 border border-coral-500/30 rounded-lg px-3 py-2">
                  {resetErr}
                </div>
              )}
              {resetMsg && (
                <div className="text-xs text-emeraldwin-300 bg-emeraldwin-500/10 border border-emeraldwin-500/30 rounded-lg px-3 py-2">
                  {resetMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={resetBusy}
                className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
              >
                <Mail className="w-4 h-4" />
                {resetBusy ? 'Sending…' : 'Send reset email'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
