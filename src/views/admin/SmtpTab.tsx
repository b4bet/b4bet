import { useState, useEffect } from 'react';
import { cms } from '../../lib/cms';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Server, Send, Loader2, CheckCircle2, Save, XCircle } from 'lucide-react';
import PasswordInput from '../../components/PasswordInput';

async function loadSmtpFromSupabase() {
  const { data } = await supabase.rpc('admin_get_settings');
  if (!data) return null;
  const rows = data as Array<{ key: string; value: unknown }>;
  const find = (k: string) => rows.find(r => r.key === k)?.value;
  return {
    host: (find('smtp_host') as string) || '',
    port: (find('smtp_port') as string) || '587',
    user: (find('smtp_user') as string) || '',
    pass: (find('smtp_pass') as string) || '',
    tls: find('smtp_tls') !== false,
    active: find('smtp_active') === true,
  };
}

async function saveSmtpToSupabase(cfg: { host: string; port: string; user: string; pass: string; tls: boolean; active: boolean }) {
  const pairs = [
    { key: 'smtp_host', value: cfg.host },
    { key: 'smtp_port', value: cfg.port },
    { key: 'smtp_user', value: cfg.user },
    { key: 'smtp_pass', value: cfg.pass },
    { key: 'smtp_tls', value: cfg.tls },
    { key: 'smtp_active', value: cfg.active },
  ];
  for (const { key, value } of pairs) {
    await supabase.rpc('admin_update_setting', { p_key: key, p_value: value }).catch(() => {});
  }
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
  const [tls, setTls] = useState(true);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Test email state
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    loadSmtpFromSupabase().then(cfg => {
      if (cfg) {
        setHost(cfg.host || cms.smtpConfig.host);
        setPort(cfg.port || cms.smtpConfig.port);
        setUser(cfg.user || cms.smtpConfig.user);
        setPass(cfg.pass || cms.smtpConfig.pass);
        setTls(cfg.tls);
        setActive(cfg.active);
        cms.setSmtpConfig(cfg);
      } else {
        setHost(cms.smtpConfig.host);
        setPort(cms.smtpConfig.port);
        setUser(cms.smtpConfig.user);
        setPass(cms.smtpConfig.pass);
        setTls(cms.smtpConfig.tls);
        setActive(cms.smtpConfig.active);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const cfg = { host, port, user, pass, tls, active };
    cms.setSmtpConfig(cfg);
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
      // Get Supabase URL for edge function
      const supabaseUrl = (supabase as unknown as { supabaseUrl: string }).supabaseUrl
        || import.meta.env.VITE_SUPABASE_URL
        || '';
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

      const res = await fetch(`${supabaseUrl}/functions/v1/send-smtp-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          to: testEmail.trim(),
          smtpConfig: { host, port, user, pass, tls },
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
          active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-700 text-slate-400'
        }`}>
          {active ? 'Active' : 'Disabled'}
        </span>
      </div>

      {/* Settings card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 md:col-span-1">
            <Field label="SMTP Host">
              <input value={host} onChange={e => setHost(e.target.value)}
                placeholder="smtp.example.com"
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
            <Field label="Username / Email">
              <input value={user} onChange={e => setUser(e.target.value)}
                placeholder="noreply@example.com"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-violet-500 transition" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Password">
              <PasswordInput value={pass} onChange={v => setPass(v)} className="mt-0" />
            </Field>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-6 pt-1">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <button onClick={() => setTls(v => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors ${tls ? 'bg-emerald-500' : 'bg-slate-700'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${tls ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-xs text-slate-300">TLS Encryption</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <button onClick={async () => {
              const next = !active;
              setActive(next);
              cms.setSmtpConfig({ active: next });
              await supabase.rpc('admin_update_setting', { p_key: 'smtp_active', p_value: next }).catch(() => {});
            }}
              className={`relative w-9 h-5 rounded-full transition-colors ${active ? 'bg-violet-500' : 'bg-slate-700'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${active ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-xs text-slate-300">Enable SMTP</span>
          </label>
        </div>

        {/* Save button */}
        <button onClick={() => void handleSave()} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition disabled:opacity-60">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save Settings'}
          {saved && <span className="text-emerald-300">✓ Saved</span>}
        </button>
      </div>

      {/* Test email card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-white">Send Test Email</h3>
        </div>
        <p className="text-xs text-slate-500">
          Settings ko pehle save karo, phir neeche email address daalke real test bhejo.
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
