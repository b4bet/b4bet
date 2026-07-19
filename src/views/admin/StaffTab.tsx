import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Trash2, Shield, ShieldOff, RefreshCw, Loader2 } from 'lucide-react';
import {
  supabaseGetStaff,
  supabaseCreateStaff,
  supabaseUpdateStaffActive,
  supabaseUpdateStaffPermissions,
  supabaseDeleteStaff,
  type SupabaseStaff,
} from '@/lib/supabaseIntegration';
import AdminChangePasswordModal from '@/components/AdminChangePasswordModal';

// Use the same permission keys as cms.ts for consistency
const ALL_PERMISSIONS = [
  'finance', 'banner', 'deposit', 'emails', 'staff', 'marketing',
  'algos', 'users', 'smtp', 'currencies', 'crm', 'intercom', 'notify',
  'gateways', 'tickets', 'history', 'withdrawals', 'redeem',
  'gameSettings', 'paymentMethods', 'dynamicPages', 'ban', 'notifyManager',
  'requests', 'affiliates',
] as const;

type PermKey = typeof ALL_PERMISSIONS[number];

async function hashPassword(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function StaffTab() {
  const [staff, setStaff] = useState<SupabaseStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [changePassTarget, setChangePassTarget] = useState<SupabaseStaff | null>(null);
  const selected = staff.find((s) => s.id === selectedId) ?? null;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [role, setRole] = useState('staff');
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supabaseGetStaff();
      setStaff(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addStaff = async () => {
    if (!name.trim() || !email.trim() || !pwd.trim()) return;
    setSaving(true);
    try {
      const hash = await hashPassword(pwd.trim());
      const defaultPerms: Record<string, boolean> = Object.fromEntries(
        ALL_PERMISSIONS.map((k) => [k, false])
      );
      const newId = await supabaseCreateStaff(email.trim(), name.trim(), role, hash, defaultPerms);
      if (!newId) throw new Error('Create failed');
      setName(''); setEmail(''); setPwd(''); setRole('staff'); setShowAdd(false);
      await load();
    } catch (e) {
      console.error('addStaff error:', e);
      alert('Failed to add staff member.');
    } finally {
      setSaving(false);
    }
  };

  const removeStaff = async (id: string) => {
    if (!window.confirm('Remove this staff member?')) return;
    try {
      await supabaseDeleteStaff(id);
      if (selectedId === id) setSelectedId(null);
      await load();
    } catch {
      alert('Could not delete staff. Please try again.');
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    try {
      await supabaseUpdateStaffActive(id, !current);
      setStaff((prev) => prev.map((s) => s.id === id ? { ...s, is_active: !current } : s));
    } catch (e) {
      console.error('toggleActive error:', e);
    }
  };

  const updatePermission = async (id: string, key: PermKey, val: boolean) => {
    const member = staff.find((s) => s.id === id);
    if (!member) return;
    const newPerms: Record<string, boolean> = { ...member.permissions, [key]: val };
    try {
      await supabaseUpdateStaffPermissions(id, newPerms);
      setStaff((prev) => prev.map((s) => s.id === id ? { ...s, permissions: newPerms } : s));
    } catch (e) {
      console.error('updatePermission error:', e);
    }
  };

  // Human-readable labels for permission keys
  const permLabel: Record<PermKey, string> = {
    finance: 'Finance', banner: 'Banners', deposit: 'Deposits', emails: 'Emails',
    staff: 'Staff', marketing: 'Marketing', algos: 'Algorithms', users: 'Users',
    smtp: 'SMTP', currencies: 'Currencies', crm: 'CRM', intercom: 'Intercom',
    notify: 'Notifications', gateways: 'Auto Gateways', tickets: 'Tickets',
    history: 'History', withdrawals: 'Withdrawals', redeem: 'Redeem Codes',
    gameSettings: 'Game Settings', paymentMethods: 'Payment Methods',
    dynamicPages: 'Dynamic Pages', ban: 'Ban Section', notifyManager: 'Notif Manager',
    requests: 'Requests', affiliates: 'Affiliates',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white">Staff Management</h2>
          <p className="text-xs text-slate-500">Manage admin staff — live from Supabase.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white text-xs font-semibold disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => setShowAdd((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neon-500/20 border border-neon-500/40 text-neon-300 hover:text-neon-200 text-xs font-semibold">
            <UserPlus className="w-3.5 h-3.5" /> Add Staff
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="panel p-4 space-y-3">
          <h3 className="font-display font-bold text-sm text-white">New Staff Member</h3>
          <div className="grid grid-cols-2 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" className="input" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="input" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Password" type="password" className="input" />
            <select value={role} onChange={(e) => setRole(e.target.value)} className="input">
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void addStaff()} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neon-500/20 border border-neon-500/40 text-neon-300 text-sm font-semibold disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Add'}
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-midnight-850 border-b border-borderline-900">
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  <th className="p-3">Name</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderline-900">
                {loading ? (
                  <tr><td colSpan={4} className="p-8 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading...
                  </td></tr>
                ) : staff.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-slate-500">No staff found.</td></tr>
                ) : (
                  staff.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
                      className={`cursor-pointer hover:bg-slatepanel-800/50 ${selectedId === s.id ? 'bg-neon-500/5 border-l-2 border-neon-400' : ''}`}
                    >
                      <td className="p-3">
                        <div className="font-semibold text-white">{s.name}</div>
                        <div className="text-[11px] text-slate-500">{s.email}</div>
                      </td>
                      <td className="p-3">
                        <span className={`chip text-[10px] ${
                          s.role === 'super_admin' ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                            : s.role === 'admin' ? 'bg-neon-500/15 text-neon-300 border-neon-500/40'
                            : 'bg-slatepanel-700 text-slate-300 border-borderline-900'
                        }`}>{s.role}</span>
                      </td>
                      <td className="p-3">
                        <span className={`chip text-[10px] ${
                          s.is_active
                            ? 'bg-emeraldwin-500/15 text-emeraldwin-300 border-emeraldwin-500/40'
                            : 'bg-coral-500/15 text-coral-300 border-coral-500/40'
                        }`}>{s.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={(e) => { e.stopPropagation(); void toggleActive(s.id, s.is_active); }}
                            title={s.is_active ? 'Deactivate' : 'Activate'}
                            className="w-7 h-7 rounded-lg border grid place-items-center bg-slatepanel-800 border-borderline-900 text-slate-400 hover:text-white"
                          >
                            {s.is_active ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setChangePassTarget(s); }}
                            title="Change Password"
                            className="w-7 h-7 rounded-lg border grid place-items-center bg-slatepanel-800 border-borderline-900 text-slate-400 hover:text-neon-300"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); void removeStaff(s.id); }}
                            className="w-7 h-7 rounded-lg border grid place-items-center bg-coral-500/10 border-coral-500/30 text-coral-400 hover:text-coral-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <div className="panel p-4 space-y-3">
            <h3 className="font-display font-bold text-sm text-white">Permissions — {selected.name}</h3>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
              {ALL_PERMISSIONS.map((key) => (
                <label key={key} className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs text-slate-300">{permLabel[key]}</span>
                  <button
                    onClick={() => void updatePermission(selected.id, key, !selected.permissions[key])}
                    className={`w-10 h-5 rounded-full border transition-all ${
                      selected.permissions[key] ? 'bg-neon-500 border-neon-400' : 'bg-slatepanel-800 border-borderline-900'
                    }`}
                  >
                    <span className={`block w-3.5 h-3.5 rounded-full bg-white mx-auto transition-transform ${
                      selected.permissions[key] ? 'translate-x-2' : '-translate-x-2'
                    }`} />
                  </button>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Change password modal for any staff member (admin-initiated) */}
      {changePassTarget && (
        <AdminChangePasswordModal
          staffId={changePassTarget.id}
          staffName={changePassTarget.name}
          staffEmail={changePassTarget.email}
          onClose={() => setChangePassTarget(null)}
        />
      )}
    </div>
  );
}
