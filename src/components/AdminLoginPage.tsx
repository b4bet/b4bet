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

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const emailLower = email.trim().toLowerCase();
      const hash = await sha256Hex(password.trim());

      let staffRow: StaffRow | null = null;

      // Strategy 1: RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_staff_login', {
        p_email: emailLower,
        p_password_hash: hash,
      });

      if (rpcError) {
        // Strategy 2: Direct table query fallback
        const { data: tableData, error: tableError } = await supabase
          .from('staff')
          .select('id, name, email, role, permissions, is_active, password_hash')
          .eq('email', emailLower)
          .eq('is_active', true)
          .single();

        if (tableError || !tableData) {
          setError('Invalid email or password.');
          return;
        }

        const row = tableData as StaffRow;
        if (row.password_hash !== hash) {
          setError('Invalid email or password.');
          return;
        }
        staffRow = row;
      } else {
        const rows = rpcData as StaffRow[] | null;
        if (!rows || rows.length === 0) {
          setError('Invalid email or password.');
          return;
        }
        staffRow = rows[0];
      }

      if (!staffRow) {
        setError('Invalid email or password.');
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

      cms.setStaffSession(staffRow.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Login error: ${msg}`);
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
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
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
