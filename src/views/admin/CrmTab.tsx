import { useState } from 'react';
import { Megaphone, Users, Send, Calendar, Target } from 'lucide-react';
import { cms } from '../../lib/cms';
import SelectModal from '../../components/SelectModal';

const segments = ['All Users', 'VIP', 'New Signups', 'Inactive 30d', 'High Rollers'];

const scheduleOptions = [
  { value: 'now', label: 'Send Now' },
  { value: '1h', label: 'In 1 hour' },
  { value: '24h', label: 'In 24 hours' },
  { value: '7d', label: 'In 7 days' },
];

export default function CrmTab() {
  const [name, setName] = useState('Weekend Bonus Blast');
  const [segment, setSegment] = useState('All Users');
  const [subject, setSubject] = useState('Get 50% bonus this weekend!');
  const [message, setMessage] = useState('Deposit this weekend and get a 50% match bonus up to ₹5,000. Use code WEEKEND50.');
  const [schedule, setSchedule] = useState('now');

  const launch = () => {
    cms.toast({ title: 'Campaign launched', body: `"${name}" targeting ${segment} dispatched.`, kind: 'success' });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-white">CRM Campaign</h2>
        <p className="text-xs text-slate-500">Target user segments with promotional campaigns.</p>
      </div>

      <div className="panel p-5 space-y-4">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1"><Megaphone className="w-3 h-3" /> Campaign Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1"><Users className="w-3 h-3" /> Target Segment</label>
            <SelectModal
              value={segment}
              options={segments.map((s) => ({ value: s, label: s }))}
              onChange={setSegment}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1"><Calendar className="w-3 h-3" /> Schedule</label>
            <SelectModal
              value={schedule}
              options={scheduleOptions}
              onChange={setSchedule}
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Subject Line</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input mt-1" />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Message Body</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="input mt-1 resize-none" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="panel-tight p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Reach</p>
            <p className="tabular font-bold text-neon-300 text-lg">12,840</p>
          </div>
          <div className="panel-tight p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Est. Open Rate</p>
            <p className="tabular font-bold text-emeraldwin-400 text-lg">42%</p>
          </div>
          <div className="panel-tight p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Est. CTR</p>
            <p className="tabular font-bold text-amberx-400 text-lg">8.5%</p>
          </div>
        </div>

        <button onClick={launch} className="btn-primary w-full py-3">
          <Send className="w-4 h-4" /> {schedule === 'now' ? 'Launch Campaign' : 'Schedule Campaign'}
        </button>
      </div>

      <div className="panel p-4">
        <h3 className="font-display font-bold text-sm text-white mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-neon-300" /> Recent Campaigns</h3>
        <div className="space-y-2">
          {[
            { n: 'Welcome Series', s: 'New Signups', r: '8,420 sent', st: 'done' },
            { n: 'Crash Tournament', s: 'VIP', r: '1,240 sent', st: 'done' },
            { n: 'Reactivation Push', s: 'Inactive 30d', r: '3,180 queued', st: 'pending' },
          ].map((c) => (
            <div key={c.n} className="flex items-center justify-between p-2.5 rounded-xl bg-midnight-850 border border-borderline-900">
              <div>
                <p className="text-sm font-semibold text-white">{c.n}</p>
                <p className="text-[11px] text-slate-500">{c.s} · {c.r}</p>
              </div>
              <span className={`chip text-[10px] ${c.st === 'done' ? 'bg-emeraldwin-500/15 border border-emeraldwin-500/40 text-emeraldwin-400' : 'bg-amberx-500/15 border border-amberx-500/40 text-amberx-400'}`}>
                {c.st === 'done' ? 'Complete' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
