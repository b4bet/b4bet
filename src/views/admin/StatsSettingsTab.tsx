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
      if (statsRow?.value) {
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

  // Ensure min never exceeds max
  const setOnlineMin = (v: number) => setConfig((c) => ({ ...c, onlineMin: Math.min(v, c.onlineMax - 1) }));
  const setOnlineMax = (v: number) => setConfig((c) => ({ ...c, onlineMax: Math.max(v, c.onlineMin + 1) }));

  return (
    <div className="p-4 space-y-5 max-w-lg">
      <div>
        <h2 className="text-lg font-bold text-white">Home Stats Settings</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Control the numbers shown in the "Online / Top Win / Paid Out" strip on the home screen.
          Changes are saved to Supabase and go live instantly.
        </p>
      </div>

      {/* ── Online Users ─────────────────────────────────────────────── */}
      <div className="bg-slatepanel-900 border border-borderline-900 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Users className="w-4 h-4 text-emerald-400" />
          Online Users (random range)
        </div>

        {/* Live preview */}
        <div className="flex items-center justify-center gap-3 py-2">
          <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Min</p>
            <p className="text-2xl font-black text-emerald-400 tabular-nums">{config.onlineMin.toLocaleString()}</p>
          </div>
          <div className="flex-1 h-px bg-borderline-900" />
          <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Max</p>
            <p className="text-2xl font-black text-neon-400 tabular-nums">{config.onlineMax.toLocaleString()}</p>
          </div>
        </div>

        {/* Min slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-slate-400 font-medium">Min Online</label>
            <input
              type="number"
              value={config.onlineMin}
              onChange={(e) => setOnlineMin(Number(e.target.value))}
              className="input w-20 text-right text-xs py-1"
              min={0}
              max={config.onlineMax - 1}
            />
          </div>
          <input
            type="range"
            min={0}
            max={9999}
            step={10}
            value={config.onlineMin}
            onChange={(e) => setOnlineMin(Number(e.target.value))}
            className="w-full accent-emerald-400 h-2"
          />
          <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
            <span>0</span><span>2500</span><span>5000</span><span>7500</span><span>9999</span>
          </div>
        </div>

        {/* Max slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-slate-400 font-medium">Max Online</label>
            <input
              type="number"
              value={config.onlineMax}
              onChange={(e) => setOnlineMax(Number(e.target.value))}
              className="input w-20 text-right text-xs py-1"
              min={config.onlineMin + 1}
              max={99999}
            />
          </div>
          <input
            type="range"
            min={0}
            max={9999}
            step={10}
            value={config.onlineMax}
            onChange={(e) => setOnlineMax(Number(e.target.value))}
            className="w-full accent-neon-400 h-2"
          />
          <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
            <span>0</span><span>2500</span><span>5000</span><span>7500</span><span>9999</span>
          </div>
        </div>

        <p className="text-[10px] text-slate-500">
          Home screen shows a number that automatically fluctuates between{' '}
          <span className="text-emerald-400 font-bold">{config.onlineMin.toLocaleString()}</span> and{' '}
          <span className="text-neon-400 font-bold">{config.onlineMax.toLocaleString()}</span> every few seconds.
        </p>
      </div>

      {/* ── Top Win ──────────────────────────────────────────────────── */}
      <div className="bg-slatepanel-900 border border-borderline-900 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <TrendingUp className="w-4 h-4 text-neon-400" />
          Top Win Multiplier
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={1000}
            step={0.5}
            value={config.topWin}
            onChange={(e) => setConfig((c) => ({ ...c, topWin: Number(e.target.value) }))}
            className="flex-1 accent-neon-400 h-2"
          />
          <input
            type="number"
            step="0.1"
            value={config.topWin}
            onChange={(e) => setConfig((c) => ({ ...c, topWin: Number(e.target.value) }))}
            className="input w-24 text-center"
            min={0}
          />
        </div>
        <p className="text-[10px] text-slate-500">
          Shown as <span className="text-neon-400 font-bold">{config.topWin.toFixed(1)}x</span> on home screen.
        </p>
      </div>

      {/* ── Paid Out ─────────────────────────────────────────────────── */}
      <div className="bg-slatepanel-900 border border-borderline-900 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <IndianRupee className="w-4 h-4 text-amber-400" />
          Total Paid Out (₹)
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100000000}
            step={100000}
            value={config.paidOut}
            onChange={(e) => setConfig((c) => ({ ...c, paidOut: Number(e.target.value) }))}
            className="flex-1 accent-amber-400 h-2"
          />
          <input
            type="number"
            value={config.paidOut}
            onChange={(e) => setConfig((c) => ({ ...c, paidOut: Number(e.target.value) }))}
            className="input w-28 text-center"
            min={0}
          />
        </div>
        <p className="text-[10px] text-slate-500">
          Displayed as{' '}
          <span className="text-amber-400 font-bold">₹{(config.paidOut / 100000).toFixed(1)}M</span>{' '}
          on home screen.
        </p>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm font-bold"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Saving…' : saved ? '✓ Saved to Supabase!' : 'Save Changes'}
      </button>
    </div>
  );
}
