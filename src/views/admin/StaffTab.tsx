import { useState } from 'react';
import { UserPlus, Trash2, Shield, ShieldOff, Key, Mail } from 'lucide-react';
import { cms, ALL_PERMISSIONS } from '@/lib/cms';
import type { PermissionKey, StaffRole } from '@/lib/cms';
import { useStaff, useStaffSession } from '@/lib/cmsHooks';
import PasswordInput from '@/components/PasswordInput';

const PERM_LABELS: Record<PermissionKey, string> = {
  finance: 'Finance',
  banner: 'Banner',
  deposit: 'Deposit',
  emails: 'Emails',
  staff: 'Staff',
  marketing: 'Marketing',
  algos: 'Game Algos',
  users: 'Users',
  smtp: 'SMTP',
  currencies: 'Currencies',
  crm: 'CRM',
  intercom: 'Intercom',
  notify: 'Notify',
  gateways: 'Gateways',
  tickets: 'Tickets',
  history: 'History',
  withdrawals: 'Withdrawals',
  redeem: 'Redeem',
  gameSettings: 'Game Settings',
  paymentMethods: 'Payment Methods',
  dynamicPages: 'Dynamic Pages',
  ban: 'Ban',
  notifyManager: 'Notify Manager',
};


export default function StaffTab() {
  const staff = useStaff();
  const sessionId = useStaffSession();
  const me = staff.find((s) => s.id === sessionId) ?? null;

  const isSuperAdmin = me?.isOwner === true;

  // Add staff form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [role, setRole] = useState<StaffRole>('support');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Selected staff for permission editing
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = staff.find((s) => s.id === selectedId) ?? null;

  // Change password
  const [cpId, setCpId] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [cpBusy, setCpBusy] = useState(false);
  const [cpError, setCpError] = useState<string | null>(null);
  const [cpOk, setCpOk] = useState(false);

  const handleAdd = async () => {
    if (!name.trim() || !pwd.trim()) return;
    setAddBusy(true);
    setAddError(null);
    try {
      const emailVal = email.trim() || name.trim().toLowerCase().replace(/\s+/g, '.') + '@b4bet.local';
      const acc = await cms.addStaffAccount(name.trim(), emailVal, pwd.trim(), false);
      if (!acc) {
        setAddError('Failed to add staff. Email may already be in use.');
      } else {
        setName(''); setEmail(''); setPwd('');
      }
    } catch {
      setAddError('An error occurred. Please try again.');
    } finally {
      setAddBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!window.confirm('Remove this staff member?')) return;
    await cms.removeStaff(id);
    if (selectedId === id) setSelectedId(null);
  };

  const handleTogglePerm = async (staffId: string, key: PermissionKey, current: boolean) => {
    await cms.setStaffPermission(staffId, key, !current);
  };

  const handleChangePassword = async () => {
    if (!cpId || !newPwd.trim()) return;
    setCpBusy(true);
    setCpError(null);
    setCpOk(false);
    try {
      await cms.updateStaffPassword(cpId, newPwd.trim());
      setCpOk(true);
      setNewPwd('');
      setTimeout(() => { setCpId(null); setCpOk(false); }, 1500);
    } catch {
      setCpError('Failed to update password.');
    } finally {
      setCpBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="panel p-4">
        <h2 className="font-display font-bold text-white text-base mb-4">Staff Management</h2>

        {/* Add staff */}
        {isSuperAdmin && (
          <div className="bg-slatepanel-900 rounded-xl border border-borderline-900 p-4 mb-6 space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Add Staff Member</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                className="input"
                placeholder="Display name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="input"
                placeholder="Email (optional)"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <PasswordInput
                className="w-full"
                placeholder="Password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
              />
              <select
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as StaffRole)}
              >
                <option value="support">Support</option>
                <option value="finance">Finance / Admin</option>
              </select>
            </div>
            {addError && (
              <p className="text-xs text-coral-300">{addError}</p>
            )}
            <button
              onClick={handleAdd}
              disabled={addBusy || !name.trim() || !pwd.trim()}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <UserPlus className="w-4 h-4" />
              {addBusy ? 'Adding…' : 'Add Staff'}
            </button>
          </div>
        )}

        {/* Staff list */}
        <div className="space-y-2">
          {staff.length === 0 && (
            <p className="text-sm text-slate-500 py-4 text-center">No staff members yet.</p>
          )}
          {staff.map((s) => (
            <div
              key={s.id}
              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedId === s.id
                  ? 'bg-neon-500/10 border-neon-500/40'
                  : 'bg-slatepanel-900 border-borderline-900 hover:border-borderline-700'
              }`}
              onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-500 to-indigo-500 grid place-items-center shrink-0">
                  <span className="text-white text-xs font-bold">{s.name[0]?.toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {s.name}
                    {s.isOwner && <span className="ml-2 text-[10px] bg-neon-500/20 text-neon-300 px-1.5 py-0.5 rounded-full">Super Admin</span>}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{s.email || s.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {s.online && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400" title="Online" />
                )}
                {isSuperAdmin && !s.isOwner && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setCpId(s.id); setNewPwd(''); setCpError(null); setCpOk(false); }}
                      className="p-1.5 rounded-lg bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white"
                      title="Change password"
                    >
                      <Key className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemove(s.id); }}
                      className="p-1.5 rounded-lg bg-slatepanel-800 border border-borderline-900 text-coral-400 hover:text-coral-300"
                      title="Remove staff"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Permission editor */}
        {selected && !selected.isOwner && isSuperAdmin && (
          <div className="mt-4 bg-slatepanel-900 rounded-xl border border-borderline-900 p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Permissions — {selected.name}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_PERMISSIONS.map((key) => {
                const enabled = !!(selected.permissions as Record<string, boolean>)[key];
                return (
                  <button
                    key={key}
                    onClick={() => handleTogglePerm(selected.id, key, enabled)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      enabled
                        ? 'bg-neon-500/15 border-neon-500/40 text-neon-300'
                        : 'bg-slatepanel-800 border-borderline-900 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {enabled ? <Shield className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                    {PERM_LABELS[key]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Change password modal */}
        {cpId && (
          <div className="mt-4 bg-slatepanel-900 rounded-xl border border-borderline-900 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Change Password — {staff.find(s => s.id === cpId)?.name}
            </h3>
            <PasswordInput
              className="w-full"
              placeholder="New password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
            />
            {cpError && <p className="text-xs text-coral-300">{cpError}</p>}
            {cpOk && <p className="text-xs text-emerald-400">Password updated!</p>}
            <div className="flex gap-2">
              <button
                onClick={handleChangePassword}
                disabled={cpBusy || !newPwd.trim()}
                className="btn-primary text-sm flex items-center gap-2"
              >
                <Key className="w-3.5 h-3.5" />
                {cpBusy ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setCpId(null)}
                className="px-3 py-1.5 rounded-lg bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
