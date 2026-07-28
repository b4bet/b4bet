import { useState, useEffect } from 'react';
import { cms } from '../../lib/cms';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Server, Send, Loader2, CheckCircle2, Save, XCircle } from 'lucide-react';
import PasswordInput from '../../components/PasswordInput';

interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  from: string;
  fromName: string;
  enabled: boolean;
}

const DEFAULT_SMTP: SmtpSettings = {
  host: '',
  port: 587,
  user: '',
  pass: '',
  secure: false,
  from: '',
  fromName: 'B4BeT',
  enabled: false,
};

async function loadSmtpFromSupabase(): Promise<SmtpSettings | null> {
  const { data } = await supabase.rpc('admin_get_settings');
  if (!data) return null;
  const rows = data as Array<{ key: string; value: unknown }>;
  const row = rows.find(r => r.key === 'smtp_settings');
  if (!row?.value) return null;
  const v = row.value as Partial<SmtpSettings>;
  return {
    host: v.host ?? '',
    port: typeof v.port === 'number' ? v.port : 587,
    user: v.user ?? '',
    pass: v.pass ?? '',
    secure: v.secure ?? false,
    from: v.from ?? '',
    fromName: v.fromName ?? 'B4BeT',
    enabled: v.enabled ?? false,
  };
}

async function saveSmtpToSupabase(cfg: SmtpSettings) {
  await supabase
    .rpc('admin_update_setting', { p_key: 'smtp_settings', p_value: cfg })
    .catch(() => {});
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-slate-400 font-medium">{label}</label>
      {children}
    </div>
  );
}

export default function SmtpTab() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [from, setFrom] = useState('');
  const [fromName, setFromName] = useState('B4BeT');
  const [secure, setSecure] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Test email state
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    loadSmtpFromSupabase()
      .then(cfg => {
        const c = cfg ?? DEFAULT_SMTP;
        setHost(c.host);
        setPort(String(c.port));
        setUser(c.user);
        setPass(c.pass);
        setFrom(c.from);
        setFromName(c.fromName);
        setSecure(c.secure);
        setEnabled(c.enabled);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const buildCfg = (): SmtpSettings => ({
    host,
    port: parseInt(port, 10) || 587,
    user,
    pass,
    from: from || user,
    fromName,
    secure,
    enabled,
  });

  const handleSave = async () => {
    setSaving(true);
    const cfg = buildCfg();
    cms.setSmtpConfig({ host, port, user, pass, tls: secure, active: enabled });
    await saveSmtpToSupabase(cfg);
    setSaving(false);
    setSaved(true);
    cms.toast({ title: 'SMTP saved', body: 'Mail server settings saved.', kind: 'success' });
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTest = async () => {
    if (!testEmail.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string || '';
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string || '';

      const res = await fetch(`${supabaseUrl}/functions/v1/send-smtp-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          to: testEmail.trim(),
          smtpConfig: buildCfg(),
        }),
      });
      const json = await res.json() as { ok: boolean; message?: string; error?: string };
      if (json.ok) {
        setTestResult({ ok: true, message: json.message ?? `Email sent to ${testEmail}` });
        cms.toast({ title: 'Test email sent!', body: json.message ?? '', kind: 'success' });
      } else {
        setTestResult({ ok: false, message: json.error ?? 'Unknown error' });
        cms.toast({ title: 'SMTP test failed', body: json.error ?? '', kind: 'alert' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult({ ok: false, message: msg });
      cms.toast({ title: 'SMTP test failed', body: msg, kind: 'alert' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 gap-3 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading SMTP settings…</span>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 grid place-items-center">
            <Server className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">SMTP Configuration</h2>
            <p className="text-xs text-slate-500">Outbound mail server settings</p>
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
          enabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-700 text-slate-400'
        }`}>
          {enabled ? 'Active' : 'Disabled'}
        </span>
      </div>

      {/* Settings card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 md:col-span-1">
            <Field label="SMTP Host">
              <input value={host} onChange={e => setHost(e.target.value)}
                placeholder="smtp.gmail.com"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-violet-500 transition" />
            </Field>
          </div>
          <div className="col-span-2 md:col-span-1">
            <Field label="Port">
              <input value={port} onChange={e => setPort(e.target.value)}
                placeholder="587"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-violet-500 transition" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Username / Email (SMTP Login)">
              <input value={user} onChange={e => setUser(e.target.value)}
                placeholder="noreply@example.com"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-violet-500 transition" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Password / App Password">
              <PasswordInput value={pass} onChange={v => setPass(v)} className="mt-0" />
            </Field>
          </div>
          <div className="col-span-2 md:col-span-1">
            <Field label="From Email (sender address)">
              <input value={from} onChange={e => setFrom(e.target.value)}
                placeholder="noreply@example.com"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-violet-500 transition" />
            </Field>
          </div>
          <div className="col-span-2 md:col-span-1">
            <Field label="From Name">
              <input value={fromName} onChange={e => setFromName(e.target.value)}
                placeholder="B4BeT"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-violet-500 transition" />
            </Field>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-6 pt-1">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <button onClick={() => setSecure(v => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors ${secure ? 'bg-emerald-500' : 'bg-slate-700'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${secure ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-xs text-slate-300">TLS/SSL Encryption</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <button onClick={() => setEnabled(v => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors ${enabled ? 'bg-violet-500' : 'bg-slate-700'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-xs text-slate-300">Enable SMTP</span>
          </label>
        </div>

        {/* Save button */}
        <button onClick={() => void handleSave()} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition disabled:opacity-60">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save Settings'}
          {saved && <span className="text-emerald-300 ml-1">✓ Saved</span>}
        </button>
      </div>

      {/* Test email card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-white">Send Test Email</h3>
        </div>
        <p className="text-xs text-slate-500">
          Pehle settings save karo, phir test email bhejo to verify SMTP is working.
        </p>
        <div className="flex gap-2">
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="test@example.com"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-violet-500 transition"
          />
          <button
            onClick={() => void handleTest()}
            disabled={testing || !testEmail.trim() || !host || !user || !pass}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition disabled:opacity-50">
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {testing ? 'Sending…' : 'Send Test'}
          </button>
        </div>

        {/* Result */}
        {testResult && (
          <div className={`flex items-start gap-2.5 p-3 rounded-lg text-xs ${
            testResult.ok
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
              : 'bg-red-500/10 border border-red-500/20 text-red-300'
          }`}>
            {testResult.ok
              ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            <span>{testResult.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
