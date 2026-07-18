import { useState, useEffect } from 'react';
import { Megaphone, Users, Send, Calendar, Target, RefreshCw } from 'lucide-react';
import { cms } from '../../lib/cms';
import { supabase } from '../../integrations/supabase/client';
import SelectModal from '../../components/SelectModal';

const segments = ['All Users', 'VIP', 'New Signups', 'Inactive 30d', 'High Rollers'];

const scheduleOptions = [
  { value: 'now', label: 'Send Now' },
  { value: '1h', label: 'In 1 hour' },
  { value: '24h', label: 'In 24 hours' },
  { value: '7d', label: 'In 7 days' },
];

interface Campaign {
  id: string;
  name: string;
  segment: string;
  subject: string;
  message: string;
  schedule: string;
  status: string;
  reach_count: number;
  sent_at: string | null;
  created_at: string;
}

export default function CrmTab() {
  const [name, setName] = useState('Weekend Bonus Blast');
  const [segment, setSegment] = useState('All Users');
  const [subject, setSubject] = useState('Get 50% bonus this weekend!');
  const [message, setMessage] = useState('Deposit this weekend and get a 50% match bonus up to ₹5,000. Use code WEEKEND50.');
  const [schedule, setSchedule] = useState('now');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCampaigns = async () => {
    const { data } = await supabase.rpc('admin_get_crm_campaigns', { p_limit: 20 });
    if (data) setCampaigns(data as Campaign[]);
  };

  useEffect(() => { void loadCampaigns(); }, []);

  const launch = async () => {
    if (!name.trim() || !subject.trim() || !message.trim()) {
      cms.toast({ title: 'Missing fields', body: 'Name, subject and message are required.', kind: 'alert' });
      return;
    }
    setLoading(true);
    const { error } = await supabase.rpc('admin_save_crm_campaign', {
      p_name: name.trim(),
      p_segment: segment,
      p_subject: subject.trim(),
      p_message: message.trim(),
      p_schedule: schedule,
      p_reach_count: 0,
    });
    setLoading(false);
    if (error) {
      cms.toast({ title: 'Failed to save campaign', body: error.message, kind: 'alert' });
      return;
    }
    cms.toast({ title: 'Campaign launched', body: `"${name}" targeting ${segment} saved.`, kind: 'success' });
    void loadCampaigns();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-white">CRM Campaign</h2>
        <p className="text-xs text-slate-500">Target user segments with promotional campaigns. Campaigns are saved to the database.</p>
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

        <button
          onClick={() => { void launch(); }}
          disabled={loading}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {schedule === 'now' ? 'Launch Campaign' : 'Schedule Campaign'}
        </button>
      </div>

      <div className="panel p-4">
        <h3 className="font-display font-bold text-sm text-white mb-3 flex items-center gap-2">
          <Target className="w-4 h-4 text-neon-300" /> Recent Campaigns
        </h3>
        <div className="space-y-2">
          {campaigns.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-4">No campaigns yet. Launch your first campaign above.</p>
          )}
          {campaigns.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-2.5 rounded-xl bg-midnight-850 border border-borderline-900">
              <div>
                <p className="text-sm font-semibold text-white">{c.name}</p>
                <p className="text-[11px] text-slate-500">{c.segment} · {c.schedule === 'now' ? 'Sent immediately' : `Scheduled: ${c.schedule}`}</p>
              </div>
              <span className={`chip text-[10px] ${c.status === 'sent' ? 'bg-emeraldwin-500/15 border border-emeraldwin-500/40 text-emeraldwin-400' : 'bg-amberx-500/15 border border-amberx-500/40 text-amberx-400'}`}>
                {c.status === 'sent' ? 'Complete' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
