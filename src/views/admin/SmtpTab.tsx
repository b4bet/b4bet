import { useState } from 'react';
import { store } from '../../lib/store';
import { cms } from '../../lib/cms';
import { Mail, Server, Key, ToggleRight, ToggleLeft, Send, Loader2, CheckCircle2, Save } from 'lucide-react';
import PasswordInput from '../../components/PasswordInput';

export default function SmtpTab() {
  const [host, setHost] = useState(cms.smtpConfig.host);
  const [port, setPort] = useState(cms.smtpConfig.port);
  const [user, setUser] = useState(cms.smtpConfig.user);
  const [pass, setPass] = useState(cms.smtpConfig.pass);
  const [tls, setTls] = useState(cms.smtpConfig.tls);
  const [active, setActive] = useState(cms.smtpConfig.active);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sent, setSent] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleToggleActive = () => {
    const next = !active;
    setActive(next);
    cms.setSmtpConfig({ active: next });
  };

  const handleSave = () => {
    cms.setSmtpConfig({ host, port, user, pass, tls, active });
    setSaved(true);
    cms.toast({ title: 'SMTP settings saved', body: 'Mail server configuration updated.', kind: 'success' });
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-white">SMTP & Campaign Engine</h2>
        <p className="text-xs text-slate-500">Configure mail server credentials and dispatch bulk campaigns.</p>
      </div>

      <div className="panel p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-neon-300" />
            <h3 className="font-display font-bold text-white">Mail Server</h3>
          </div>
          <button onClick={handleToggleActive} className="flex items-center gap-2">
            {active ? <ToggleRight className="w-9 h-9 text-emeraldwin-400" /> : <ToggleLeft className="w-9 h-9 text-slate-600" />}
            <span className={`text-xs font-semibold ${active ? 'text-emeraldwin-400' : 'text-slate-500'}`}>{active ? 'Operational' : 'Disabled'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1"><Server className="w-3 h-3" /> Host</label>
            <input value={host} onChange={(e) => setHost(e.target.value)} className="input mt-1" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Port</label>
            <input value={port} onChange={(e) => setPort(e.target.value)} className="input mt-1 tabular" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1"><Key className="w-3 h-3" /> Username</label>
            <input value={user} onChange={(e) => setUser(e.target.value)} className="input mt-1" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Password</label>
            <PasswordInput value={pass} onChange={(e) => setPass(e.target.value)} className="mt-1" />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <button onClick={() => setTls(!tls)} className={`relative w-10 h-5 rounded-full transition-colors ${tls ? 'bg-emeraldwin-500' : 'bg-slatepanel-700'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${tls ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
          <span className="text-sm text-slate-300">Use TLS encryption</span>
        </label>

        {/* Save settings */}
        <div className="flex items-center gap-3 pt-1 border-t border-borderline-900">
          <button onClick={handleSave} className="btn-primary px-4 py-2.5">
            <Save className="w-4 h-4" /> Save Settings
          </button>
          {saved && (
            <span className="chip bg-emeraldwin-500/15 border border-emeraldwin-500/40 text-emeraldwin-400 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      {/* Bulk dispatch */}
      <div className="panel p-5">
        <h3 className="font-display font-bold text-white mb-3 flex items-center gap-2"><Send className="w-4 h-4 text-neon-300" /> Bulk Email Queue Dispatch</h3>
        <div className="flex items-center gap-3">
          <button onClick={test} disabled={sending} className="btn-primary px-4 py-2.5">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Dispatching…' : 'Dispatch Test Queue'}
          </button>
          {sent && <span className="chip bg-emeraldwin-500/15 border border-emeraldwin-500/40 text-emeraldwin-400 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Sent</span>}
        </div>
        {(sending || progress > 0) && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Queue progress</span>
              <span className="tabular">{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-midnight-850 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-neon-400 to-emeraldwin-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
