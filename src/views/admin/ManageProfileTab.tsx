import { useState, useEffect } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { cms } from '../../lib/cms';
import { useStaffSession } from '../../lib/cmsHooks';
import { User, Save, KeyRound } from 'lucide-react';

interface StaffProfile { id: string; name: string; email: string; role: string; }

export default function ManageProfileTab() {
  const sessionId = useStaffSession();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [name, setName] = useState('');
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [passError, setPassError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    supabase.rpc('admin_get_staff').then(({ data }) => {
      const me = ((data ?? []) as StaffProfile[]).find(s => s.id === sessionId);
      if (me) { setProfile(me); setName(me.name); }
    });
  }, [sessionId]);

  async function saveName() {
    if (!profile || !name.trim()) return;
    setSaving(true);
    const hash = await cms.hashPassword(name); // only updating name here
    await supabase.from('staff').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', profile.id);
    setSuccess('Name updated!');
    setSaving(false);
    setTimeout(() => setSuccess(''), 3000);
  }

  async function changePassword() {
    setPassError('');
    if (!profile) return;
    if (newPass.length < 6) { setPassError('Password must be at least 6 characters'); return; }
    if (newPass !== confirmPass) { setPassError('Passwords do not match'); return; }
    setSaving(true);
    const oldHash = await cms.hashPassword(currentPass);
    const { data } = await supabase.rpc('admin_staff_login', { p_email: profile.email, p_password_hash: oldHash });
    if (!data || (data as unknown[]).length === 0) { setPassError('Current password is incorrect'); setSaving(false); return; }
    const newHash = await cms.hashPassword(newPass);
    await supabase.rpc('admin_update_staff_password', { p_staff_id: profile.id, p_password_hash: newHash });
    setCurrentPass(''); setNewPass(''); setConfirmPass('');
    setSuccess('Password changed successfully!');
    setSaving(false);
    setTimeout(() => setSuccess(''), 3000);
  }

  if (!profile) return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-neon-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-2">
        <User className="w-5 h-5 text-neon-400" />
        <h2 className="text-lg font-bold">Manage Profile</h2>
      </div>

      {success && <div className="bg-neon-500/10 border border-neon-500/30 rounded-xl px-4 py-3 text-neon-400 text-sm">{success}</div>}

      {/* Profile info */}
      <div className="bg-slatepanel-800 rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold text-slate-300">Profile Info</h3>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Email</label>
          <div className="bg-slatepanel-700 rounded-xl px-4 py-3 text-sm text-slate-400">{profile.email}</div>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Role</label>
          <div className="bg-slatepanel-700 rounded-xl px-4 py-3 text-sm text-slate-400 capitalize">{profile.role}</div>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Display Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neon-500" />
        </div>
        <button onClick={saveName} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-neon-500/20 hover:bg-neon-500/30 text-neon-400 rounded-xl text-sm transition">
          <Save className="w-4 h-4" /> Save Name
        </button>
      </div>

      {/* Change password */}
      <div className="bg-slatepanel-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-400" />
          <h3 className="font-semibold text-slate-300">Change Password</h3>
        </div>
        {passError && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-sm">{passError}</div>}
        {['Current Password', 'New Password', 'Confirm New Password'].map((label, i) => (
          <div key={label}>
            <label className="text-xs text-slate-400 mb-1 block">{label}</label>
            <input type="password"
              value={[currentPass, newPass, confirmPass][i]}
              onChange={e => [setCurrentPass, setNewPass, setConfirmPass][i](e.target.value)}
              className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neon-500" />
          </div>
        ))}
        <button onClick={changePassword} disabled={saving}
          className="w-full py-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-semibold rounded-xl transition disabled:opacity-50">
          {saving ? 'Changing...' : 'Change Password'}
        </button>
      </div>
    </div>
  );
}
