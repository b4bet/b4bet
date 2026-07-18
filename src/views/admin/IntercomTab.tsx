import { useState, useEffect } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { MessageSquare, Save } from 'lucide-react';

export default function IntercomTab() {
  const [appId, setAppId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.rpc('admin_get_settings').then(({ data }) => {
      const settings = (data ?? []) as { key: string; value: unknown }[];
      const s = settings.find(s => s.key === 'intercom_config');
      if (s && s.value) {
        const v = s.value as { app_id?: string; enabled?: boolean };
        setAppId(v.app_id ?? '');
        setEnabled(v.enabled ?? false);
      }
    });
  }, []);

  async function save() {
    setSaving(true);
    await supabase.rpc('admin_update_setting', {
      p_key: 'intercom_config',
      p_value: { app_id: appId, enabled },
    });
    setSaved(true); setSaving(false);
    setTimeout(() => setSaved(false), 2000);
    // Inject Intercom if enabled
    if (enabled && appId) {
      (window as Window & { Intercom?: (cmd: string, opts?: Record<string, unknown>) => void }).Intercom?.('boot', { app_id: appId });
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-neon-400" />
        <h2 className="text-lg font-bold">Intercom Integration</h2>
      </div>
      <div className="bg-slatepanel-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold">Enable Intercom</span>
          <button onClick={() => setEnabled(e => !e)}
            className={`w-12 h-6 rounded-full transition ${
              enabled ? 'bg-neon-500' : 'bg-slatepanel-600'
            }`}>
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
              enabled ? 'translate-x-7' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Intercom App ID</label>
          <input value={appId} onChange={e => setAppId(e.target.value)}
            placeholder="e.g. abc12345"
            className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neon-500" />
          <p className="text-slate-500 text-xs mt-1">Find your App ID in Intercom Settings → Installation → Web</p>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-neon-500/20 hover:bg-neon-500/30 text-neon-400 rounded-xl text-sm transition">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
      <div className="bg-slatepanel-800 rounded-2xl p-5 space-y-2">
        <h3 className="font-semibold text-slate-300 text-sm">How to embed Intercom</h3>
        <ol className="text-slate-400 text-sm space-y-2 list-decimal list-inside">
          <li>Create account at intercom.com</li>
          <li>Go to Settings → Installation → Web</li>
          <li>Copy your App ID and paste above</li>
          <li>Enable and save — Intercom chat widget will appear for users</li>
        </ol>
      </div>
    </div>
  );
}
