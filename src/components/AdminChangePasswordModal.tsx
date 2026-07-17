import { useState } from 'react';
import { X, KeyRound, CheckCircle2 } from 'lucide-react';
import { supabaseUpdateStaffPassword } from '../lib/supabaseIntegration';
import { cms } from '../lib/cms';
import PasswordInput from './PasswordInput';

interface Props {
  staffId: string;
  staffName?: string;
  onClose: () => void;
}

async function sha256Hex(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function AdminChangePasswordModal({ staffId, staffName, onClose }: Props) {
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setNewPass('');
    setConfirmPass('');
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPass.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const hash = await sha256Hex(newPass);
      await supabaseUpdateStaffPassword(staffId, hash);
      cms.toast({ title: 'Password updated', body: 'Your password has been changed.', kind: 'success' });
      reset();
      onClose();
    } catch {
      setError('Failed to update password. Please try again.');
    } finally {
      setBusy(false);
    }
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
              {staffName && <p className="text-[11px] text-slate-500">Signed in as {staffName}</p>}
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

        <form onSubmit={(e) => { void submit(e); }} className="space-y-3">
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
