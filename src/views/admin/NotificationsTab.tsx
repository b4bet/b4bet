import { useState } from 'react';
import { Bell, Send, Users as UsersIcon, User, Sparkles } from 'lucide-react';
import SelectModal from '../../components/SelectModal';
import { store } from '../../lib/store';
import { useNotifications } from '../../lib/hooks';
import { cms } from '../../lib/cms';

type Kind = 'info' | 'success' | 'warn' | 'alert';

export default function NotificationsTab() {
  const log = useNotifications();
  const [mode, setMode] = useState<'bulk' | 'targeted'>('bulk');
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<Kind>('info');

  const send = () => {
    if (!title.trim() || !body.trim()) {
      cms.toast({ title: 'Missing fields', body: 'Title & body are required.', kind: 'alert' });
      return;
    }
    if (mode === 'targeted' && !target.trim()) {
      cms.toast({ title: 'Missing target', body: 'Provide a User ID.', kind: 'alert' });
      return;
    }
    const label = mode === 'bulk' ? '[Broadcast] ' : `[@${target.trim()}] `;
    store.pushNotification({ title: label + title.trim(), body: body.trim(), kind });
    cms.toast({ title: 'Notification dispatched', body: mode === 'bulk' ? 'Sent to all users.' : `Sent to ${target}.`, kind: 'success' });
    setTitle(''); setBody('');
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-white">Notifications Engine</h2>
        <p className="text-xs text-slate-500">Push bulk or targeted alerts. Deposit, withdrawal and welcome logs auto-inject below.</p>
      </div>

      <div className="panel p-4 space-y-3">
        <div className="flex gap-2">
          <button onClick={() => setMode('bulk')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all ${mode === 'bulk' ? 'bg-gradient-to-br from-neon-400 to-neon-600 text-white' : 'bg-slatepanel-800 border border-borderline-900 text-slate-300'}`}>
            <UsersIcon className="w-4 h-4" /> Bulk (all users)
          </button>
          <button onClick={() => setMode('targeted')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all ${mode === 'targeted' ? 'bg-gradient-to-br from-neon-400 to-neon-600 text-white' : 'bg-slatepanel-800 border border-borderline-900 text-slate-300'}`}>
            <User className="w-4 h-4" /> Targeted (User ID)
          </button>
        </div>

        {mode === 'targeted' && (
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="User ID (6-digit, e.g. 123456)" className="input" />
        )}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message body" rows={3} className="input resize-none" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Kind</label>
          <SelectModal
            value={kind}
            options={[
              { value: 'info', label: 'Info' },
              { value: 'success', label: 'Success' },
              { value: 'warn', label: 'Warning' },
              { value: 'alert', label: 'Alert' },
            ]}
            onChange={(v) => setKind(v as Kind)}
            className="py-1.5 text-sm w-40"
          />
          <button onClick={send} className="btn-primary px-4 py-2 text-sm ml-auto">
            <Send className="w-4 h-4" /> Dispatch
          </button>
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="font-display font-bold text-sm text-white mb-3 flex items-center gap-2">
          <Bell className="w-4 h-4 text-neon-300" /> System Log
          <span className="text-[10px] text-slate-500 font-normal flex items-center gap-1"><Sparkles className="w-3 h-3" /> Gameplay events excluded</span>
        </h3>
        <div className="space-y-2 max-h-96 overflow-auto scrollbar-thin">
          {log.length === 0 && <div className="text-slate-500 text-sm text-center py-4">No notifications yet.</div>}
          {log.map((n) => (
            <div key={n.id} className="bg-midnight-850 rounded-lg px-3 py-2 border border-borderline-900">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white font-semibold">{n.title}</span>
                <span className={`chip text-[10px] ${
                  n.kind === 'success' ? 'bg-emeraldwin-500/15 text-emeraldwin-300' :
                  n.kind === 'warn' ? 'bg-amberx-500/15 text-amberx-300' :
                  n.kind === 'alert' ? 'bg-coral-500/15 text-coral-300' :
                  'bg-slatepanel-800 text-slate-300'
                }`}>{n.kind}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{n.body}</p>
              <p className="text-[10px] text-slate-500 mt-1">{new Date(n.ts).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
