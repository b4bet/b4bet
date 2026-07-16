import { useState } from 'react';
import { X, Mail, Phone, KeyRound, User as UserIcon } from 'lucide-react';
import PasswordInput from './PasswordInput';
import { store } from '../lib/store';
import { cms } from '../lib/cms';
import { getOrCreateAccountId } from '../lib/accountId';
import { useBalance } from '../lib/hooks';

import type { Route } from './BottomNav';

interface Props { open: boolean; onClose: () => void; onNavigate?: (r: Route) => void; }

type Tab = 'profile' | 'password';

const PROFILE_KEY = 'b4bet.profile.contact.v1';
type Contact = { email: string; phone: string };
function loadContact(): Contact {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { email: 'you@b4bet.com', phone: '+91 9XXXXXXXXX' };
}
function saveContact(c: Contact) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(c)); } catch { /* ignore */ } }

export default function ProfilePopup({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('profile');
  const [contact, setContact] = useState<Contact>(() => loadContact());
  const balance = useBalance();
  const accountId = getOrCreateAccountId();

  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const onSaveContact = () => {
    saveContact(contact);
    cms.pushFromTemplate('nt_profile_updated', 'Profile updated', 'Your contact info was saved.', 'success');
  };

  const changePwd = () => {
    if (!oldPwd || !newPwd || !confirmPwd) return setPwdMsg({ kind: 'error', text: 'All fields are required.' });
    if (newPwd.length < 6) return setPwdMsg({ kind: 'error', text: 'New password must be at least 6 characters.' });
    if (newPwd !== confirmPwd) return setPwdMsg({ kind: 'error', text: 'Passwords do not match.' });
    setPwdMsg({ kind: 'success', text: 'Password updated successfully.' });
    setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    cms.pushFromTemplate('nt_password_changed', 'Password changed', 'Your password was updated.', 'success');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-midnight-950/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-slatepanel-900 border border-borderline-900 rounded-2xl shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between p-4 border-b border-borderline-900">
          <h2 className="font-display font-bold text-white">Your Profile</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center">
            <X className="w-4 h-4 text-slate-300" />
          </button>
        </header>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-midnight-850 border border-borderline-900">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center">
              <UserIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">User Account ID</p>
              <p className="font-display font-extrabold text-lg text-white tabular tracking-wider">{accountId}</p>
            </div>
            <p className="text-sm text-emeraldwin-400 tabular font-semibold">{store.currency}{balance.toFixed(2)}</p>
          </div>

          <div className="flex gap-1 bg-midnight-850 rounded-xl p-1">
            <button onClick={() => setTab('profile')}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold ${tab === 'profile' ? 'bg-slatepanel-700 text-white' : 'text-slate-400'}`}>
              Account
            </button>
            <button onClick={() => setTab('password')}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold ${tab === 'password' ? 'bg-slatepanel-700 text-white' : 'text-slate-400'}`}>
              Change Password
            </button>
          </div>

          {tab === 'profile' && (
            <div className="space-y-2">
              <label className="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Registered Email</label>
              <input className="input" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
              <label className="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone Number</label>
              <input className="input" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              <button onClick={onSaveContact} className="btn-primary w-full py-2">Save</button>
            </div>
          )}

          {tab === 'password' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-semibold">
                <KeyRound className="w-3.5 h-3.5" /> Update password
              </div>
              <PasswordInput value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} placeholder="Old password" />
              <PasswordInput value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="New password" />
              <PasswordInput value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="Confirm new password" />
              {pwdMsg && <p className={`text-xs ${pwdMsg.kind === 'success' ? 'text-emeraldwin-400' : 'text-coral-400'}`}>{pwdMsg.text}</p>}
              <button onClick={changePwd} className="btn-primary w-full py-2">Update Password</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
