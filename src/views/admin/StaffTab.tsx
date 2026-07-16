import { useState, useMemo, useEffect, useRef } from 'react';
import { Users, Trash2, Plus, MessageSquare, X, Send, ShieldCheck, Briefcase, Headphones, KeyRound, Save } from 'lucide-react';
import PasswordInput from '../../components/PasswordInput';
import SelectModal from '../../components/SelectModal';
import { cms } from '../../lib/cms';
import { useStaff, useStaffSession } from '../../lib/cmsHooks';
import { useBus } from '../../lib/hooks';
import { Topics } from '../../lib/bus';
import type { StaffRole, StaffDM, StaffAccount, PermissionKey } from '../../lib/cms';
import { ALL_PERMISSIONS } from '../../lib/cms';

const roleMeta: Record<StaffRole, { label: string; icon: typeof Briefcase; accent: string }> = {
  support: { label: 'Chat Support Agent', icon: Headphones, accent: 'text-neon-300' },
  finance: { label: 'Finance Manager', icon: Briefcase, accent: 'text-emeraldwin-400' },
};

const permLabels: Record<PermissionKey, string> = {
  finance: 'Finance', banner: 'Banners & Logo', deposit: 'Manual Deposit', emails: 'Email Manager',
  staff: 'Staff & Chat', marketing: 'Marketing', algos: 'Game Algos', users: 'Users',
  smtp: 'SMTP', currencies: 'Currencies', crm: 'CRM', intercom: 'Intercom', notify: 'Notifications',
  gateways: 'Auto Gateways', tickets: 'Live Tickets', history: 'History',
  withdrawals: 'Withdrawals', redeem: 'Redeem Codes',
  gameSettings: '8-Game Settings', paymentMethods: 'Payment Methods',
  dynamicPages: 'Dynamic Pages', ban: 'Ban Section', notifyManager: 'Notification Manager',
};


export default function StaffTab() {
  const staff = useStaff();
  const sessionId = useStaffSession();
  const me = staff.find((s) => s.id === sessionId) ?? null;

  const [name, setName] = useState('');
  const [pwd, setPwd] = useState('');
  const [role, setRole] = useState<StaffRole>('support');
  const [chatWith, setChatWith] = useState<StaffAccount | null>(null);

  const create = () => {
    if (!name.trim() || !pwd.trim()) return;
    cms.addStaff(name.trim(), pwd.trim(), role);
    setName(''); setPwd('');
    cms.toast({ title: 'Staff account created', body: `${name} · ${roleMeta[role].label}`, kind: 'success' });
  };

  // Self-exclusion only: roster shows every other staff account.
  const roster = useMemo(() => {
    if (!me) return staff.filter((s) => s.id !== sessionId);
    return staff.filter((s) => s.id !== me.id);
  }, [staff, me, sessionId]);


  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-white">Staff Sub-Accounts & Internal Chat</h2>
        <p className="text-xs text-slate-500">Create Support / Finance operators and message across departments.</p>
      </div>

      {/* Session switcher (mock login) */}
      <div className="panel p-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-4 h-4 text-neon-300" />
          <h3 className="font-display font-bold text-white text-sm">Active operator session</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {staff.map((s) => {
            const RM = roleMeta[s.role];
            const active = s.id === sessionId;
            return (
              <button
                key={s.id}
                onClick={() => cms.setStaffSession(s.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  active ? 'bg-gradient-to-br from-neon-400 to-neon-600 text-white' : 'bg-slatepanel-800 border border-borderline-900 text-slate-300'
                }`}
              >
                <RM.icon className={`w-3.5 h-3.5 ${active ? 'text-white' : RM.accent}`} />
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Create staff */}
      <div className="panel p-4">
        <h3 className="font-display font-bold text-white text-sm mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-neon-300" /> New staff account</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" className="input" />
          <PasswordInput value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Password" />
          <SelectModal
            value={role}
            options={[
              { value: 'support', label: 'Chat Support Agent' },
              { value: 'finance', label: 'Finance Manager' },
            ]}
            onChange={(v) => setRole(v as StaffRole)}
          />
          <button onClick={create} className="btn-primary px-3 py-2 text-sm"><Plus className="w-4 h-4" /> Create</button>
        </div>
      </div>

      {/* Staff list */}
      <div className="panel p-4">
        <h3 className="font-display font-bold text-white text-sm mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-neon-300" /> All staff</h3>
        <div className="space-y-2">
          {staff.map((s) => {
            const RM = roleMeta[s.role];
            return (
              <div key={s.id} className="bg-midnight-850 rounded-lg px-3 py-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RM.icon className={`w-4 h-4 ${RM.accent}`} />
                    <span className="text-sm text-white">{s.name}</span>
                    <span className="text-[10px] text-slate-500">{RM.label}</span>
                    {s.online && <span className="w-1.5 h-1.5 rounded-full bg-emeraldwin-500" />}
                  </div>
                  <button onClick={() => cms.removeStaff(s.id)} className="text-coral-400 hover:text-coral-300">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Password management — admin can view & update */}
                <StaffPasswordRow staffId={s.id} current={s.password} />

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {ALL_PERMISSIONS.map((p) => {
                    const on = !!s.permissions?.[p];
                    return (
                      <button key={p} onClick={() => cms.setStaffPermission(s.id, p, !on)}
                        className={`flex items-center justify-between text-[10px] px-2 py-1 rounded border transition-all ${on ? 'bg-emeraldwin-500/15 border-emeraldwin-500/40 text-emeraldwin-300' : 'bg-slatepanel-800 border-borderline-900 text-slate-500'}`}>
                        <span className="truncate">{permLabels[p]}</span>
                        <span className={`ml-1 w-6 h-3 rounded-full relative ${on ? 'bg-emeraldwin-500' : 'bg-slatepanel-700'}`}>
                          <span className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
                        </span>
                      </button>
                    );
                  })}
                </div>

              </div>

            );
          })}
        </div>
      </div>

      {/* Internal chat roster (cross-department only) */}
      <div className="panel p-4">
        <h3 className="font-display font-bold text-white text-sm mb-1 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-neon-300" /> Internal Chat — Cross-department roster</h3>
        <p className="text-[10px] text-slate-500 mb-3">
          {me ? <>Logged in as <span className="text-neon-300">{me.name}</span> ({roleMeta[me.role].label}). You can only message opposing departments.</> : 'Pick an operator session above.'}
        </p>
        {roster.length === 0 ? (
          <div className="text-slate-500 text-sm">No other-department staff online.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {roster.map((s) => {
              const RM = roleMeta[s.role];
              return (
                <button
                  key={s.id}
                  onClick={() => setChatWith(s)}
                  className="flex items-center justify-between bg-midnight-850 hover:bg-slatepanel-800 rounded-lg px-3 py-2 border border-borderline-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <RM.icon className={`w-4 h-4 ${RM.accent}`} />
                    <div className="text-left">
                      <div className="text-sm text-white">{s.name}</div>
                      <div className="text-[10px] text-slate-500">{RM.label}</div>
                    </div>
                  </div>
                  <MessageSquare className="w-4 h-4 text-neon-300" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {chatWith && me && <ChatPopup me={me} other={chatWith} onClose={() => setChatWith(null)} />}
    </div>
  );
}

function ChatPopup({ me, other, onClose }: { me: StaffAccount; other: StaffAccount; onClose: () => void }) {
  const dms = useBus<StaffDM[]>(Topics.StaffDM, cms.staffDMs);
  const [body, setBody] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const RM = roleMeta[other.role];

  const conv = useMemo(
    () => dms.filter((m) => (m.fromId === me.id && m.toId === other.id) || (m.fromId === other.id && m.toId === me.id)),
    [dms, me.id, other.id]
  );

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv.length]);

  const send = () => {
    if (!body.trim()) return;
    cms.sendStaffDM(other.id, body.trim());
    setBody('');
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] panel border border-neon-400/40 bg-midnight-900/95 backdrop-blur-xl shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-borderline-900">
        <div className="flex items-center gap-2">
          <RM.icon className={`w-4 h-4 ${RM.accent}`} />
          <div>
            <div className="text-sm text-white font-semibold">{other.name}</div>
            <div className="text-[10px] text-slate-500">{RM.label}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 h-72 overflow-auto p-3 space-y-2 scrollbar-thin">
        {conv.length === 0 && <div className="text-slate-500 text-xs text-center mt-4">No messages yet. Say hi 👋</div>}
        {conv.map((m) => {
          const mine = m.fromId === me.id;
          return (
            <div key={m.id} className={`max-w-[80%] ${mine ? 'ml-auto' : ''}`}>
              <div className={`rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-neon-500/20 text-white' : 'bg-slatepanel-800 text-slate-200'}`}>{m.body}</div>
              <div className={`text-[9px] text-slate-500 mt-0.5 ${mine ? 'text-right' : ''}`}>{new Date(m.ts).toLocaleTimeString()}</div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="p-2 border-t border-borderline-900 flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message…"
          className="input flex-1 text-sm py-2"
        />
        <button onClick={send} className="btn-primary px-3 py-2"><Send className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function StaffPasswordRow({ staffId, current }: { staffId: string; current: string }) {
  const [val, setVal] = useState(current);
  useEffect(() => { setVal(current); }, [current]);
  const dirty = val !== current;
  return (
    <div className="flex items-center gap-2">
      <KeyRound className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Password</span>
      <div className="flex-1 min-w-0">
        <PasswordInput
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="py-1.5 text-xs"
          placeholder="Set password"
        />
      </div>
      <button
        onClick={() => { cms.updateStaffPassword(staffId, val); cms.toast({ title: 'Password updated', body: 'Staff credential rotated.', kind: 'success' }); }}
        disabled={!dirty || !val.trim()}
        className="btn-primary px-2 py-1.5 text-xs disabled:opacity-40"
      >
        <Save className="w-3.5 h-3.5" /> Save
      </button>
    </div>
  );
}
