import { useState, useEffect } from 'react';
import { Users, TrendingUp, IndianRupee, Save } from 'lucide-react';
import { supabaseGetSettings, supabaseUpdateSetting } from '../../lib/supabaseIntegration';

interface StatsConfig {
  onlineMin: number;
  onlineMax: number;
  topWin: number;
  paidOut: number;
}

export default function StatsSettingsTab() {
  const [config, setConfig] = useState<StatsConfig>({
    onlineMin: 120,
    onlineMax: 350,
    topWin: 144.5,
    paidOut: 8500000,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabaseGetSettings().then((settings) => {
      const statsRow = settings.find((s) => s.key === 'home_stats');
      if (statsRow && statsRow.value) {
        try {
          const parsed = typeof statsRow.value === 'string'
            ? JSON.parse(statsRow.value)
            : statsRow.value;
          setConfig((prev) => ({ ...prev, ...parsed }));
        } catch { /* use defaults */ }
      }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabaseUpdateSetting('home_stats', JSON.stringify(config));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error('Failed to save stats settings', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-5 max-w-lg">
      <div>
        <h2 className="text-lg font-bold text-white">Home Stats Settings</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Control the numbers shown in the "Online / Top Win / Paid Out" strip on the home screen.
        </p>
      </div>

      {/* Online Users */}
      <div className="bg-slatepanel-900 border border-borderline-900 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Users className="w-4 h-4 text-emerald-400" />
          Online Users (random range)
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Min</label>
            <input
              type="number"
              value={config.onlineMin}
              onChange={(e) => setConfig((c) => ({ ...c, onlineMin: Number(e.target.value) }))}
              className="input w-full"
              min={0}
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Max</label>
            <input
              type="number"
              value={config.onlineMax}
              onChange={(e) => setConfig((c) => ({ ...c, onlineMax: Number(e.target.value) }))}
              className="input w-full"
              min={0}
            />
          </div>
        </div>
        <p className="text-[10px] text-slate-500">
          A random number between Min and Max will show as "Online" on the home screen.
        </p>
      </div>

      {/* Top Win */}
      <div className="bg-slatepanel-900 border border-borderline-900 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <TrendingUp className="w-4 h-4 text-neon-400" />
          Top Win Multiplier
        </div>
        <input
          type="number"
          step="0.1"
          value={config.topWin}
          onChange={(e) => setConfig((c) => ({ ...c, topWin: Number(e.target.value) }))}
          className="input w-full"
          min={0}
        />
        <p className="text-[10px] text-slate-500">Shown as "{config.topWin.toFixed(1)}x" on home screen.</p>
      </div>

      {/* Paid Out */}
      <div className="bg-slatepanel-900 border border-borderline-900 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <IndianRupee className="w-4 h-4 text-amber-400" />
          Total Paid Out (₹)
        </div>
        <input
          type="number"
          value={config.paidOut}
          onChange={(e) => setConfig((c) => ({ ...c, paidOut: Number(e.target.value) }))}
          className="input w-full"
          min={0}
        />
        <p className="text-[10px] text-slate-500">
          Displayed as "₹{(config.paidOut / 100000).toFixed(1)}M" on home screen.
        </p>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm font-bold"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
      </button>
    </div>
  );
}
