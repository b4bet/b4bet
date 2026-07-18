import { useState, useEffect } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { Save, Zap, AlertCircle } from 'lucide-react';

interface GatewayConfig {
  name: string; label: string; enabled: boolean;
  api_key: string; webhook_secret: string; endpoint: string;
  min_amount: number; max_amount: number;
}

const DEFAULT_GATEWAYS: GatewayConfig[] = [
  { name: 'cashfree', label: 'Cashfree', enabled: false, api_key: '', webhook_secret: '', endpoint: 'https://api.cashfree.com/pg', min_amount: 100, max_amount: 100000 },
  { name: 'razorpay', label: 'Razorpay', enabled: false, api_key: '', webhook_secret: '', endpoint: 'https://api.razorpay.com/v1', min_amount: 100, max_amount: 200000 },
  { name: 'payu', label: 'PayU', enabled: false, api_key: '', webhook_secret: '', endpoint: 'https://info.payu.in/merchant/postservice', min_amount: 100, max_amount: 500000 },
  { name: 'phonepe', label: 'PhonePe', enabled: false, api_key: '', webhook_secret: '', endpoint: 'https://api.phonepe.com/apis/hermes', min_amount: 100, max_amount: 100000 },
];

export default function AutoGatewaysTab() {
  const [gateways, setGateways] = useState<GatewayConfig[]>(DEFAULT_GATEWAYS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    const { data } = await supabase.rpc('admin_get_settings');
    const settings = (data ?? []) as { key: string; value: unknown }[];
    const gwSetting = settings.find(s => s.key === 'payment_gateways');
    if (gwSetting && gwSetting.value) {
      const saved = gwSetting.value as GatewayConfig[];
      setGateways(DEFAULT_GATEWAYS.map(d => saved.find(s => s.name === d.name) ?? d));
    }
  }

  async function saveConfig() {
    setSaving(true);
    await supabase.rpc('admin_update_setting', {
      p_key: 'payment_gateways',
      p_value: gateways as unknown as Record<string, unknown>,
    });
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  }

  function update(name: string, patch: Partial<GatewayConfig>) {
    setGateways(gs => gs.map(g => g.name === name ? { ...g, ...patch } : g));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-neon-400" />
        <h2 className="text-lg font-bold">Auto Payment Gateways</h2>
      </div>
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
        <p className="text-amber-300 text-sm">API keys are stored in database. For production, use Supabase Vault or environment secrets.</p>
      </div>
      <div className="space-y-4">
        {gateways.map(g => (
          <div key={g.name} className="bg-slatepanel-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white">{g.label}</h3>
              <button onClick={() => update(g.name, { enabled: !g.enabled })}
                className={`w-12 h-6 rounded-full transition ${
                  g.enabled ? 'bg-neon-500' : 'bg-slatepanel-600'
                }`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  g.enabled ? 'translate-x-7' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            {g.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { key: 'api_key', label: 'API Key' },
                  { key: 'webhook_secret', label: 'Webhook Secret' },
                  { key: 'endpoint', label: 'Endpoint URL' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-slate-400 mb-1 block">{f.label}</label>
                    <input
                      value={(g as unknown as Record<string, string>)[f.key]}
                      onChange={e => update(g.name, { [f.key]: e.target.value } as Partial<GatewayConfig>)}
                      type={f.key.includes('secret') || f.key === 'api_key' ? 'password' : 'text'}
                      className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-500"
                    />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Min Amount (₹)</label>
                  <input type="number" value={g.min_amount / 100} onChange={e => update(g.name, { min_amount: Number(e.target.value) * 100 })}
                    className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Max Amount (₹)</label>
                  <input type="number" value={g.max_amount / 100} onChange={e => update(g.name, { max_amount: Number(e.target.value) * 100 })}
                    className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={saveConfig} disabled={saving}
        className="flex items-center gap-2 px-6 py-3 bg-neon-500 hover:bg-neon-400 text-black font-bold rounded-xl transition disabled:opacity-50">
        <Save className="w-4 h-4" />
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save All Gateways'}
      </button>
    </div>
  );
}
