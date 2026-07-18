import { useState } from 'react';
import { LogIn, Eye, EyeOff, ShieldAlert, Bug } from 'lucide-react';
import { supabaseStaffLogin } from '../lib/supabaseIntegration';
import { supabase } from '../integrations/supabase/client';
import { cms } from '../lib/cms';
import type { StaffRole, PermissionKey } from '../lib/cms';

async function sha256Hex(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Admin login page. Shown whenever no staff session is active.
 * Authenticates against Supabase `staff` table (email + SHA-256 password_hash).
 */
export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    setError('');
    setDebugInfo(null);
    try {
      const hash = await sha256Hex(password.trim());
      const emailLower = email.trim().toLowerCase();
      
      // Try the RPC first
      const acc = await supabaseStaffLogin(emailLower, hash);
      
      if (!acc) {
        // Try to get more info about why login failed
        const { data: rpcData, error: rpcError } = await supabase.rpc('admin_staff_login', {
          p_email: emailLower,
          p_password_hash: hash,
        });
        
        let debugMsg = `Email: ${emailLower}\nHash (SHA-256): ${hash.slice(0, 16)}...`;
        if (rpcError) {
          debugMsg += `\nRPC Error: ${rpcError.message} (${rpcError.code})`;
          // Check if RPC doesn't exist
          if (rpcError.code === '42883' || rpcError.message.includes('does not exist')) {
            setError('Admin RPC function not found in database. Please check Supabase setup.');
          } else {
            setError(`Login failed: ${rpcError.message}`);
          }
        } else {
          debugMsg += `\nRPC returned: ${JSON.stringify(rpcData)}`;
          setError('Invalid email or password.');
        }
        setDebugInfo(debugMsg);
        return;
      }

      // Map Supabase staff row to CMS StaffAccount and register it
      const isOwner = acc.role === 'super_admin';
      const role: StaffRole = (acc.role === 'super_admin' || acc.role === 'admin') ? 'finance' : 'support';
      const permissions = isOwner
        ? Object.fromEntries(
            ['finance','banner','deposit','emails','staff','marketing','algos','users','smtp',
             'currencies','crm','intercom','notify','gateways','tickets','history','withdrawals',
             'redeem','gameSettings','paymentMethods','dynamicPages','ban','notifyManager']
              .map((k) => [k, true])
          ) as Record<PermissionKey, boolean>
        : (acc.permissions as Record<PermissionKey, boolean>) ?? {};

      const staffAccount = {
        id: acc.id,
        name: acc.name,
        email: acc.email,
        password: '',
        role,
        online: true,
        permissions,
        isOwner,
      };

      // Ensure the account is in cms.staff before setting session
      if (!cms.staff.find((s) => s.id === acc.id)) {
        cms.staff = [...cms.staff, staffAccount];
      } else {
        cms.staff = cms.staff.map((s) => s.id === acc.id ? { ...s, ...staffAccount } : s);
      }

      // Set session by ID (string) — this is what cms.setStaffSession expects
      cms.setStaffSession(acc.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Login error: ${msg}`);
      setDebugInfo(`Exception: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-midnight-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / brand */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-neon-500/20 border border-neon-500/40 grid place-items-center mx-auto">
            <ShieldAlert className="w-7 h-7 text-neon-400" />
          </div>
          <h1 className="font-display font-extrabold text-2xl text-white">Admin Panel</h1>
          <p className="text-sm text-slate-500">Sign in to manage your platform</p>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { void handleLogin(e); }} className="panel p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Email</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@b4bet.com"
              className="input w-full"
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Password</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="········"
                className="input w-full pr-10"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPwd((o) => !o)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="space-y-2">
              <p className="text-sm text-coral-400 bg-coral-500/10 border border-coral-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
              {debugInfo && (
                <button
                  type="button"
                  onClick={() => setShowDebug((o) => !o)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-400"
                >
                  <Bug className="w-3 h-3" />
                  {showDebug ? 'Hide debug info' : 'Show debug info'}
                </button>
              )}
              {showDebug && debugInfo && (
                <pre className="text-[10px] text-slate-500 bg-midnight-950 border border-borderline-900 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap">
                  {debugInfo}
                </pre>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neon-500 hover:bg-neon-400 text-midnight-900 font-bold text-sm transition-colors disabled:opacity-50"
          >
            {loading ? (
              <><span className="w-4 h-4 border-2 border-midnight-900/40 border-t-midnight-900 rounded-full animate-spin" /> Signing in...</>
            ) : (
              <><LogIn className="w-4 h-4" /> Sign In</>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600">B4Bet &copy; {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
