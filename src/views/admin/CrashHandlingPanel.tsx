import { useState, useEffect } from 'react';
import { Shield, Sliders, Target, Cpu, Zap, Rocket } from 'lucide-react';
import { useAdminConfig } from '../../lib/hooks';
import { store } from '../../lib/store';

/**
 * CrashHandlingPanel — reads/writes crash config via store.setGameHandler('crash', ...)
 *
 * DB structure: admin_config = { crash: { mode, manualCrashPoint, ... }, aviator: {...}, ... }
 * ALL games including crash are nested under their gameKey.
 * store.setGameHandler() patches adminConfig.gameHandlers[gameKey] and persists to Supabase
 * as admin_config[gameKey] — consistent with what the Edge Function reads.
 *
 * DO NOT use store.setAdmin({ mode, manualCrashPoint }) for crash — that patches root level
 * which is NOT where the Edge Function reads crash config from.
 */
export function CrashHandlingPanel() {
  const cfg = useAdminConfig();
  // Read crash config from gameHandlers.crash (same path as DB + Edge Function)
  const crash = cfg.gameHandlers['crash'] ?? store.getGameHandler('crash');

  const [manual, setManual] = useState(String(crash.manualCrashPoint ?? 2.0));

  // Stable preview — only recomputes when mode/settings change
  const [preview, setPreview] = useState<string>('');
  useEffect(() => {
    if (crash.mode === 'MANUAL') {
      setPreview((crash.manualCrashPoint ?? 2.0).toFixed(2) + 'x');
    } else {
      const p = Math.min(99, Math.max(1, crash.targetWinProbability)) / 100;
      const edge = crash.houseEdge / 100;
      const u = Math.max(0.0001, 1 - Math.random());
      const raw = (1 / u) * (1 - edge);
      const point = Math.max(1.01, Math.min(200, Math.round(raw * 100) / 100));
      setPreview(point.toFixed(2) + 'x');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crash.mode, crash.manualCrashPoint, crash.targetWinProbability, crash.houseEdge]);

  // All writes go through setGameHandler — which saves to adminConfig.gameHandlers['crash']
  // and the Edge Function reads adminConfig['crash'] — same path.
  const setMode = (mode: 'AUTO' | 'MANUAL') =>
    store.setGameHandler('crash', { mode });
  const setProb = (v: number) =>
    store.setGameHandler('crash', { targetWinProbability: v });
  const setEdge = (v: number) =>
    store.setGameHandler('crash', { houseEdge: v });
  const applyManual = () => {
    const point = Math.max(1.01, parseFloat(manual) || 1.01);
    store.setGameHandler('crash', { manualCrashPoint: point, mode: 'MANUAL' });
  };

  // Quick stakes
  const quickStakes = crash.quickStakes?.length ? crash.quickStakes : [200, 500, 1000, 2000];
  const [s1, setS1] = useState(String(quickStakes[0]));
  const [s2, setS2] = useState(String(quickStakes[1]));
  const [s3, setS3] = useState(String(quickStakes[2]));
  const [s4, setS4] = useState(String(quickStakes[3]));
  const saveStakes = () => {
    const vals = [parseFloat(s1), parseFloat(s2), parseFloat(s3), parseFloat(s4)]
      .filter((n) => Number.isFinite(n) && n > 0).slice(0, 4);
    if (vals.length) store.setGameHandler('crash', { quickStakes: vals });
  };

  return (
    <div className="panel p-4 space-y-4 border-neon-500/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
            <Rocket className="w-5 h-5 text-neon-300" /> Crash Handling
          </h2>
          <p className="text-xs text-slate-500">Live round control · pinned to top of admin dashboard.</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Status</p>
          <p className={`tabular font-display font-extrabold text-lg ${crash.mode === 'MANUAL' ? 'text-coral-400' : 'text-neon-300'}`}>
            {crash.mode}
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode('AUTO')}
          className={`panel p-3 text-left transition-all ${crash.mode === 'AUTO' ? 'border-neon-400 ring-1 ring-neon-400/40' : 'opacity-70 hover:opacity-100'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Shield className={`w-4 h-4 ${crash.mode === 'AUTO' ? 'text-neon-300' : 'text-slate-500'}`} />
            <span className="font-display font-bold text-white text-sm">Automated</span>
          </div>
          <p className="text-[11px] text-slate-400">Win-probability safeguards revenue.</p>
        </button>
        <button
          onClick={() => setMode('MANUAL')}
          className={`panel p-3 text-left transition-all ${crash.mode === 'MANUAL' ? 'border-coral-400 ring-1 ring-coral-400/40' : 'opacity-70 hover:opacity-100'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Cpu className={`w-4 h-4 ${crash.mode === 'MANUAL' ? 'text-coral-400' : 'text-slate-500'}`} />
            <span className="font-display font-bold text-white text-sm">Manual Override</span>
          </div>
          <p className="text-[11px] text-slate-400">Hardcode crash multiplier for next round.</p>
        </button>
      </div>

      {/* AUTO sliders */}
      {crash.mode === 'AUTO' && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-neon-300" /> Target Win Probability
              </label>
              <span className="tabular font-display font-extrabold text-lg text-neon-300">{crash.targetWinProbability}%</span>
            </div>
            <input
              type="range" min={0} max={100} value={crash.targetWinProbability}
              onChange={(e) => setProb(parseInt(e.target.value))}
              className="w-full accent-neon-400 h-2"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amberx-400" /> House Edge
              </label>
              <span className="tabular font-bold text-amberx-400">{crash.houseEdge}%</span>
            </div>
            <input
              type="range" min={0} max={15} value={crash.houseEdge}
              onChange={(e) => setEdge(parseInt(e.target.value))}
              className="w-full accent-amberx-400 h-2"
            />
          </div>
        </div>
      )}

      {/* MANUAL input */}
      {crash.mode === 'MANUAL' && (
        <div className="space-y-2 animate-fade-in">
          <label className="text-sm font-semibold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-coral-400" /> Termination Crash Multiplier
          </label>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Bust @ (x)</p>
            <input
              type="number" value={manual}
              onChange={(e) => setManual(e.target.value)}
              min={1.01} step={0.1} className="input tabular"
            />
          </div>
          <button onClick={applyManual} className="btn-coral w-full py-2">Apply Manual Override</button>
          <p className="text-[11px] text-slate-500">
            Queued for next round: bust at{' '}
            <span className="text-coral-300 font-semibold">{(crash.manualCrashPoint ?? 2.0).toFixed(2)}x</span>.
            <br /><span className="text-emeraldwin-300 font-semibold">Switch back to Automated when done.</span>
          </p>
        </div>
      )}

      {/* Preview */}
      <div className="bg-slatepanel-800 rounded-xl p-3 border border-neon-400/30">
        <label className="text-xs font-semibold text-neon-300 uppercase tracking-wider flex items-center gap-2 mb-2">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Next Round Preview
        </label>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider w-16">Outcome</span>
            <span className={`font-display font-extrabold text-xl tabular ${crash.mode === 'MANUAL' ? 'text-coral-400' : 'text-white'}`}>
              {preview}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            {crash.mode === 'MANUAL'
              ? `Manual override active · next round will bust at ${(crash.manualCrashPoint ?? 2.0).toFixed(2)}x`
              : `Win-prob ${crash.targetWinProbability}% · Edge ${crash.houseEdge}%`}
          </p>
        </div>
      </div>

      {/* Quick stakes */}
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">
          Quick Stake Chips (4 presets)
        </label>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {[{v: s1, set: setS1}, {v: s2, set: setS2}, {v: s3, set: setS3}, {v: s4, set: setS4}].map((x, i) => (
            <div key={i}>
              <p className="text-[9px] text-slate-500 mb-0.5">Stake {i + 1}</p>
              <input
                type="number" value={x.v}
                onChange={(e) => x.set(e.target.value)}
                min={1} className="input tabular text-sm py-1.5 w-full"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={saveStakes} className="btn-primary px-4 py-1.5 text-xs">Save Stakes</button>
          <span className="text-[11px] text-slate-500">
            Current: <span className="text-white tabular">{quickStakes.join(' · ')}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
