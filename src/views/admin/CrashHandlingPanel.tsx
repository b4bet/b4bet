import { useState } from 'react';
import { Shield, Sliders, Target, Cpu, Zap, Rocket, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useAdminConfig } from '../../lib/hooks';
import { store } from '../../lib/store';

/**
 * CrashHandlingPanel
 *
 * AUTO mode  — no preview. Crash point is generated server-side the instant
 *              WAITING→FLYING fires. Nothing to show in advance.
 *
 * MANUAL mode — admin types a multiplier, clicks Apply.
 *               We call store.setGameHandlerAsync() which AWAITS the Supabase
 *               write (no blind timeout).  On success we reload from Supabase
 *               and display the confirmed value from the DB.
 *               The Edge Function reads root-level mode + manualCrashPoint for
 *               crash, so this value is exactly what the next round will use.
 *               After the round fires the Edge Function auto-reverts to AUTO.
 *
 * Quick Stakes — also saved via setGameHandlerAsync → Supabase confirmed ✓
 */
export function CrashHandlingPanel() {
  const cfg = useAdminConfig();
  const crash = cfg.gameHandlers['crash'] ?? store.getGameHandler('crash');

  const [manual, setManual] = useState(String(crash.manualCrashPoint ?? 2.0));
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Quick stakes state
  const quickStakes = crash.quickStakes?.length ? crash.quickStakes : [200, 500, 1000, 2000];
  const [s1, setS1] = useState(String(quickStakes[0]));
  const [s2, setS2] = useState(String(quickStakes[1]));
  const [s3, setS3] = useState(String(quickStakes[2]));
  const [s4, setS4] = useState(String(quickStakes[3]));
  const [stakesStatus, setStakesStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [stakesMsg, setStakesMsg] = useState('');

  const doSave = async (patch: Parameters<typeof store.setGameHandlerAsync>[1]) => {
    setSaveStatus('saving');
    setConfirmed(null);
    setErrorMsg('');
    try {
      await store.setGameHandlerAsync('crash', patch);
      await store.loadAdminConfigFromSupabase();
      const saved = store.getGameHandler('crash');
      setConfirmed(saved.manualCrashPoint ?? null);
      setSaveStatus('saved');
    } catch (e) {
      setErrorMsg((e as Error).message ?? 'Unknown error');
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 5000);
  };

  const setMode = (mode: 'AUTO' | 'MANUAL') => doSave({ mode });

  const setProb = (v: number) => store.setGameHandler('crash', { targetWinProbability: v });
  const setEdge = (v: number) => store.setGameHandler('crash', { houseEdge: v });

  const applyManual = () => {
    const point = Math.max(1.01, parseFloat(manual) || 1.01);
    void doSave({ manualCrashPoint: point, mode: 'MANUAL' });
  };

  // Save quick stakes to Supabase (async, confirmed)
  const saveStakes = async () => {
    const vals = [parseFloat(s1), parseFloat(s2), parseFloat(s3), parseFloat(s4)]
      .filter((n) => Number.isFinite(n) && n > 0).slice(0, 4);
    if (!vals.length) return;
    setStakesStatus('saving');
    setStakesMsg('');
    try {
      await store.setGameHandlerAsync('crash', { quickStakes: vals });
      await store.loadAdminConfigFromSupabase();
      setStakesStatus('saved');
      setStakesMsg('Supabase confirmed ✓');
    } catch (e) {
      setStakesStatus('error');
      setStakesMsg((e as Error).message ?? 'Save failed');
    }
    setTimeout(() => setStakesStatus('idle'), 5000);
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
          {saveStatus === 'saving' && <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0" />}
          {saveStatus === 'saved'  && <CheckCircle className="w-4 h-4 flex-shrink-0" />}
          {saveStatus === 'error'  && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span>
            {saveStatus === 'saving' && 'Writing to Supabase…'}
            {saveStatus === 'saved'  && 'Supabase confirmed ✓'}
            {saveStatus === 'error'  && `Save failed: ${errorMsg || 'check Supabase connection'}`}
          </span>
        </div>
      )}

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode('AUTO')}
          disabled={saveStatus === 'saving'}
          className={`panel p-3 text-left transition-all disabled:opacity-50 ${crash.mode === 'AUTO' ? 'border-neon-400 ring-1 ring-neon-400/40' : 'opacity-70 hover:opacity-100'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Shield className={`w-4 h-4 ${crash.mode === 'AUTO' ? 'text-neon-300' : 'text-slate-500'}`} />
            <span className="font-display font-bold text-white text-sm">Automated</span>
          </div>
          <p className="text-[11px] text-slate-400">Crash point generated server-side on round start.</p>
        </button>
        <button
          onClick={() => setMode('MANUAL')}
          disabled={saveStatus === 'saving'}
          className={`panel p-3 text-left transition-all disabled:opacity-50 ${crash.mode === 'MANUAL' ? 'border-coral-400 ring-1 ring-coral-400/40' : 'opacity-70 hover:opacity-100'}`}
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

      {/* MANUAL — enter value, apply, see DB-confirmed result */}
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
            {saveStatus === 'saving' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Apply Manual Override
          </button>

          {confirmed !== null && saveStatus !== 'error' && (
            <div className="rounded-xl bg-coral-900/30 border border-coral-500/40 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-coral-400 font-semibold mb-0.5">
                Confirmed in Supabase
              </p>
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
              {' '}· Click Apply to save.
            </p>
          )}
        </div>
      )}

      {/* Quick stakes — Supabase connected */}
      <div className="bg-slatepanel-800 rounded-xl p-3 border border-borderline-800 space-y-2">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
          Quick Stake Chips (4 presets)
        </label>
        <div className="grid grid-cols-4 gap-2">
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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { void saveStakes(); }}
            disabled={stakesStatus === 'saving'}
            className="btn-primary px-4 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-60"
          >
            {stakesStatus === 'saving' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
            Save Stakes
          </button>
          {stakesStatus === 'saved' && (
            <span className="text-[11px] text-emeraldwin-300 font-semibold flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />{stakesMsg}
            </span>
          )}
          {stakesStatus === 'error' && (
            <span className="text-[11px] text-coral-300 font-semibold flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />{stakesMsg}
            </span>
          )}
          {stakesStatus === 'idle' && (
            <span className="text-[11px] text-slate-500">
              Current: <span className="text-white tabular">{quickStakes.join(' · ')}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
