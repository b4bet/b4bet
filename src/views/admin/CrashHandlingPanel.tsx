import { useState } from 'react';
import { Shield, Sliders, Target, Cpu, Zap, Rocket, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useAdminConfig } from '../../lib/hooks';
import { store } from '../../lib/store';

/**
 * CrashHandlingPanel
 *
 * AUTO mode  — no preview shown. Crash point is generated server-side the
 *              moment the WAITING→FLYING transition fires. There is nothing
 *              meaningful to preview before that.
 *
 * MANUAL mode — admin sets a bust multiplier and clicks "Apply".
 *               We write it via store.setGameHandler (which persists to
 *               Supabase), wait 1 s, then reload admin config from Supabase
 *               and show the confirmed value.  The Edge Function reads
 *               root-level mode + manualCrashPoint for crash, so whatever
 *               is confirmed here is exactly what the next round will use.
 */
export function CrashHandlingPanel() {
  const cfg = useAdminConfig();
  const crash = cfg.gameHandlers['crash'] ?? store.getGameHandler('crash');

  const [manual, setManual] = useState(String(crash.manualCrashPoint ?? 2.0));

  // Confirmed value — shown after a successful save so admin can see what
  // the server actually has stored.
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const setMode = async (mode: 'AUTO' | 'MANUAL') => {
    setSaveStatus('saving');
    setConfirmed(null);
    try {
      store.setGameHandler('crash', { mode });
      await new Promise(r => setTimeout(r, 800));
      await store.loadAdminConfigFromSupabase();
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 3000);
  };

  const setProb = (v: number) => store.setGameHandler('crash', { targetWinProbability: v });
  const setEdge = (v: number) => store.setGameHandler('crash', { houseEdge: v });

  const applyManual = async () => {
    const point = Math.max(1.01, parseFloat(manual) || 1.01);
    setSaveStatus('saving');
    setConfirmed(null);
    try {
      store.setGameHandler('crash', { manualCrashPoint: point, mode: 'MANUAL' });
      // Wait for Supabase write to complete
      await new Promise(r => setTimeout(r, 1000));
      // Reload from Supabase to verify what was actually saved
      await store.loadAdminConfigFromSupabase();
      // Read back the confirmed value
      const saved = store.getGameHandler('crash').manualCrashPoint ?? point;
      setConfirmed(saved);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 5000);
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
      {/* Header */}
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

      {/* Save feedback */}
      {saveStatus !== 'idle' && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
          saveStatus === 'saving' ? 'bg-slate-700 text-slate-300' :
          saveStatus === 'saved'  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-500/40' :
                                    'bg-red-900/60 text-red-300 border border-red-500/40'
        }`}>
          {saveStatus === 'saving' && <RefreshCw className="w-4 h-4 animate-spin" />}
          {saveStatus === 'saved'  && <CheckCircle className="w-4 h-4" />}
          {saveStatus === 'error'  && <AlertCircle className="w-4 h-4" />}
          {saveStatus === 'saving' && 'Saving to Supabase…'}
          {saveStatus === 'saved'  && 'Saved & confirmed ✓'}
          {saveStatus === 'error'  && 'Save failed — check Supabase connection'}
        </div>
      )}

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
          <p className="text-[11px] text-slate-400">Crash point generated server-side on round start.</p>
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

      {/* AUTO — sliders only, no preview */}
      {crash.mode === 'AUTO' && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-xl bg-slatepanel-800 border border-neon-500/20 px-3 py-2 text-xs text-slate-400">
            Crash point is generated by the server the moment each round starts. Nothing to preview in advance.
          </div>
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

      {/* MANUAL — enter value, apply, see confirmed value */}
      {crash.mode === 'MANUAL' && (
        <div className="space-y-3 animate-fade-in">
          <label className="text-sm font-semibold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-coral-400" /> Termination Crash Multiplier
          </label>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Bust @ (x)</p>
            <input
              type="number" value={manual}
              onChange={(e) => { setManual(e.target.value); setConfirmed(null); }}
              min={1.01} step={0.1} className="input tabular"
            />
          </div>

          <button
            onClick={applyManual}
            disabled={saveStatus === 'saving'}
            className="btn-coral w-full py-2 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saveStatus === 'saving' && <RefreshCw className="w-4 h-4 animate-spin" />}
            Apply Manual Override
          </button>

          {/* Confirmed value — shown only after successful save */}
          {confirmed !== null && saveStatus !== 'error' && (
            <div className="rounded-xl bg-coral-900/30 border border-coral-500/40 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-coral-400 font-semibold mb-0.5">Confirmed in Supabase</p>
              <p className="font-display font-extrabold text-2xl text-coral-300 tabular">
                {confirmed.toFixed(2)}x
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Next round will crash at exactly this multiplier.
                After it fires, mode auto-reverts to AUTO.
              </p>
            </div>
          )}

          {confirmed === null && saveStatus === 'idle' && (
            <p className="text-[11px] text-slate-500">
              Currently queued:{' '}
              <span className="text-coral-300 font-semibold">{(crash.manualCrashPoint ?? 2.0).toFixed(2)}x</span>
              {' '}· Click Apply to update.
            </p>
          )}
        </div>
      )}

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
