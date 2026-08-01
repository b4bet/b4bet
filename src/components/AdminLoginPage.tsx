import { useState } from 'react';
import { LogIn, Eye, EyeOff } from 'lucide-react';
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

// B4BeT logo SVG inline component
function B4BetLogo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="180" height="180" rx="36" fill="#0f172a"/>
      <g style={{ transform: 'scale(95%)', transformOrigin: 'center' }}>
        <path fill="#f59e0b"
          d="M101.141 53H136.632C151.023 53 162.689 64.6662 162.689 79.0573V112.904H148.112V79.0573C148.112 78.7105 148.098 78.3662 148.072 78.0251L112.581 112.898C112.701 112.902 112.821 112.904 112.941 112.904H148.112V126.672H112.941C98.5504 126.672 86.5638 114.891 86.5638 100.5V66.7434H101.141V100.5C101.141 101.15 101.191 101.792 101.289 102.422L137.56 66.7816C137.255 66.7563 136.945 66.7434 136.632 66.7434H101.141V53Z" />
        <path fill="#f59e0b"
          d="M65.2926 124.136L14 66.7372H34.6355L64.7495 100.436V66.7372H80.1365V118.47C80.1365 126.278 70.4953 129.958 65.2926 124.136Z" />
      </g>
    </svg>
  );
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
        // Strategy 2: Direct table query
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
        setError('Login failed. Please try again.');
        return;
      }

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

      // loginStaff emits bus event so React updates instantly (no page refresh needed)
      cms.loginStaff(staffRow.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Login error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <B4BetLogo size={72} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
            <p className="mt-1 text-slate-400 text-sm">Sign in to manage your platform</p>
          </div>
        </div>

        <form onSubmit={(e) => { void handleLogin(e); }} className="panel p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@b4bet.com"
              className="input w-full"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Password</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="input w-full pr-10"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPwd((o) => !o)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <>Signing in...</>
            ) : (
              <><LogIn size={16} /> Sign In</>
            )}
          </button>
        </form>

        <p className="text-center text-slate-600 text-xs">B4Bet &copy; {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
