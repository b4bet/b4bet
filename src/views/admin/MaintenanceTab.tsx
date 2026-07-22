import { useState, useEffect } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { ShieldAlert, Save, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface MaintenanceConfig {
  enabled: boolean;
  title: string;
  message: string;
  estimated_time: string;
}

const DEFAULT_CONFIG: MaintenanceConfig = {
  enabled: false,
  title: 'Under Maintenance',
  message: 'We are currently performing scheduled maintenance. We will be back shortly. Thank you for your patience!',
  estimated_time: '',
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function MaintenanceTab() {
  const [config, setConfig] = useState<MaintenanceConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'maintenance_mode')
        .single();
      if (data?.value) {
        const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        setConfig({ ...DEFAULT_CONFIG, ...val });
      }
    } catch (e) {
      console.error('MaintenanceTab load error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaveStatus('saving');
    setErrorMsg('');
    try {
      const { error } = await supabase.rpc('admin_update_setting', {
        p_key: 'maintenance_mode',
        p_value: config as unknown as Record<string, unknown>,
      });
      if (error) throw new Error(error.message);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Save failed');
      setSaveStatus('error');
    }
  }

  function update(patch: Partial<MaintenanceConfig>) {
    setConfig(c => ({ ...c, ...patch }));
    if (saveStatus !== 'idle') setSaveStatus('idle');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-5 h-5 text-amber-400" />
        <h2 className="text-lg font-bold text-white">Maintenance Mode</h2>
        <button
          onClick={() => { void load(); }}
          className="ml-auto p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition"
        >
          <RefreshCw className="w-4 h-4 text-slate-300" />
        </button>
      </div>

      {/* Main toggle card */}
      <div className={`rounded-2xl p-5 border transition-all ${
        config.enabled
          ? 'bg-amber-500/10 border-amber-500/40'
          : 'bg-slate-800/50 border-slate-700'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white text-base">
              {config.enabled ? '🔴 Maintenance Mode is ON' : '🟢 Maintenance Mode is OFF'}
            </h3>
            <p className="text-slate-400 text-sm mt-0.5">
              {config.enabled
                ? 'All non-admin users are seeing the maintenance page right now.'
                : 'Site is live and accessible to all users.'}
            </p>
          </div>
          <button
            onClick={() => update({ enabled: !config.enabled })}
            className={`w-14 h-7 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
              config.enabled ? 'bg-amber-500' : 'bg-slate-600'
            }`}
          >
            <div className={`w-6 h-6 bg-white rounded-full shadow transition-transform mt-0.5 ${
              config.enabled ? 'translate-x-7' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* Customize message */}
      <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700 space-y-4">
        <h3 className="font-semibold text-white text-sm">Customize Maintenance Page</h3>

        <div className="space-y-1">
          <label className="text-xs text-slate-400 block">Page Title</label>
          <input
            value={config.title}
            onChange={e => update({ title: e.target.value })}
            placeholder="Under Maintenance"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-400/60"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400 block">Message to Users</label>
          <textarea
            value={config.message}
            onChange={e => update({ message: e.target.value })}
            rows={3}
            placeholder="We are currently performing maintenance..."
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-400/60 resize-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400 block">Estimated Time (optional)</label>
          <input
            value={config.estimated_time}
            onChange={e => update({ estimated_time: e.target.value })}
            placeholder="e.g. 2 hours, 30 minutes, 11:00 PM IST"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-400/60"
          />
          <p className="text-[11px] text-slate-500">Leave blank to not show estimated time on the maintenance page.</p>
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center justify-between">
        <div className="text-xs min-h-[1.25rem]">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved to Supabase
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-red-400">
              <AlertCircle className="w-3.5 h-3.5" /> {errorMsg}
            </span>
          )}
        </div>
        <button
          onClick={() => { void save(); }}
          disabled={saveStatus === 'saving'}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition cursor-pointer"
        >
          {saveStatus === 'saving'
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            : <><Save className="w-4 h-4" /> Save Changes</>}
        </button>
      </div>

      {/* Info box */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-sm text-blue-300">
        <strong className="text-blue-200">How it works:</strong> When maintenance mode is ON, all regular users
        see a maintenance page instead of the app. Admin staff who are logged into the admin panel
        can still access everything normally. Changes take effect immediately after saving.
      </div>
    </div>
  );
}
