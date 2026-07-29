import { useMemo, useState, useRef, useEffect } from 'react';
import SelectModal from '../../components/SelectModal';
import { cms } from '../../lib/cms';
import { useAdminConfig, useGameLogos, useCrashState, useGameRound } from '../../lib/hooks';
import { store, computeAutoOutcome } from '../../lib/store';
import type { RoundOutcomePreview } from '../../lib/store';
import { gameLogos } from '../../lib/gameLogos';
import type { GameKey } from '../../lib/gameLogos';
import {
  Shield, Sliders, Target, Cpu, Zap, Upload, Image as ImageIcon, Trash2,
  Rocket, Bomb, Trophy, DollarSign, Dices, Circle, BarChart2, Sun, Plane,
  Plus, X, ChevronDown, ChevronUp, Users, RefreshCw, SlidersHorizontal,
  CheckCircle, AlertCircle,
} from 'lucide-react';

// CrashHandlingPanel — dedicated async Supabase-connected panel
export { CrashHandlingPanel } from './CrashHandlingPanel';

// AviatorHandlingPanel — dedicated async Supabase-connected panel (same pattern as Crash)
export { AviatorHandlingPanel } from './AviatorHandlingPanel';

// ─── 8-game registry: crash, mines, aviator, wingo, k3, fived, sunvsmoon, trading
const gameMeta: { key: GameKey; label: string; icon: typeof Rocket }[] = [
  { key: 'crash', label: 'Crash', icon: Rocket },
  { key: 'mines', label: 'Mines', icon: Bomb },
  { key: 'aviator', label: 'Aviator', icon: Plane },
  { key: 'wingo', label: 'Win Go', icon: Circle },
  { key: 'k3', label: 'K3', icon: Dices },
  { key: 'fived', label: '5D', icon: Dices },
  { key: 'sunvsmoon', label: 'Sun vs Moon', icon: Sun },
  { key: 'trading', label: 'Trading', icon: BarChart2 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Generic Game Handler Panel (shared by lottery-style games)
// ALL saves (mode, manual override, quick stakes) go through setGameHandlerAsync
// so every change is written to Supabase and confirmed before the UI updates.
// ─────────────────────────────────────────────────────────────────────────────
function GameHandlerPanel({ gameKey, label, icon: Icon, manualLabel, manualPlaceholder, manualHint }: {
  gameKey: string; label: string; icon: typeof Rocket; manualLabel: string;
  manualPlaceholder: string; manualHint: string;
}) {
  const cfg = useAdminConfig();
  const handler = cfg.gameHandlers[gameKey] ?? store.getGameHandler(gameKey);
  const currentRound = useGameRound(gameKey);
  const upcomingRound = currentRound + 1;
  const [manual, setManual] = useState(handler.manualResult);
  const [targetRound, setTargetRound] = useState<string>(String(handler.manualTargetRoundId ?? upcomingRound));
  const userEditedRoundRef = useRef(false);
  useEffect(() => {
    if (userEditedRoundRef.current) return;
    if (handler.manualTargetRoundId && handler.manualTargetRoundId > currentRound) return;
    setTargetRound(String(upcomingRound));
  }, [upcomingRound, handler.manualTargetRoundId, currentRound]);

  // Quick stakes — Supabase connected
  const [stake1, setStake1] = useState(String(handler.quickStakes[0] ?? '10'));
  const [stake2, setStake2] = useState(String(handler.quickStakes[1] ?? '100'));
  const [stake3, setStake3] = useState(String(handler.quickStakes[2] ?? '1000'));
  const [stake4, setStake4] = useState(String(handler.quickStakes[3] ?? '10000'));
  const [stakesStatus, setStakesStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [stakesMsg, setStakesMsg] = useState('');

  // Save status for mode toggle + manual override
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMsg, setSaveMsg] = useState('');

  const [preview, setPreview] = useState<RoundOutcomePreview | null>(null);

  const setProb = (v: number) => store.setGameHandler(gameKey, { targetWinProbability: v });
  const setEdge = (v: number) => store.setGameHandler(gameKey, { houseEdge: v });

  const refreshPreview = () => {
    const h = store.getGameHandler(gameKey);
    if (h.mode === 'AUTO') setPreview(computeAutoOutcome(gameKey, h));
    else if (h.mode === 'MANUAL' && h.manualResult) {
      let detail = 'Manual override active';
      if (gameKey === 'wingo') detail = 'Manual digit: ' + h.manualResult;
      else if (gameKey === 'k3') detail = 'Manual dice: ' + h.manualResult;
      else if (gameKey === 'fived') detail = 'Manual digits: ' + h.manualResult;
      else if (gameKey === 'sunvsmoon') detail = 'Manual side: ' + h.manualResult;
      setPreview({ outcome: h.manualResult, detail });
    } else setPreview(null);
  };

  useEffect(() => { refreshPreview(); }, [handler.mode, handler.targetWinProbability, handler.houseEdge, handler.manualResult, handler.manualTargetRoundId]);

  // Core async save — used by both setMode and applyManual
  const doSave = async (patch: Partial<typeof handler>) => {
    setSaveStatus('saving');
    setSaveMsg('');
    try {
      await store.setGameHandlerAsync(gameKey, patch);
      await store.loadAdminConfigFromSupabase();
      refreshPreview();
      setSaveStatus('saved');
      setSaveMsg('Supabase confirmed ✓');
    } catch (e) {
      setSaveStatus('error');
      setSaveMsg((e as Error).message ?? 'Save failed');
    }
    setTimeout(() => setSaveStatus('idle'), 5000);
  };

  // Mode toggle — async, Supabase confirmed
  const setMode = (mode: 'AUTO' | 'MANUAL') => { void doSave({ mode }); };

  // Apply manual override — async, Supabase confirmed
  const applyManual = () => {
    const target = parseInt(targetRound, 10);
    const resolvedTarget = Number.isFinite(target) && target > currentRound ? target : upcomingRound;
    setTargetRound(String(resolvedTarget));
    userEditedRoundRef.current = false;
    void doSave({ manualResult: manual.trim(), manualTargetRoundId: resolvedTarget, mode: 'MANUAL' });
  };

  // Save quick stakes to Supabase (async, confirmed)
  const saveStakes = async () => {
    const vals = [parseFloat(stake1), parseFloat(stake2), parseFloat(stake3), parseFloat(stake4)]
      .filter((n) => Number.isFinite(n) && n > 0).slice(0, 4);
    if (!vals.length) return;
    setStakesStatus('saving');
    setStakesMsg('');
    try {
      await store.setGameHandlerAsync(gameKey, { quickStakes: vals });
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
    <div className="panel space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-neon-400" />
          <span className="font-semibold text-sm">{label} Handling</span>
        </div>
        <div className="text-xs text-gray-400">Auto engine · admin override for the next round.</div>
        <span className={`badge text-xs px-2 py-0.5 rounded ${handler.mode === 'MANUAL' ? 'bg-coral-400/20 text-coral-300' : 'bg-neon-400/20 text-neon-300'}`}>
          Mode <b>{handler.mode}</b>
        </span>
      </div>

      {/* Save feedback */}
      {saveStatus !== 'idle' && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${saveStatus === 'saved' ? 'bg-neon-400/10 text-neon-300' : saveStatus === 'error' ? 'bg-coral-400/10 text-coral-300' : 'bg-white/5 text-gray-300'}`}>
          {saveStatus === 'saving' && <RefreshCw className="w-3 h-3 animate-spin" />}
          {saveStatus === 'saved' && <CheckCircle className="w-3 h-3" />}
          {saveStatus === 'error' && <AlertCircle className="w-3 h-3" />}
          {saveStatus === 'saving' && 'Saving to Supabase…'}
          {saveStatus === 'saved' && saveMsg}
          {saveStatus === 'error' && `Save failed: ${saveMsg}`}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setMode('AUTO')} disabled={saveStatus === 'saving'} className={`panel p-3 text-left transition-all disabled:opacity-50 ${handler.mode === 'AUTO' ? 'border-neon-400 ring-1 ring-neon-400/40' : 'opacity-70 hover:opacity-100'}`}>
          <div className="text-xs font-semibold">Automated</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Win-probability safeguards revenue.</div>
        </button>
        <button onClick={() => setMode('MANUAL')} disabled={saveStatus === 'saving'} className={`panel p-3 text-left transition-all disabled:opacity-50 ${handler.mode === 'MANUAL' ? 'border-coral-400 ring-1 ring-coral-400/40' : 'opacity-70 hover:opacity-100'}`}>
          <div className="text-xs font-semibold">Manual Override</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Hardcode outcome for one queued round.</div>
        </button>
      </div>
      {handler.mode === 'AUTO' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs"><span>Target Win Probability</span><span className="font-mono text-neon-300">{handler.targetWinProbability}%</span></div>
          <input type="range" value={handler.targetWinProbability} min={10} max={90} onChange={(e) => setProb(parseInt(e.target.value))} className="w-full accent-neon-400 h-2" />
          <div className="flex items-center justify-between text-xs"><span>House Edge</span><span className="font-mono text-neon-300">{handler.houseEdge}%</span></div>
          <input type="range" value={handler.houseEdge} min={1} max={20} onChange={(e) => setEdge(parseInt(e.target.value))} className="w-full accent-amberx-400 h-2" />
        </div>
      )}
      {handler.mode === 'MANUAL' && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-300">{manualLabel}</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-400 mb-1 block">Outcome</label>
              <input type="text" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={manualPlaceholder} className="input tabular" />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 mb-1 block">Apply to Round #</label>
              <input type="number" value={targetRound} onChange={(e) => { userEditedRoundRef.current = true; setTargetRound(e.target.value); }} min={upcomingRound} step={1} placeholder={String(upcomingRound)} className="input tabular" />
            </div>
          </div>
          <button onClick={applyManual} disabled={saveStatus === 'saving'} className="btn-primary w-full py-2 text-xs disabled:opacity-50">
            {saveStatus === 'saving' ? <RefreshCw className="w-3 h-3 animate-spin inline mr-1" /> : null}
            Apply Manual Override
          </button>
          <p className="text-[11px] text-gray-500">
            {manualHint} Queued: <b className="text-coral-300">{handler.manualResult || '—'}</b>.
            {' '}✓ Auto-reverts to AUTO after the manual round.
          </p>
        </div>
      )}

      <div className="panel bg-black/20 space-y-1 p-3">
        <div className="text-xs font-medium text-gray-300 flex items-center gap-1.5"><Target className="w-3 h-3" /> Next Round Preview</div>
        <div className="text-xs text-gray-400 mt-1">
          {preview ? (
            <div className="grid grid-cols-2 gap-1 mt-1">
              <span className="text-gray-500">Outcome</span><span className="font-mono text-neon-300">{preview.outcome}</span>
              <span className="text-gray-500">Detail</span><span className="font-mono text-gray-300">{preview.detail}</span>
            </div>
          ) : (<span>Preview will appear automatically.</span>)}
        </div>
      </div>

      {/* Quick stakes — Supabase connected */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-300">Quick Stake Chips (4 presets)</div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[11px] text-gray-400 mb-1 block">Stake 1</label><input type="number" value={stake1} onChange={(e) => setStake1(e.target.value)} min={1} className="input tabular text-sm py-1.5 w-full" /></div>
          <div><label className="text-[11px] text-gray-400 mb-1 block">Stake 2</label><input type="number" value={stake2} onChange={(e) => setStake2(e.target.value)} min={1} className="input tabular text-sm py-1.5 w-full" /></div>
          <div><label className="text-[11px] text-gray-400 mb-1 block">Stake 3</label><input type="number" value={stake3} onChange={(e) => setStake3(e.target.value)} min={1} className="input tabular text-sm py-1.5 w-full" /></div>
          <div><label className="text-[11px] text-gray-400 mb-1 block">Stake 4</label><input type="number" value={stake4} onChange={(e) => setStake4(e.target.value)} min={1} className="input tabular text-sm py-1.5 w-full" /></div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { void saveStakes(); }}
            disabled={stakesStatus === 'saving'}
            className="btn-primary px-4 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-60"
          >
            {stakesStatus === 'saving' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
            Save Stakes
          </button>
          {stakesStatus === 'saved' && (
            <span className="text-xs text-neon-300 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />{stakesMsg}
            </span>
          )}
          {stakesStatus === 'error' && (
            <span className="text-xs text-coral-300 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />{stakesMsg}
            </span>
          )}
          {stakesStatus === 'idle' && (
            <span className="text-xs text-gray-500">
              Current: <span className="font-mono">{handler.quickStakes.join(' · ')}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Individual exported handler panels (lottery-style games only)
export function WingoHandlingPanel() { return <GameHandlerPanel gameKey="wingo" label="Win Go" icon={Circle} manualLabel="Manual Digit (0–9)" manualPlaceholder="e.g. 5" manualHint="Enter 0–9." />; }
export function K3HandlingPanel() { return <GameHandlerPanel gameKey="k3" label="K3" icon={Dices} manualLabel="Manual Dice (d1,d2,d3)" manualPlaceholder="e.g. 3,3,3" manualHint="Enter three comma-separated dice values 1–6." />; }
export function FiveDHandlingPanel() { return <GameHandlerPanel gameKey="fived" label="5D" icon={Dices} manualLabel="Manual 5-Digit Result" manualPlaceholder="e.g. 12345" manualHint="Enter exactly 5 digits 0–9." />; }
export function SunMoonHandlingPanel() { return <GameHandlerPanel gameKey="sunvsmoon" label="Sun vs Moon" icon={Sun} manualLabel="Manual Side (sun / moon / tie)" manualPlaceholder="sun, moon or tie" manualHint='Enter "sun", "moon", or "tie".' />; }
export function MinesHandlingPanel() { return <GameHandlerPanel gameKey="mines" label="Mines" icon={Bomb} manualLabel="Manual Mine Positions" manualPlaceholder="e.g. 3,7,12" manualHint="Enter mine cell indices (0-based), comma-separated." />; }
export function TradingHandlingPanel() { return <GameHandlerPanel gameKey="trading" label="Trading" icon={BarChart2} manualLabel="Manual Direction (UP / DOWN)" manualPlaceholder="UP or DOWN" manualHint='Enter "UP" or "DOWN".' />; }

export function AllGameHandlersSection() {
  return (
    <div className="space-y-4">
      <WingoHandlingPanel />
      <K3HandlingPanel />
      <FiveDHandlingPanel />
      <SunMoonHandlingPanel />
      <MinesHandlingPanel />
      <TradingHandlingPanel />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Global Bet Limits
// ─────────────────────────────────────────────────────────────────────────────
export function GlobalBetLimitsPanel() {
  const cfg = useAdminConfig();
  const [min, setMin] = useState(String(cfg.minBet));
  const [max, setMax] = useState(String(cfg.maxBet));
  const [msg, setMsg] = useState<string | null>(null);

  const save = () => {
    const mn = parseFloat(min);
    const mx = parseFloat(max);
    if (!Number.isFinite(mn) || !Number.isFinite(mx) || mn <= 0 || mx <= mn) {
      setMsg('Invalid limits — max must exceed min.'); return;
    }
    store.setAdmin({ minBet: mn, maxBet: mx });
    setMsg('Saved · enforced on all games.');
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="panel space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-neon-400" />
        <span className="font-semibold text-sm">Global Bet Limits</span>
        <span className="text-xs text-gray-400 ml-auto">Applies to every game as default · engine rejects out-of-range stakes.</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Min Bet ({store.currency})</label>
          <input type="number" value={min} onChange={(e) => setMin(e.target.value)} min={1} step={1} className="input tabular" />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Max Bet ({store.currency})</label>
          <input type="number" value={max} onChange={(e) => setMax(e.target.value)} min={1} step={1} className="input tabular" />
        </div>
      </div>
      <button onClick={save} className="btn-primary w-full py-2 text-xs">Save Global Limits</button>
      {msg && <p className="text-xs text-neon-300">{msg}</p>}
      <p className="text-xs text-gray-500">Active: {store.currency}{cfg.minBet} – {store.currency}{cfg.maxBet}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-Game Bet Limits
// ─────────────────────────────────────────────────────────────────────────────
export function PerGameBetLimitsPanel() {
  const cfg = useAdminConfig();
  const [expanded, setExpanded] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { min: string; max: string }>>(() => {
    const result: Record<string, { min: string; max: string }> = {};
    gameMeta.forEach(({ key }) => {
      const lim = cfg.perGameLimits[key];
      result[key] = { min: String(lim?.min ?? cfg.minBet), max: String(lim?.max ?? cfg.maxBet) };
    });
    return result;
  });
  const [msg, setMsg] = useState<string | null>(null);

  const saveAll = () => {
    const perGameLimits: typeof cfg.perGameLimits = {};
    for (const { key } of gameMeta) {
      const d = drafts[key];
      const mn = parseFloat(d?.min ?? '');
      const mx = parseFloat(d?.max ?? '');
      if (Number.isFinite(mn) && Number.isFinite(mx) && mn > 0 && mx > mn) {
        perGameLimits[key] = { min: mn, max: mx };
      }
    }
    store.setAdmin({ perGameLimits });
    setMsg('Per-game limits saved.');
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="panel space-y-3">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-neon-400" />
          <span className="font-semibold text-sm">Per-Game Bet Limits</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {expanded && (
        <>
          <div className="space-y-2">
            {gameMeta.map(({ key, label }) => (
              <div key={key} className="grid grid-cols-3 gap-2 items-center">
                <span className="text-xs text-gray-300">{label}</span>
                <input
                  type="number" min={1}
                  value={drafts[key]?.min ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [key]: { ...d[key], min: e.target.value } }))}
                  className="input tabular text-xs py-1"
                  placeholder="Min"
                />
                <input
                  type="number" min={1}
                  value={drafts[key]?.max ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [key]: { ...d[key], max: e.target.value } }))}
                  className="input tabular text-xs py-1"
                  placeholder="Max"
                />
              </div>
            ))}
          </div>
          <button onClick={saveAll} className="btn-primary w-full py-2 text-xs">Save Per-Game Limits</button>
          {msg && <p className="text-xs text-neon-300">{msg}</p>}
        </>
      )}
    </div>
  );
}
