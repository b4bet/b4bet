import { useState } from 'react';
import { Shield, Sliders, Target, Cpu, Zap, Plane, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useAdminConfig } from '../../lib/hooks';
import { store } from '../../lib/store';

/**
 * AviatorHandlingPanel
 *
 * Identical pattern to CrashHandlingPanel — directly connected to Supabase.
 *
 * AUTO mode  — crash point generated server-side.  Win-probability + house
 *              edge sliders visible; no advance preview.
 *
 * MANUAL mode — admin types a multiplier, clicks Apply.
 *               Calls store.setGameHandlerAsync() which AWAITS the Supabase
 *               write.  On success we reload from Supabase and display the
 *               confirmed value from the DB.
 *               After the round fires the Edge Function auto-reverts to AUTO.
 */
export function AviatorHandlingPanel() {
  const cfg = useAdminConfig();
  const aviator = cfg.gameHandlers['aviator'] ?? store.getGameHandler('aviator');

  const [manual, setManual] = useState(String(aviator.manualResult ?? '2.00'));
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const doSave = async (patch: Parameters<typeof store.setGameHandlerAsync>[1]) => {
    setSaveStatus('saving');
    setConfirmed(null);
    setErrorMsg('');
    try {
      await store.setGameHandlerAsync('aviator', patch);
      await store.loadAdminConfigFromSupabase();
      const saved = store.getGameHandler('aviator');
      const savedPoint = saved.manualResult ? parseFloat(saved.manualResult) : null;
      setConfirmed(savedPoint);
      setSaveStatus('saved');
    } catch (e) {
      setErrorMsg((e as Error).message ?? 'Unknown error');
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 5000);
  };

  const setMode = (mode: 'AUTO' | 'MANUAL') => doSave({ mode });

  const setProb = (v: number) => store.setGameHandler('aviator', { targetWinProbability: v });
  const setEdge = (v: number) => store.setGameHandler('aviator', { houseEdge: v });

  const applyManual = () => {
    const point = Math.max(1.01, parseFloat(manual) || 1.01);
    void doSave({ manualResult: point.toFixed(2), mode: 'MANUAL' });
  };

  // Quick stakes
  const quickStakes = aviator.quickStakes?.length ? aviator.quickStakes : [10, 50, 100, 500];
  const [s1, setS1] = useState(String(quickStakes[0]));
  const [s2, setS2] = useState(String(quickStakes[1]));
  const [s3, setS3] = useState(String(quickStakes[2]));
  const [s4, setS4] = useState(String(quickStakes[3]));
  const saveStakes = () => {
    const vals = [parseFloat(s1), parseFloat(s2), parseFloat(s3), parseFloat(s4)]
      .filter((n) => Number.isFinite(n) && n > 0).slice(0, 4);
    if (vals.length) store.setGameHandler('aviator', { quickStakes: vals });
  };

  return (
    <div className="panel p-4 space-y-4 border-neon-500/30">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
            <Plane className="w-5 h-5 text-neon-300" /> Aviator Handling
          </h2>
          <p className="text-xs text-slate-500">Live round control · Supabase-connected · same as Crash.</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Status</p>
          <p className={`tabular font-display font-extrabold text-lg ${aviator.mode === 'MANUAL' ? 'text-coral-400' : 'text-neon-300'}`}>
            {aviator.mode}
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
          className={`panel p-3 text-left transition-all disabled:opacity-50 ${aviator.mode === 'AUTO' ? 'border-neon-400 ring-1 ring-neon-400/40' : 'opacity-70 hover:opacity-100'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Shield className={`w-4 h-4 ${aviator.mode === 'AUTO' ? 'text-neon-300' : 'text-slate-500'}`} />
            <span className="font-display font-bold text-white text-sm">Automated</span>
          </div>
          <p className="text-[11px] text-slate-400">Crash point generated server-side on round start.</p>
        </button>
        <button
          onClick={() => setMode('MANUAL')}
          disabled={saveStatus === 'saving'}
          className={`panel p-3 text-left transition-all disabled:opacity-50 ${aviator.mode === 'MANUAL' ? 'border-coral-400 ring-1 ring-coral-400/40' : 'opacity-70 hover:opacity-100'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Cpu className={`w-4 h-4 ${aviator.mode === 'MANUAL' ? 'text-coral-400' : 'text-slate-500'}`} />
            <span className="font-display font-bold text-white text-sm">Manual Override</span>
          </div>
          <p className="text-[11px] text-slate-400">Hardcode crash multiplier for next round.</p>
        </button>
      </div>

      {/* AUTO — sliders only */}
      {aviator.mode === 'AUTO' && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-xl bg-slatepanel-800 border border-neon-500/20 px-3 py-2 text-xs text-slate-400">
            Crash point is generated by the server the moment each round starts. Nothing to preview in advance.
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-neon-300" /> Target Win Probability
              </label>
              <span className="tabular font-display font-extrabold text-lg text-neon-300">{aviator.targetWinProbability}%</span>
            </div>
            <input
              type="range" min={0} max={100} value={aviator.targetWinProbability}
              onChange={(e) => setProb(parseInt(e.target.value))}
              className="w-full accent-neon-400 h-2"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amberx-400" /> House Edge
              </label>
              <span className="tabular font-bold text-amberx-400">{aviator.houseEdge}%</span>
            </div>
            <input
              type="range" min={0} max={15} value={aviator.houseEdge}
              onChange={(e) => setEdge(parseInt(e.target.value))}
              className="w-full accent-amberx-400 h-2"
            />
          </div>
        </div>
      )}

      {/* MANUAL — enter value, apply, see DB-confirmed result */}
      {aviator.mode === 'MANUAL' && (
        <div className="space-y-3 animate-fade-in">
          <label className="text-sm font-semibold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-coral-400" /> Bust Multiplier (x)
          </label>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Plane flies away @ (x)</p>
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

          {/* Confirmed — shown only after DB write succeeds */}
          {confirmed !== null && saveStatus !== 'error' && (
            <div className="rounded-xl bg-coral-900/30 border border-coral-500/40 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-coral-400 font-semibold mb-0.5">
                Confirmed in Supabase
              </p>
              <p className="font-display font-extrabold text-2xl text-coral-300 tabular">
                {confirmed.toFixed(2)}x
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Next round plane flies away at exactly this multiplier.
                After it fires, mode auto-reverts to AUTO.
              </p>
            </div>
          )}

          {confirmed === null && saveStatus === 'idle' && (
            <p className="text-[11px] text-slate-500">
              Currently queued:{' '}
              <span className="text-coral-300 font-semibold">
                {parseFloat(aviator.manualResult || '2.00').toFixed(2)}x
              </span>
              {' '}· Click Apply to save.
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
