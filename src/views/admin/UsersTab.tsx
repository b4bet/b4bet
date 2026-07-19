import { useState, useEffect, useCallback } from 'react';
import { Users, Search, RefreshCw, X, Save, Loader2 } from 'lucide-react';
import {
  supabaseGetUsers,
  supabaseUpdateUserFull,
  type SupabaseProfile,
  type UserUpdatePayload,
} from '../../lib/supabaseIntegration';

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---- Edit panel state ----
interface EditState {
  username: string;
  display_name: string;
  phone: string;
  email: string;
  balance: string;
  vip_level: string;
  is_active: boolean;
  is_banned: boolean;
  account_id: string;
}

function profileToEdit(u: SupabaseProfile): EditState {
  return {
    username:     u.username     ?? '',
    display_name: u.display_name ?? '',
    phone:        u.phone        ?? '',
    email:        u.email        ?? '',
    balance:      String(u.balance),
    vip_level:    String(u.vip_level),
    is_active:    u.is_active,
    is_banned:    u.is_banned,
    account_id:   u.account_id   ?? '',
  };
}

// ---- Main component ----
export default function UsersTab({ currentStaffEmail }: { currentStaffEmail?: string }) {
  const [users, setUsers]     = useState<SupabaseProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]             = useState('');
  const [editUser, setEditUser] = useState<SupabaseProfile | null>(null);
  const [form, setForm]        = useState<EditState | null>(null);
  const [saving, setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supabaseGetUsers();
      setUsers(data);
    } catch (e) {
      console.error('UsersTab load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Exclude the currently logged-in staff member's own player account (matched by email)
  const visibleUsers = currentStaffEmail
    ? users.filter((u) => u.email !== currentStaffEmail)
    : users;

  const filtered = visibleUsers.filter((u) => {
    const query = q.toLowerCase();
    return (
      (u.username     ?? '').toLowerCase().includes(query) ||
      (u.display_name ?? '').toLowerCase().includes(query) ||
      (u.account_id   ?? '').toLowerCase().includes(query) ||
      u.id.toLowerCase().includes(query)
    );
  });

  const openEdit = (u: SupabaseProfile) => {
    setEditUser(u);
    setForm(profileToEdit(u));
    setSaveError(null);
  };

  const closeEdit = () => {
    setEditUser(null);
    setForm(null);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!editUser || !form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload: UserUpdatePayload = {
        username:     form.username     || undefined,
        display_name: form.display_name || undefined,
        phone:        form.phone        || undefined,
        email:        form.email        || undefined,
        balance:      parseFloat(form.balance)   || 0,
        vip_level:    parseInt(form.vip_level, 10) || 0,
        is_active:    form.is_active,
        is_banned:    form.is_banned,
        account_id:   form.account_id   || undefined,
      };
      await supabaseUpdateUserFull(editUser.id, payload);
      // Update local state so table reflects change without full reload
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editUser.id
            ? {
                ...u,
                username:     payload.username     ?? u.username,
                display_name: payload.display_name ?? u.display_name,
                phone:        payload.phone        ?? u.phone,
                email:        payload.email        ?? u.email,
                balance:      payload.balance      ?? u.balance,
                vip_level:    payload.vip_level    ?? u.vip_level,
                is_active:    payload.is_active    ?? u.is_active,
                is_banned:    payload.is_banned    ?? u.is_banned,
                account_id:   payload.account_id   ?? u.account_id,
              }
            : u,
        ),
      );
      closeEdit();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Users className="w-5 h-5 text-blue-400" />
        <h2 className="text-lg font-semibold text-white">Users</h2>
        <button
          onClick={() => void load()}
          className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username, display name, account ID or user ID…"
          className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-slate-400 text-left">
                <th className="px-3 py-2">Account ID</th>
                <th className="px-3 py-2">Username</th>
                <th className="px-3 py-2">Display Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Balance</th>
                <th className="px-3 py-2">VIP</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Banned</th>
                <th className="px-3 py-2">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400">No users found</td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => openEdit(u)}
                    className="border-t border-slate-700 hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{u.account_id || '—'}</td>
                    <td className="px-3 py-2 text-white">{u.username || '—'}</td>
                    <td className="px-3 py-2 text-slate-300">{u.display_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{u.email || '—'}</td>
                    <td className="px-3 py-2 text-green-400 font-mono">{fmt(u.balance)}</td>
                    <td className="px-3 py-2 text-center">{u.vip_level}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={u.is_active ? 'text-green-400' : 'text-slate-500'}>
                        {u.is_active ? '✓' : '✗'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={u.is_banned ? 'text-red-400' : 'text-slate-500'}>
                        {u.is_banned ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-400 text-xs">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating edit panel — no is_admin field (intentional security decision) */}
      {editUser && form && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}
        >
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <div>
                <h3 className="text-white font-semibold text-base">Edit User</h3>
                <p className="text-slate-400 text-xs mt-0.5 font-mono">{editUser.id}</p>
              </div>
              <button
                onClick={closeEdit}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Fields */}
            <div className="px-5 py-4 space-y-4">
              <Field
                label="Account ID"
                value={form.account_id}
                onChange={(v) => setForm((f) => f ? { ...f, account_id: v } : f)}
              />
              <Field
                label="Username"
                value={form.username}
                onChange={(v) => setForm((f) => f ? { ...f, username: v } : f)}
              />
              <Field
                label="Display Name"
                value={form.display_name}
                onChange={(v) => setForm((f) => f ? { ...f, display_name: v } : f)}
              />
              <Field
                label="Phone"
                value={form.phone}
                onChange={(v) => setForm((f) => f ? { ...f, phone: v } : f)}
              />
              <Field
                label="Email"
                type="email"
                value={form.email}
                onChange={(v) => setForm((f) => f ? { ...f, email: v } : f)}
              />
              <Field
                label="Balance (₹)"
                type="number"
                value={form.balance}
                onChange={(v) => setForm((f) => f ? { ...f, balance: v } : f)}
              />
              <Field
                label="VIP Level"
                type="number"
                value={form.vip_level}
                onChange={(v) => setForm((f) => f ? { ...f, vip_level: v } : f)}
              />

              {/* Boolean toggles */}
              <div className="grid grid-cols-2 gap-4">
                <Toggle
                  label="Active"
                  value={form.is_active}
                  onChange={(v) => setForm((f) => f ? { ...f, is_active: v } : f)}
                />
                <Toggle
                  label="Banned"
                  value={form.is_banned}
                  onChange={(v) => setForm((f) => f ? { ...f, is_banned: v } : f)}
                  danger
                />
              </div>

              {/* Read-only info */}
              <div className="bg-slate-800 rounded-lg p-3 space-y-1 text-xs text-slate-400">
                <InfoRow label="Total Deposit"  value={fmt(editUser.total_deposit)} />
                <InfoRow label="Total Withdrawn" value={fmt(editUser.total_withdrawal)} />
                <InfoRow label="Referral Code"  value={editUser.referral_code ?? '—'} />
                <InfoRow label="Joined"         value={new Date(editUser.created_at).toLocaleString()} />
              </div>

              {saveError && (
                <p className="text-red-400 text-sm">{saveError}</p>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={closeEdit}
                className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                ) : (
                  <><Save className="w-4 h-4" /> Save Changes</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Sub-components ----
function Field({
  label, value, onChange, type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

function Toggle({
  label, value, onChange, danger = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={[
        'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
        value
          ? danger
            ? 'bg-red-900/40 border-red-600 text-red-300'
            : 'bg-green-900/40 border-green-600 text-green-300'
          : 'bg-slate-800 border-slate-600 text-slate-400',
      ].join(' ')}
    >
      <span
        className={[
          'w-2.5 h-2.5 rounded-full',
          value
            ? danger ? 'bg-red-400' : 'bg-green-400'
            : 'bg-slate-500',
        ].join(' ')}
      />
      {label}: {value ? 'Yes' : 'No'}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="text-slate-300 font-mono">{value}</span>
    </div>
  );
}
