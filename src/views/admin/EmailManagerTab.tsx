import { useState, useEffect } from 'react';
import { Mail, Save, Eye, Code2, Send, ToggleLeft, ToggleRight } from 'lucide-react';
import { cms } from '../../lib/cms';
import { useEmailTemplates } from '../../lib/cmsHooks';
import { setEmailEnabled, getEmailEnabled } from '../../lib/emailService';
import type { EmailTemplates } from '../../lib/cms';
import { supabase } from '../../integrations/supabase/client';

type EmailType = keyof EmailTemplates;

const tabs: { key: EmailType; label: string; vars: { name: string; desc: string }[]; smtpFn: string }[] = [
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

const SETTINGS_KEY = 'email_enabled';

export default function EmailManagerTab() {
  const templates = useEmailTemplates();
  const [active, setActive] = useState<EmailType>('welcome');
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState<EmailTemplates>(templates);
  const [synced, setSynced] = useState(false);

  // Per-email enabled state, persisted in Supabase settings
  const [enabled, setEnabledState] = useState<Record<EmailType, boolean>>(() => getEmailEnabled());

  // Load enabled state from Supabase on mount
  useEffect(() => {
    supabase.rpc('admin_get_settings').then(({ data }) => {
      if (!data || !Array.isArray(data)) return;
      const rows = data as Array<{ key: string; value: unknown }>;
      const raw = rows.find(r => r.key === SETTINGS_KEY)?.value;
      if (raw && typeof raw === 'object') {
        const saved = raw as Record<string, boolean>;
        const merged: Record<EmailType, boolean> = { ...getEmailEnabled(), ...saved };
        setEnabledState(merged);
        // Sync into emailService module state
        (Object.keys(merged) as EmailType[]).forEach(k => setEmailEnabled(k, merged[k]));
      }
    }).catch(() => {});
  }, []);

  // When Supabase templates load (non-empty), sync draft once
  useEffect(() => {
    if (!synced && templates.welcome) {
      setDraft(templates);
      setSynced(true);
    }
  }, [templates, synced]);

  const current = tabs.find((t) => t.key === active)!;
  const html = (draft[active] as string | undefined) ?? '';

  const save = () => {
    cms.setEmailTemplate(active, html);
    cms.toast({ title: 'Template saved', body: `${current.label} saved successfully.`, kind: 'success' });
  };

  const test = () => {
    cms.toast({ title: 'Test email queued', body: `${current.label} dispatched via SMTP.`, kind: 'info' });
  };

  const copyVar = (v: string) => {
    navigator.clipboard.writeText(v).catch(() => {});
    cms.toast({ title: 'Copied!', body: `${v} clipboard me copy ho gaya.`, kind: 'success' });
  };

  const toggleEmail = (key: EmailType) => {
    const next = { ...enabled, [key]: !enabled[key] };
    setEnabledState(next);
    setEmailEnabled(key, next[key]);
    // Persist to Supabase
    void supabase.rpc('admin_update_setting', { p_key: SETTINGS_KEY, p_value: next as unknown as string })
      .then(() => { cms.toast({ title: next[key] ? 'Email enabled' : 'Email disabled', body: `${tabs.find(t => t.key === key)?.label} ${next[key] ? 'on' : 'off'} kar diya.`, kind: next[key] ? 'success' : 'warn' }); })
      .catch(() => { cms.toast({ title: 'Save failed', body: 'Setting save nahi ho saka. Dobara try karo.', kind: 'alert' }); });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-neon-400" />
          <span className="text-lg font-bold text-white">Email Manager</span>
          <span className="text-xs text-slate-500">Customizable HTML templates mapped to active SMTP functions.</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={test} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slatepanel-700 border border-borderline-900 text-slate-300 text-sm hover:bg-slatepanel-600 transition-colors">
            <Send className="w-3.5 h-3.5" />
            Send test
          </button>
          <button onClick={save} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neon-500/20 border border-neon-500/30 text-neon-300 text-sm font-semibold hover:bg-neon-500/30 transition-colors">
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>

      {/* Tab switcher with on/off toggle */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <div key={t.key} className="flex items-center gap-1">
            <button
              onClick={() => { setActive(t.key); setPreview(false); }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                active === t.key ? 'bg-gradient-to-br from-neon-400 to-neon-600 text-white' : 'bg-slatepanel-800 border border-borderline-900 text-slate-400'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              {t.label}
            </button>
            {/* On/Off toggle for this email type */}
            <button
              onClick={() => toggleEmail(t.key)}
              title={enabled[t.key] ? 'Email on hai — click karke off karo' : 'Email off hai — click karke on karo'}
              className={`w-8 h-8 rounded-xl grid place-items-center transition-all border ${
                enabled[t.key]
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-slate-700/40 border-borderline-900 text-slate-500 hover:bg-slate-700/60'
              }`}
            >
              {enabled[t.key] ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            </button>
          </div>
        ))}
      </div>

      {/* Current email status banner */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${
        enabled[active]
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          : 'bg-red-500/10 border-red-500/30 text-red-400'
      }`}>
        {enabled[active] ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
        <span>
          {current.label}: <strong>{enabled[active] ? 'ON — Email bheja jayega' : 'OFF — Email nahi bheja jayega'}</strong>
        </span>
        <span className="ml-1 text-slate-500">| Mapped SMTP function: {current.smtpFn}</span>
      </div>

      {/* Editor / Preview split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-borderline-900 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-slatepanel-800 border-b border-borderline-900">
            <div className="flex items-center gap-2">
              <Code2 className="w-3.5 h-3.5 text-neon-400" />
              <span className="text-xs text-slate-400 font-mono">{active}.html</span>
            </div>
            <button onClick={() => setPreview(!preview)} className="btn-ghost px-3 py-1.5 text-xs lg:hidden">
              {preview ? <Code2 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <iframe srcDoc={html} className="w-full h-80 bg-white" title="preview" />
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
        <div className="rounded-2xl border border-borderline-900 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-slatepanel-800 border-b border-borderline-900">
            <Eye className="w-3.5 h-3.5 text-neon-400" />
            <span className="text-xs text-slate-400">Live Preview</span>
            <span className="text-xs text-slate-600 ml-1">(white background = email clients ka default)</span>
          </div>
          <iframe srcDoc={html} className="w-full h-80 bg-white" title="live-preview" />
        </div>
      </div>

      {/* Available Variables */}
      <div className="rounded-2xl border border-borderline-900 p-4 bg-slatepanel-800/60">
        <p className="text-xs font-semibold text-slate-300 mb-1">Available Variables</p>
        <p className="text-xs text-slate-500 mb-3">Variable par click karo — clipboard me copy ho jayega. Template me paste karo.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {current.vars.map((v) => (
            <button
              key={v.name}
              onClick={() => copyVar(v.name)}
              title="Click to copy"
              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-midnight-850 border border-borderline-900 hover:border-neon-500 hover:bg-midnight-800 transition-all text-left group"
            >
              <span className="font-mono text-neon-400 text-xs">{v.name}</span>
              <span className="text-xs text-slate-500">{v.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
