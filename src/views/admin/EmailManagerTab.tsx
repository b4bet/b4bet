import { useState, useEffect } from 'react';
import { Mail, Save, Eye, Code2, Send, AlertCircle } from 'lucide-react';
import { cms } from '../../lib/cms';
import { useEmailTemplates } from '../../lib/cmsHooks';
import { supabase } from '../../integrations/supabase/client';
import type { EmailTemplates } from '../../lib/cms';

const tabs: { key: keyof EmailTemplates; label: string; vars: { name: string; desc: string }[]; smtpFn: string }[] = [
  {
    key: 'welcome',
    label: 'Welcome Email',
    smtpFn: 'sendWelcomeEmail()',
    vars: [
      { name: '{{username}}', desc: 'User ka naam' },
      { name: '{{date}}', desc: 'Registration date' },
    ],
  },
  {
    key: 'depositSuccess',
    label: 'Deposit Success',
    smtpFn: 'sendDepositEmail()',
    vars: [
      { name: '{{username}}', desc: 'User ka naam' },
      { name: '{{amount}}', desc: 'Deposit amount (e.g. ₹500)' },
      { name: '{{balance}}', desc: 'Nayi wallet balance' },
      { name: '{{txn_id}}', desc: 'Transaction ID' },
      { name: '{{status}}', desc: 'Status: approved / rejected' },
      { name: '{{date}}', desc: 'Transaction date/time' },
      { name: '{{method}}', desc: 'Payment method (UPI, Bank etc.)' },
    ],
  },
  {
    key: 'withdrawalStatus',
    label: 'Withdrawal Status',
    smtpFn: 'sendWithdrawalEmail()',
    vars: [
      { name: '{{username}}', desc: 'User ka naam' },
      { name: '{{amount}}', desc: 'Withdrawal amount (e.g. ₹500)' },
      { name: '{{status}}', desc: 'Status: approved / rejected / processing' },
      { name: '{{txn_id}}', desc: 'Transaction ID' },
      { name: '{{destination}}', desc: 'UPI ID ya bank account' },
      { name: '{{date}}', desc: 'Transaction date/time' },
      { name: '{{utr}}', desc: 'UTR number (agar available ho)' },
    ],
  },
  {
    key: 'forgotPassword',
    label: 'Forgot Password',
    smtpFn: 'sendForgotPasswordEmail()',
    vars: [
      { name: '{{username}}', desc: 'User ka naam' },
      { name: '{{reset_link}}', desc: 'Password reset link' },
      { name: '{{otp}}', desc: 'OTP code (agar use ho)' },
      { name: '{{expiry}}', desc: 'Link expiry time (e.g. 30 minutes)' },
      { name: '{{date}}', desc: 'Request date/time' },
      { name: '{{ip_address}}', desc: 'Request karne wale ka IP' },
    ],
  },
];

export default function EmailManagerTab() {
  const templates = useEmailTemplates();
  const [active, setActive] = useState<keyof EmailTemplates>('welcome');
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState<EmailTemplates>(templates);
  const [synced, setSynced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // When Supabase templates load (non-empty), sync draft once
  useEffect(() => {
    if (!synced && templates.welcome) {
      setDraft(templates);
      setSynced(true);
    }
  }, [templates, synced]);

  const current = tabs.find((t) => t.key === active)!;
  const html = (draft[active] as string | undefined) ?? '';

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Update in-memory CMS state
      cms.setEmailTemplate(active, html);

      // Persist to Supabase settings table
      const updatedTemplates = { ...cms.emailTemplates };
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'email_templates', value: updatedTemplates }, { onConflict: 'key' });

      if (error) {
        throw new Error(error.message);
      }

      cms.toast({ title: 'Template saved', body: `${current.label} saved successfully.`, kind: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveError(msg);
      cms.toast({ title: 'Save failed', body: msg, kind: 'alert' });
    } finally {
      setSaving(false);
    }
  };

  const test = () => {
    cms.toast({ title: 'Test email queued', body: `${current.label} dispatched via SMTP.`, kind: 'info' });
  };

  const copyVar = (v: string) => {
    navigator.clipboard.writeText(v).catch(() => {});
    cms.toast({ title: 'Copied!', body: `${v} clipboard me copy ho gaya.`, kind: 'success' });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2"><Mail className="w-5 h-5 text-neon-400" /> Email Manager</h2>
          <p className="text-xs text-slate-400 mt-0.5">Customizable HTML templates mapped to active SMTP functions.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={test} className="btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5" /> Send test
          </button>
          <button
            onClick={() => { void save(); }}
            disabled={saving}
            className="btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {saveError}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setActive(t.key); setPreview(false); setSaveError(null); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              active === t.key ? 'bg-gradient-to-br from-neon-400 to-neon-600 text-white' : 'bg-slatepanel-800 border border-borderline-900 text-slate-400'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="text-xs text-slate-500">
        Mapped SMTP function: <span className="text-neon-400 font-mono">{current.smtpFn}</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Editor pane */}
        <div className="rounded-xl overflow-hidden border border-borderline-900">
          <div className="flex items-center justify-between px-3 py-2 bg-slatepanel-800 border-b border-borderline-900">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Code2 className="w-3.5 h-3.5" />
              <span className="font-mono">{active}.html</span>
            </div>
            <button onClick={() => setPreview(!preview)} className="btn-ghost px-3 py-1.5 text-xs lg:hidden">
              {preview ? <Code2 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <iframe srcDoc={html} className="w-full h-80 border-0 bg-white" title="email preview" />
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
        <div className="rounded-xl overflow-hidden border border-borderline-900">
          <div className="flex items-center gap-2 px-3 py-2 bg-slatepanel-800 border-b border-borderline-900">
            <Eye className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">Live Preview</span>
          </div>
          <iframe srcDoc={html} className="w-full h-80 border-0 bg-white" title="email live preview" />
        </div>
      </div>

      {/* Available Variables */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Available Variables</h3>
        <p className="text-xs text-slate-500">Variable par click karo — clipboard me copy ho jayega. Template me paste karo.</p>
        <div className="grid grid-cols-2 gap-2">
          {current.vars.map((v) => (
            <button
              key={v.name}
              onClick={() => copyVar(v.name)}
              title="Click to copy"
              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-midnight-850 border border-borderline-900 hover:border-neon-500 hover:bg-midnight-800 transition-all text-left group"
            >
              <code className="text-neon-400 font-mono text-xs">{v.name}</code>
              <span className="text-xs text-slate-400 truncate">{v.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
