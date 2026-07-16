import { useState } from 'react';
import { Mail, Save, Eye, Code2, Send } from 'lucide-react';
import { cms } from '../../lib/cms';
import { useEmailTemplates } from '../../lib/cmsHooks';
import type { EmailTemplates } from '../../lib/cms';

const tabs: { key: keyof EmailTemplates; label: string; vars: string[]; smtpFn: string }[] = [
  { key: 'welcome', label: 'Welcome Email', vars: ['{{username}}', '{{date}}'], smtpFn: 'sendWelcomeEmail()' },
  { key: 'depositSuccess', label: 'Deposit Success', vars: ['{{username}}', '{{amount}}', '{{balance}}', '{{txn_id}}'], smtpFn: 'sendDepositEmail()' },
  { key: 'withdrawalStatus', label: 'Withdrawal Status', vars: ['{{username}}', '{{amount}}', '{{status}}', '{{txn_id}}'], smtpFn: 'sendWithdrawalEmail()' },
];

export default function EmailManagerTab() {
  const templates = useEmailTemplates();
  const [active, setActive] = useState<keyof EmailTemplates>('welcome');
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState<EmailTemplates>(templates);

  const current = tabs.find((t) => t.key === active)!;
  const html = draft[active];

  const save = () => {
    cms.setEmailTemplate(active, html);
    cms.toast({ title: 'Template saved', body: `${current.label} mapped to ${current.smtpFn}.`, kind: 'success' });
  };

  const test = () => {
    cms.toast({ title: 'Test email queued', body: `${current.label} dispatched via SMTP.`, kind: 'info' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display font-bold text-lg text-white">Email Manager</h2>
          <p className="text-xs text-slate-500">Customizable HTML templates mapped to active SMTP functions.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={test} className="btn-ghost px-3 py-2 text-sm"><Send className="w-4 h-4" /> Send test</button>
          <button onClick={save} className="btn-primary px-3 py-2 text-sm"><Save className="w-4 h-4" /> Save</button>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setActive(t.key); setPreview(false); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              active === t.key ? 'bg-gradient-to-br from-neon-400 to-neon-600 text-white' : 'bg-slatepanel-800 border border-borderline-900 text-slate-400'
            }`}
          >
            <Mail className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel p-3 text-xs text-slate-400">
        Mapped SMTP function: <code className="text-neon-300">{current.smtpFn}</code>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="panel p-1">
          <div className="flex items-center justify-between px-3 py-2 border-b border-borderline-900">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <Code2 className="w-4 h-4" /> {active}.html
            </div>
            <button onClick={() => setPreview(!preview)} className="btn-ghost px-3 py-1.5 text-xs lg:hidden">
              {preview ? <Code2 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <div className="bg-white rounded-b-2xl p-4 min-h-[16rem] lg:hidden" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <textarea
              value={html}
              onChange={(e) => setDraft({ ...draft, [active]: e.target.value })}
              spellCheck={false}
              className="w-full h-80 bg-midnight-850 p-4 font-mono text-xs text-emeraldwin-300 outline-none resize-none scrollbar-thin"
            />
          )}
        </div>

        {/* Always-on live preview pane */}
        <div className="panel p-1 hidden lg:block">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-borderline-900 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <Eye className="w-4 h-4" /> Live Preview
          </div>
          <div className="bg-white rounded-b-2xl p-4 min-h-[20rem] max-h-[28rem] overflow-auto" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="font-display font-bold text-sm text-white mb-2">Available Variables</h3>
        <div className="flex flex-wrap gap-2">
          {current.vars.map((v) => (
            <span key={v} className="chip bg-midnight-850 border border-borderline-900 text-neon-300 font-mono text-xs">{v}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
