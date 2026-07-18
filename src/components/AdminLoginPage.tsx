import { useState } from 'react';
import { LogIn, Eye, EyeOff, ShieldAlert } from 'lucide-react';
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

interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: Record<PermissionKey, boolean> | null;
  is_active: boolean;
  password_hash?: string;
}

/**
 * Admin login page. Authenticates against Supabase staff table.
 * Strategy:
 *  1. Try admin_staff_login RPC (SECURITY DEFINER, recommended)
 *  2. If RPC missing/errors → direct staff table query with password_hash compare
 * Debug info always visible below the error.
 */
export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [debugLines, setDebugLines] = useState<string[]>([]);

  const addDebug = (lines: string[], msg: string) => { lines.push(msg); };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    setError('');
    setDebugLines([]);
    const dbg: string[] = [];

    try {
      const emailLower = email.trim().toLowerCase();
      const hash = await sha256Hex(password.trim());
      addDebug(dbg, `Email: ${emailLower}`);
      addDebug(dbg, `SHA-256: ${hash.slice(0, 20)}...`);

      let staffRow: StaffRow | null = null;

      // --- Strategy 1: RPC ---
      addDebug(dbg, 'Trying RPC admin_staff_login...');
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_staff_login', {
        p_email: emailLower,
        p_password_hash: hash,
      });

      if (rpcError) {
        addDebug(dbg, `RPC error: ${rpcError.code} - ${rpcError.message}`);
        addDebug(dbg, 'Falling back to direct table query...');

        // --- Strategy 2: Direct table query ---
        const { data: tableData, error: tableError } = await supabase
          .from('staff')
          .select('id, name, email, role, permissions, is_active, password_hash')
          .eq('email', emailLower)
          .eq('is_active', true)
          .single();

        if (tableError) {
          addDebug(dbg, `Table query error: ${tableError.code} - ${tableError.message}`);
          setError(`Login failed. Check debug info below.`);
          setDebugLines([...dbg]);
          return;
        }

        if (!tableData) {
          addDebug(dbg, 'No staff row found for this email.');
          setError('Invalid email or password.');
          setDebugLines([...dbg]);
          return;
        }

        const row = tableData as StaffRow;
        addDebug(dbg, `Found staff: ${row.name} (role: ${row.role})`);
        addDebug(dbg, `Stored hash: ${(row.password_hash ?? '').slice(0, 20)}...`);
        addDebug(dbg, `Input hash:  ${hash.slice(0, 20)}...`);
        addDebug(dbg, `Hash match: ${row.password_hash === hash}`);

        if (row.password_hash !== hash) {
          setError('Invalid email or password.');
          setDebugLines([...dbg]);
          return;
        }
        staffRow = row;
      } else {
        const rows = rpcData as StaffRow[] | null;
        if (!rows || rows.length === 0) {
          addDebug(dbg, 'RPC returned empty result (wrong credentials).');
          setError('Invalid email or password.');
          setDebugLines([...dbg]);
          return;
        }
        addDebug(dbg, `RPC success! Got staff: ${rows[0].name}`);
        staffRow = rows[0];
      }

      if (!staffRow) {
        setError('Login failed: no staff row.');
        setDebugLines([...dbg]);
        return;
      }

      // Build CMS account
      const isOwner = staffRow.role === 'super_admin';
      const role: StaffRole = (staffRow.role === 'super_admin' || staffRow.role === 'admin') ? 'finance' : 'support';
      const permissions = isOwner
        ? Object.fromEntries(
            ['finance','banner','deposit','emails','staff','marketing','algos','users','smtp',
             'currencies','crm','intercom','notify','gateways','tickets','history','withdrawals',
             'redeem','gameSettings','paymentMethods','dynamicPages','ban','notifyManager']
              .map((k) => [k, true])
          ) as Record<PermissionKey, boolean>
        : (staffRow.permissions ?? {}) as Record<PermissionKey, boolean>;

      const staffAccount = {
        id: staffRow.id,
        name: staffRow.name,
        email: staffRow.email,
        password: '',
        role,
        online: true,
        permissions,
        isOwner,
      };

      if (!cms.staff.find((s) => s.id === staffRow!.id)) {
        cms.staff = [...cms.staff, staffAccount];
      } else {
        cms.staff = cms.staff.map((s) => s.id === staffRow!.id ? { ...s, ...staffAccount } : s);
      }

      addDebug(dbg, 'Login successful! Setting session...');
      cms.setStaffSession(staffRow.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addDebug(dbg, `Exception: ${msg}`);
      setError(`Login error: ${msg}`);
      setDebugLines([...dbg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-midnight-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-neon-500/20 border border-neon-500/40 grid place-items-center mx-auto">
            <ShieldAlert className="w-7 h-7 text-neon-400" />
          </div>
          <h1 className="font-display font-extrabold text-2xl text-white">Admin Panel</h1>
          <p className="text-sm text-slate-500">Sign in to manage your platform</p>
        </div>

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
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
              {debugLines.length > 0 && (
                <pre className="text-[11px] text-slate-400 bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                  {debugLines.join('\n')}
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
