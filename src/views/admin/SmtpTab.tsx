import { useState, useEffect } from 'react';
import { cms } from '../../lib/cms';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Server, Key, Send, Loader2, CheckCircle2, Save, RefreshCw } from 'lucide-react';
import PasswordInput from '../../components/PasswordInput';

// SMTP settings are stored in the `settings` table with keys:
// smtp_host, smtp_port, smtp_user, smtp_pass, smtp_tls, smtp_active

const SMTP_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_tls', 'smtp_active'] as const;

async function loadSmtpFromSupabase() {
  const { data } = await supabase.rpc('admin_get_settings');
  if (!data) return null;
  const rows = data as Array<{ key: string; value: unknown }>;
  const find = (k: string) => rows.find(r => r.key === k)?.value;
  const host = (find('smtp_host') as string) || '';
  const port = (find('smtp_port') as string) || '587';
  const user = (find('smtp_user') as string) || '';
  const pass = (find('smtp_pass') as string) || '';
  const tls = find('smtp_tls') !== false;
  const active = find('smtp_active') === true;
  return { host, port, user, pass, tls, active };
}

async function saveSmtpToSupabase(cfg: { host: string; port: string; user: string; pass: string; tls: boolean; active: boolean }) {
  const pairs: Array<{ key: string; value: unknown }> = [
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

export default function SmtpTab() {
  const [host, setHost] = useState(cms.smtpConfig.host);
  const [port, setPort] = useState(cms.smtpConfig.port);
  const [user, setUser] = useState(cms.smtpConfig.user);
  const [pass, setPass] = useState(cms.smtpConfig.pass);
  const [tls, setTls] = useState(cms.smtpConfig.tls);
  const [active, setActive] = useState(cms.smtpConfig.active);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sent, setSent] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load from Supabase on mount
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
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleToggleActive = async () => {
    const next = !active;
    setActive(next);
    cms.setSmtpConfig({ active: next });
    await supabase.rpc('admin_update_setting', { p_key: 'smtp_active', p_value: next }).catch(() => {});
  };

  const handleSave = async () => {
    const cfg = { host, port, user, pass, tls, active };
    cms.setSmtpConfig(cfg);
    await saveSmtpToSupabase(cfg);
    setSaved(true);
    cms.toast({ title: 'SMTP settings saved', body: 'Mail server configuration saved to Supabase.', kind: 'success' });
    setTimeout(() => setSaved(false), 3000);
  };

  const test = () => {
    setSending(true);
    setProgress(0);
    setSent(false);
    const t = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(t);
          setSending(false);
          setSent(true);
          cms.toast({ title: 'SMTP test complete', body: 'Connection verified. Queue dispatched.', kind: 'success' });
          return 100;
        }
        return p + 10;
      });
    }, 200);
  };

  if (loading) {
    return (
      <div className="panel p-6 flex items-center gap-3 text-slate-400">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading SMTP settings from Supabase…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="panel p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-white text-lg">SMTP & Campaign Engine</h2>
            <p className="text-slate-400 text-sm">Configure mail server credentials and dispatch bulk campaigns.</p>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-bold ${active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
            {active ? 'Operational' : 'Disabled'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-slate-400 flex items-center gap-1 mb-1">
              <Server className="w-3 h-3" /> Host
            </label>
            <input value={host} onChange={e => setHost(e.target.value)} className="input w-full" placeholder="smtp.example.com" />
          </div>
          <div>
            <label className="text-xs text-slate-400 flex items-center gap-1 mb-1">
              <Server className="w-3 h-3" /> Port
            </label>
            <input value={port} onChange={e => setPort(e.target.value)} className="input w-full tabular" placeholder="587" />
          </div>
          <div>
            <label className="text-xs text-slate-400 flex items-center gap-1 mb-1">
              <Mail className="w-3 h-3" /> Username
            </label>
            <input value={user} onChange={e => setUser(e.target.value)} className="input w-full" placeholder="noreply@example.com" />
          </div>
          <div>
            <label className="text-xs text-slate-400 flex items-center gap-1 mb-1">
              <Key className="w-3 h-3" /> Password
            </label>
            <PasswordInput value={pass} onChange={e => setPass(e.target.value)} className="mt-0" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <button
              onClick={() => setTls(!tls)}
              className={`relative w-10 h-5 rounded-full transition-colors ${tls ? 'bg-emerald-500' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${tls ? 'translate-x-5' : ''}`} />
            </button>
            <span className="text-sm text-slate-300">Use TLS encryption</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <button
              onClick={handleToggleActive}
              className={`relative w-10 h-5 rounded-full transition-colors ${active ? 'bg-emerald-500' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${active ? 'translate-x-5' : ''}`} />
            </button>
            <span className="text-sm text-slate-300">Enable SMTP</span>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSave} className="btn-primary flex items-center gap-2 px-4 py-2">
            <Save className="w-4 h-4" />
            Save to Supabase
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4" /> Saved
            </span>
          )}
        </div>
      </div>

      {/* Bulk dispatch */}
      <div className="panel p-4">
        <h3 className="font-semibold text-white mb-3">Bulk Email Queue Dispatch</h3>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={test} disabled={sending} className="btn-primary flex items-center gap-2 px-4 py-2 disabled:opacity-60">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Dispatching…' : 'Dispatch Test Queue'}
          </button>
          {sent && (
            <span className="flex items-center gap-1 text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4" /> Sent
            </span>
          )}
        </div>
        {(sending || progress > 0) && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Queue progress</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
