import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string;
  secure: boolean;
  enabled: boolean;
}

const DEFAULT: SmtpSettings = {
  host: '', port: 587, user: '', pass: '',
  from: '', fromName: 'B4BeT', secure: true, enabled: false,
};

export default function SmtpTab() {
  const [cfg, setCfg] = useState<SmtpSettings>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Load on mount
  useEffect(() => {
    supabase.rpc('admin_get_settings').then(({ data }) => {
      if (!data) return;
      const rows = data as Array<{ key: string; value: unknown }>;
      const blob = rows.find(r => r.key === 'smtp_settings')?.value as Partial<SmtpSettings> | undefined;
      if (blob && typeof blob === 'object') {
        setCfg(prev => ({
          ...prev,
          host: (blob.host as string) || prev.host,
          port: Number(blob.port) || prev.port,
          user: (blob.user as string) || prev.user,
          pass: (blob.pass as string) || prev.pass,
          from: (blob.from as string) || prev.from,
          fromName: (blob.fromName as string) || prev.fromName,
          secure: typeof blob.secure === 'boolean' ? blob.secure : prev.secure,
          enabled: typeof blob.enabled === 'boolean' ? blob.enabled : prev.enabled,
        }));
      }
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const { error } = await supabase.rpc('admin_update_setting', {
      p_key: 'smtp_settings',
      p_value: cfg as unknown as string,
    });
    setSaving(false);
    if (error) {
      setMsg({ ok: false, text: 'Save failed: ' + error.message });
    } else {
      setMsg({ ok: true, text: 'SMTP settings saved!' });
    }
  };

  const sendTest = async () => {
    if (!testEmail) return;
    setTesting(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-smtp-test', {
        body: {
          to: testEmail,
          smtp: { host: cfg.host, port: cfg.port, user: cfg.user, pass: cfg.pass, secure: cfg.secure },
        },
      });
      if (error || (data && !data.ok)) {
        setMsg({ ok: false, text: 'Test failed: ' + (error?.message || data?.error || 'Unknown error') });
      } else {
        setMsg({ ok: true, text: `Test email sent to ${testEmail}` });
      }
    } catch (e) {
      setMsg({ ok: false, text: 'Test failed: ' + String(e) });
    }
    setTesting(false);
  };

  const field = (label: string, value: string, onChange: (v: string) => void, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', marginBottom: 4, color: '#a0aec0', fontSize: 13 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '8px 12px', background: '#1a1f35', border: '1px solid #2d3a5a',
          borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  );

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <h2 style={{ color: '#00ff88', marginBottom: 4 }}>SMTP Settings</h2>
      <p style={{ color: '#a0aec0', fontSize: 13, marginBottom: 24 }}>
        Configure outgoing email. All transactional emails (deposit, withdrawal, welcome) use this.
      </p>

      {field('SMTP Host', cfg.host, v => setCfg(p => ({ ...p, host: v })), 'text', 'smtp.gmail.com')}

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', marginBottom: 4, color: '#a0aec0', fontSize: 13 }}>Port</label>
        <input
          type="number"
          value={cfg.port}
          onChange={e => setCfg(p => ({ ...p, port: Number(e.target.value) }))}
          style={{ width: '100%', padding: '8px 12px', background: '#1a1f35', border: '1px solid #2d3a5a', borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {field('Username / Email', cfg.user, v => setCfg(p => ({ ...p, user: v })), 'text', 'you@gmail.com')}
      {field('Password / App Password', cfg.pass, v => setCfg(p => ({ ...p, pass: v })), 'password', '••••••••')}
      {field('From Address', cfg.from, v => setCfg(p => ({ ...p, from: v })), 'text', 'noreply@b4bet.com')}
      {field('From Name', cfg.fromName, v => setCfg(p => ({ ...p, fromName: v })), 'text', 'B4BeT')}

      <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a0aec0', fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={cfg.secure} onChange={e => setCfg(p => ({ ...p, secure: e.target.checked }))} />
          TLS / SSL
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a0aec0', fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg(p => ({ ...p, enabled: e.target.checked }))} />
          Enable SMTP
        </label>
      </div>

      <button
        onClick={save}
        disabled={saving}
        style={{ padding: '10px 28px', background: '#00ff88', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
      >
        {saving ? 'Saving…' : 'Save Settings'}
      </button>

      <hr style={{ margin: '28px 0', borderColor: '#2d3a5a' }} />

      <h3 style={{ color: '#fff', marginBottom: 12 }}>Send Test Email</h3>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <input
          type="email"
          value={testEmail}
          onChange={e => setTestEmail(e.target.value)}
          placeholder="test@example.com"
          style={{ flex: 1, padding: '8px 12px', background: '#1a1f35', border: '1px solid #2d3a5a', borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none' }}
        />
        <button
          onClick={sendTest}
          disabled={testing || !testEmail || !cfg.host}
          style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: (testing || !testEmail || !cfg.host) ? 'not-allowed' : 'pointer', opacity: (testing || !testEmail || !cfg.host) ? 0.6 : 1 }}
        >
          {testing ? 'Sending…' : 'Send Test'}
        </button>
      </div>

      {msg && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: msg.ok ? '#0d2e1a' : '#2e0d0d', border: `1px solid ${msg.ok ? '#00ff88' : '#ff5a5a'}`, color: msg.ok ? '#00ff88' : '#ff5a5a', fontSize: 14 }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
