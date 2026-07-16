import { useState } from 'react';
import { X, KeyRound, CheckCircle2 } from 'lucide-react';
import { cms } from '../lib/cms';
import PasswordInput from './PasswordInput';

interface Props {
  open: boolean;
  onClose: () => void;
  staffId: string;
  staffName: string;
}

/**
 * Change Password modal for admin/staff. Uses PasswordInput which already
 * exposes the "show password" (eye) toggle on every field.
 */
export default function AdminChangePasswordModal({ open, onClose, staffId, staffName }: Props) {
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const reset = () => {
    setOldPass('');
    setNewPass('');
    setConfirmPass('');
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPass !== confirmPass) {
      setError('New password and confirmation do not match.');
      return;
    }
    setBusy(true);
    const res = cms.changeStaffPassword(staffId, oldPass, newPass);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || 'Unable to update password.');
      return;
    }
    cms.toast({ title: 'Password updated', body: 'Your admin password has been changed.', kind: 'success' });
    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-midnight-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md panel p-5 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center">
              <KeyRound className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-display font-bold text-white text-sm">Change Password</h3>
              <p className="text-[11px] text-slate-500">Signed in as {staffName}</p>
            </div>
          </div>
          <button
            onClick={() => { reset(); onClose(); }}
            className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center text-slate-300 hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Old Password</label>
            <PasswordInput
              value={oldPass}
              onChange={(e) => setOldPass(e.target.value)}
              autoComplete="current-password"
              placeholder="Current password"
              className="mt-1 w-full"
              required
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">New Password</label>
            <PasswordInput
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              autoComplete="new-password"
              placeholder="At least 4 characters"
              className="mt-1 w-full"
              required
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Confirm New Password</label>
            <PasswordInput
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              autoComplete="new-password"
              placeholder="Repeat new password"
              className="mt-1 w-full"
              required
            />
          </div>

          {error && (
            <div className="text-xs text-coral-300 bg-coral-500/10 border border-coral-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {busy ? 'Updating…' : 'Update Password'}
            </button>
            <button
              type="button"
              onClick={() => { reset(); onClose(); }}
              className="px-4 py-2.5 rounded-xl bg-slatepanel-800 border border-borderline-900 text-slate-300 hover:text-white text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
