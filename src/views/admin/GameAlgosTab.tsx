import { useMemo, useState, useRef, useEffect } from 'react';
import SelectModal from '../../components/SelectModal';
import { cms } from '../../lib/cms';
import { useAdminConfig, useGameLogos, useCrashState, useGameRound } from '../../lib/hooks';
import { store, computeAutoOutcome } from '../../lib/store';
import type { RoundOutcomePreview } from '../../lib/store';
import type { RedeemCode } from '../../lib/store';
import { gameLogos } from '../../lib/gameLogos';
import type { GameKey } from '../../lib/gameLogos';
import {
  Shield, Sliders, Target, Cpu, Zap, Upload, Image as ImageIcon, Trash2,
  Rocket, Bomb, Trophy, DollarSign, Dices, Circle, BarChart2, Sun, Plane,
  TicketPercent, Plus, X, ChevronDown, ChevronUp, Users, RefreshCw, SlidersHorizontal,
} from 'lucide-react';

// ─── 8-game registry: crash, mines, aviator, wingo, k3, fived, sunvsmoon, trading
const gameMeta: { key: GameKey; label: string; icon: typeof Rocket }[] = [
  { key: 'crash',     label: 'Crash',      icon: Rocket    },
  { key: 'mines',     label: 'Mines',      icon: Bomb      },
  { key: 'aviator',   label: 'Aviator',    icon: Plane     },
  { key: 'wingo',     label: 'Win Go',     icon: Circle    },
  { key: 'k3',        label: 'K3',         icon: Dices     },
  { key: 'fived',     label: '5D',         icon: Dices     },
  { key: 'sunvsmoon', label: 'Sun vs Moon',icon: Sun       },
  { key: 'trading',   label: 'Trading',    icon: BarChart2 },
];

const CRASH_GAMES = gameMeta.filter((g) => g.key === 'crash');

// ─────────────────────────────────────────────────────────────────────────────
// Crash Handling Panel
// ─────────────────────────────────────────────────────────────────────────────
export function CrashHandlingPanel() {
  const cfg = useAdminConfig();
  const crashState = useCrashState();
  const [manual, setManual] = useState(String(cfg.manualCrashPoint));
  const [targetRound, setTargetRound] = useState<string>(String(crashState.roundId + 1));
  const [crashStake1, setCrashStake1] = useState(String(cfg.crashQuickStakes[0] ?? '200'));
  const [crashStake2, setCrashStake2] = useState(String(cfg.crashQuickStakes[1] ?? '500'));
  const [crashStake3, setCrashStake3] = useState(String(cfg.crashQuickStakes[2] ?? '1000'));
  const [crashStake4, setCrashStake4] = useState(String(cfg.crashQuickStakes[3] ?? '2000'));

  const setMode = (mode: 'AUTO' | 'MANUAL') => store.setAdmin({ mode });
  const setProb = (v: number) => store.setAdmin({ targetWinProbability: v });
  const setEdge = (v: number) => store.setAdmin({ houseEdge: v });
  const applyManual = () => {
    const target = parseInt(targetRound, 10);
    store.setAdmin({
      manualCrashPoint: Math.max(1.01, parseFloat(manual) || 1.01),
      manualTargetRoundId: Number.isFinite(target) && target > crashState.roundId ? target : crashState.roundId + 1,
      mode: 'MANUAL',
    });
  };
  const saveCrashStakes = () => {
    const vals = [parseFloat(crashStake1), parseFloat(crashStake2), parseFloat(crashStake3), parseFloat(crashStake4)]
      .filter((n) => Number.isFinite(n) && n > 0).slice(0, 4);
    if (vals.length) store.setAdmin({ crashQuickStakes: vals });
  };

  // upcomingRound kept for use in manual override input validation — not displayed
  const upcomingRound = crashState.phase === 'countdown' ? crashState.roundId : crashState.roundId + 1;

  return (
    <div className="panel p-4 space-y-4 border-neon-500/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
            <Rocket className="w-5 h-5 text-neon-300" /> Crash Handling
          </h2>
          <p className="text-xs text-slate-500">Live round control · pinned to top of admin dashboard.</p>
        </div>
        {/* Round number display removed — local counter is not synced across tabs/sessions */}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setMode('AUTO')} className={`panel p-3 text-left transition-all ${cfg.mode === 'AUTO' ? 'border-neon-400 ring-1 ring-neon-400/40' : 'opacity-70 hover:opacity-100'}`}>
          <div className="flex items-center gap-2 mb-1">
            <Shield className={`w-4 h-4 ${cfg.mode === 'AUTO' ? 'text-neon-300' : 'text-slate-500'}`} />
            <span className="font-display font-bold text-white text-sm">Automated</span>
          </div>
          <p className="text-[11px] text-slate-400">Win-probability safeguards revenue.</p>
        </button>
        <button onClick={() => setMode('MANUAL')} className={`panel p-3 text-left transition-all ${cfg.mode === 'MANUAL' ? 'border-coral-400 ring-1 ring-coral-400/40' : 'opacity-70 hover:opacity-100'}`}>
          <div className="flex items-center gap-2 mb-1">
            <Cpu className={`w-4 h-4 ${cfg.mode === 'MANUAL' ? 'text-coral-400' : 'text-slate-500'}`} />
            <span className="font-display font-bold text-white text-sm">Manual Override</span>
          </div>
          <p className="text-[11px] text-slate-400">Hardcode crash multiplier for one round.</p>
        </button>
      </div>

      {cfg.mode === 'AUTO' && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-white flex items-center gap-2"><Sliders className="w-4 h-4 text-neon-300" /> Target Win Probability</label>
              <span className="tabular font-display font-extrabold text-lg text-neon-300">{cfg.targetWinProbability}%</span>
            </div>
            <input type="range" min={0} max={100} value={cfg.targetWinProbability} onChange={(e) => setProb(parseInt(e.target.value))} className="w-full accent-neon-400 h-2" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-white flex items-center gap-2"><Zap className="w-4 h-4 text-amberx-400" /> House Edge</label>
              <span className="tabular font-bold text-amberx-400">{cfg.houseEdge}%</span>
            </div>
            <input type="range" min={0} max={15} value={cfg.houseEdge} onChange={(e) => setEdge(parseInt(e.target.value))} className="w-full accent-amberx-400 h-2" />
          </div>
        </div>
      )}

      {cfg.mode === 'MANUAL' && (
        <div className="space-y-2 animate-fade-in">
          <label className="text-sm font-semibold text-white flex items-center gap-2"><Target className="w-4 h-4 text-coral-400" /> Termination Crash Multiplier</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Bust @ (x)</p>
              <input type="number" value={manual} onChange={(e) => setManual(e.target.value)} min={1.01} step={0.1} className="input tabular" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Apply to Round #</p>
              <input type="number" value={targetRound} onChange={(e) => setTargetRound(e.target.value)} min={crashState.roundId + 1} step={1} className="input tabular" />
            </div>
          </div>
          <button onClick={applyManual} className="btn-coral w-full py-2">Apply Manual Override</button>
          <p className="text-[11px] text-slate-500">
            Queued: bust at <span className="text-coral-300 font-semibold">{cfg.manualCrashPoint.toFixed(2)}x</span>.
            <br /><span className="text-emeraldwin-300 font-semibold">✓ Auto-reverts to AUTO after the manual round.</span>
          </p>
        </div>
      )}

      {/* Next Round Preview */}
      <div className="bg-slatepanel-800 rounded-xl p-3 border border-neon-400/30">
        <div className="flex items-center mb-2">
          <label className="text-xs font-semibold text-neon-300 uppercase tracking-wider flex items-center gap-2">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Next Round Preview
          </label>
          {/* Round number badge removed — local counter not shared across sessions */}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider w-16">Outcome</span>
            <span className={`font-display font-extrabold text-xl tabular ${cfg.mode === 'MANUAL' ? 'text-coral-400' : 'text-white'}`}>
              {cfg.mode === 'MANUAL' ? cfg.manualCrashPoint.toFixed(2) + 'x' : (
                (() => { const p = Math.min(99, Math.max(1, cfg.targetWinProbability)) / 100; const r = Math.random(); if (r < (1 - p) * 0.12) return (1 + Math.random() * 0.05).toFixed(2) + 'x ⚠️'; const u = Math.max(0.0001, 1 - Math.random()); const raw = (1 / (u * (1 - cfg.houseEdge / 100))) * (0.5 + p); return Math.max(1.01, Math.min(1000, Math.round(raw * 100) / 100)).toFixed(2) + 'x'; })()
              )}
            </span>
          </div>
          <p className="text-xs text-slate-400">{cfg.mode === 'MANUAL' ? 'Manual override · auto-reverts after round' : `Win-prob ${cfg.targetWinProbability}% · Edge ${cfg.houseEdge}%`}</p>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Quick Stake Chips (4 presets)</label>
        <div className="grid grid-cols-4 gap-2 mb-2">
          <div><p className="text-[9px] text-slate-500 mb-0.5">Stake 1</p><input type="number" value={crashStake1} onChange={(e) => setCrashStake1(e.target.value)} min={1} className="input tabular text-sm py-1.5 w-full" /></div>
          <div><p className="text-[9px] text-slate-500 mb-0.5">Stake 2</p><input type="number" value={crashStake2} onChange={(e) => setCrashStake2(e.target.value)} min={1} className="input tabular text-sm py-1.5 w-full" /></div>
          <div><p className="text-[9px] text-slate-500 mb-0.5">Stake 3</p><input type="number" value={crashStake3} onChange={(e) => setCrashStake3(e.target.value)} min={1} className="input tabular text-sm py-1.5 w-full" /></div>
          <div><p className="text-[9px] text-slate-500 mb-0.5">Stake 4</p><input type="number" value={crashStake4} onChange={(e) => setCrashStake4(e.target.value)} min={1} className="input tabular text-sm py-1.5 w-full" /></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={saveCrashStakes} className="btn-primary px-4 py-1.5 text-xs">Save Stakes</button>
          <span className="text-[11px] text-slate-500">Current: <span className="text-white tabular">{cfg.crashQuickStakes.join(' · ')}</span></span>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Generic Game Handler Panel (shared by all 5 auto games)
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
  // Keep the "Apply to Round #" input auto-synced to the actual next round
  // whenever the game advances — unless the admin has manually queued a round
  // or typed a custom value into the field.
  useEffect(() => {
    if (userEditedRoundRef.current) return;
    if (handler.manualTargetRoundId && handler.manualTargetRoundId > currentRound) return;
    setTargetRound(String(upcomingRound));
  }, [upcomingRound, handler.manualTargetRoundId, currentRound]);
  const [stake1, setStake1] = useState(String(handler.quickStakes[0] ?? '10'));
  const [stake2, setStake2] = useState(String(handler.quickStakes[1] ?? '100'));
  const [stake3, setStake3] = useState(String(handler.quickStakes[2] ?? '1000'));
  const [stake4, setStake4] = useState(String(handler.quickStakes[3] ?? '10000'));
  const [preview, setPreview] = useState<RoundOutcomePreview | null>(null);

  const setMode = (mode: 'AUTO' | 'MANUAL') => store.setGameHandler(gameKey, { mode });
  const setProb = (v: number) => store.setGameHandler(gameKey, { targetWinProbability: v });
  const setEdge = (v: number) => store.setGameHandler(gameKey, { houseEdge: v });

  const refreshPreview = () => {
    const h = store.getGameHandler(gameKey);
    if (h.mode === 'AUTO') setPreview(computeAutoOutcome(gameKey, h));
    else if (h.mode === 'MANUAL' && h.manualResult) {
      let detail = 'Manual override active';
      if (gameKey === 'aviator') detail = 'Manual crash @ ' + h.manualResult + 'x';
      else if (gameKey === 'wingo') detail = 'Manual digit: ' + h.manualResult;
      else if (gameKey === 'k3') detail = 'Manual dice: ' + h.manualResult;
      else if (gameKey === 'fived') detail = 'Manual digits: ' + h.manualResult;
      else if (gameKey === 'sunvsmoon') detail = 'Manual side: ' + h.manualResult;
      setPreview({ outcome: h.manualResult, detail });
    } else setPreview(null);
  };

  useEffect(() => { refreshPreview(); }, [handler.mode, handler.targetWinProbability, handler.houseEdge, handler.manualResult, handler.manualTargetRoundId]);

  const applyManual = () => {
    const target = parseInt(targetRound, 10);
    const resolvedTarget = Number.isFinite(target) && target > currentRound ? target : upcomingRound;
    store.setGameHandler(gameKey, { manualResult: manual.trim(), manualTargetRoundId: resolvedTarget, mode: 'MANUAL' });
    setTargetRound(String(resolvedTarget));
    userEditedRoundRef.current = false;
    refreshPreview();
  };
  const saveStakes = () => {
    const vals = [parseFloat(stake1), parseFloat(stake2), parseFloat(stake3), parseFloat(stake4)]
      .filter((n) => Number.isFinite(n) && n > 0).slice(0, 4);
    if (vals.length) store.setGameHandler(gameKey, { quickStakes: vals });
  };

  return (
    <div className="panel p-4 space-y-4 border-neon-500/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2"><Icon className="w-5 h-5 text-neon-300" /> {label} Handling</h2>
          <p className="text-xs text-slate-500">Auto engine · admin override for the next round.</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Mode</p>
          <p className={`tabular font-display font-extrabold text-lg ${handler.mode === 'MANUAL' ? 'text-coral-400' : 'text-neon-300'}`}>{handler.mode}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setMode('AUTO')} className={`panel p-3 text-left transition-all ${handler.mode === 'AUTO' ? 'border-neon-400 ring-1 ring-neon-400/40' : 'opacity-70 hover:opacity-100'}`}>
          <div className="flex items-center gap-2 mb-1"><Shield className={`w-4 h-4 ${handler.mode === 'AUTO' ? 'text-neon-300' : 'text-slate-500'}`} /><span className="font-display font-bold text-white text-sm">Automated</span></div>
          <p className="text-[11px] text-slate-400">Win-probability safeguards revenue.</p>
        </button>
        <button onClick={() => setMode('MANUAL')} className={`panel p-3 text-left transition-all ${handler.mode === 'MANUAL' ? 'border-coral-400 ring-1 ring-coral-400/40' : 'opacity-70 hover:opacity-100'}`}>
          <div className="flex items-center gap-2 mb-1"><Cpu className={`w-4 h-4 ${handler.mode === 'MANUAL' ? 'text-coral-400' : 'text-slate-500'}`} /><span className="font-display font-bold text-white text-sm">Manual Override</span></div>
          <p className="text-[11px] text-slate-400">Hardcode outcome for one queued round.</p>
        </button>
      </div>
      {handler.mode === 'AUTO' && (
        <div className="space-y-4 animate-fade-in">
          <div><div className="flex items-center justify-between mb-1"><label className="text-sm font-semibold text-white flex items-center gap-2"><Sliders className="w-4 h-4 text-neon-300" /> Target Win Probability</label><span className="tabular font-display font-extrabold text-lg text-neon-300">{handler.targetWinProbability}%</span></div>
          <input type="range" min={0} max={100} value={handler.targetWinProbability} onChange={(e) => setProb(parseInt(e.target.value))} className="w-full accent-neon-400 h-2" /></div>
          <div><div className="flex items-center justify-between mb-1"><label className="text-sm font-semibold text-white flex items-center gap-2"><Zap className="w-4 h-4 text-amberx-400" /> House Edge</label><span className="tabular font-bold text-amberx-400">{handler.houseEdge}%</span></div>
          <input type="range" min={0} max={20} value={handler.houseEdge} onChange={(e) => setEdge(parseInt(e.target.value))} className="w-full accent-amberx-400 h-2" /></div>
        </div>
      )}
      {handler.mode === 'MANUAL' && (
        <div className="space-y-2 animate-fade-in">
          <label className="text-sm font-semibold text-white flex items-center gap-2"><Target className="w-4 h-4 text-coral-400" /> {manualLabel}</label>
          <div className="grid grid-cols-2 gap-2">
            <div><p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Outcome</p><input type="text" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={manualPlaceholder} className="input tabular" /></div>
            <div><p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Apply to Round #</p><input type="number" value={targetRound} onChange={(e) => { userEditedRoundRef.current = true; setTargetRound(e.target.value); }} min={upcomingRound} step={1} placeholder={String(upcomingRound)} className="input tabular" /></div>
          </div>
          <button onClick={applyManual} className="btn-coral w-full py-2">Apply Manual Override</button>
          <p className="text-[11px] text-slate-500">
            {manualHint} Queued: <span className="text-coral-300 font-semibold">{handler.manualResult || '—'}</span>.
            <br /><span className="text-emeraldwin-300 font-semibold">✓ Auto-reverts to AUTO after the manual round.</span>
          </p>
        </div>
      )}
      {/* Next Round Preview — auto-updates when handler settings change */}
      <div className="bg-slatepanel-800 rounded-xl p-3 border border-neon-400/30">
        <div className="flex items-center mb-2">
          <label className="text-xs font-semibold text-neon-300 uppercase tracking-wider flex items-center gap-2">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Next Round Preview
          </label>
          {/* Round number badge removed — local counter not shared across sessions */}
        </div>
        {preview ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2"><span className="text-[10px] text-slate-400 uppercase tracking-wider w-16">Outcome</span><span className="font-display font-extrabold text-xl text-white tabular">{preview.outcome}</span></div>
            <div className="flex items-center gap-2"><span className="text-[10px] text-slate-400 uppercase tracking-wider w-16">Detail</span><span className="text-xs text-slate-300">{preview.detail}</span></div>
          </div>
        ) : (<p className="text-xs text-slate-500">Preview will appear automatically.</p>)}
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Quick Stake Chips (4 presets)</label>
        <div className="grid grid-cols-4 gap-2 mb-2">
          <div><p className="text-[9px] text-slate-500 mb-0.5">Stake 1</p><input type="number" value={stake1} onChange={(e) => setStake1(e.target.value)} min={1} className="input tabular text-sm py-1.5 w-full" /></div>
          <div><p className="text-[9px] text-slate-500 mb-0.5">Stake 2</p><input type="number" value={stake2} onChange={(e) => setStake2(e.target.value)} min={1} className="input tabular text-sm py-1.5 w-full" /></div>
          <div><p className="text-[9px] text-slate-500 mb-0.5">Stake 3</p><input type="number" value={stake3} onChange={(e) => setStake3(e.target.value)} min={1} className="input tabular text-sm py-1.5 w-full" /></div>
          <div><p className="text-[9px] text-slate-500 mb-0.5">Stake 4</p><input type="number" value={stake4} onChange={(e) => setStake4(e.target.value)} min={1} className="input tabular text-sm py-1.5 w-full" /></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={saveStakes} className="btn-primary px-4 py-1.5 text-xs">Save Stakes</button>
          <span className="text-[11px] text-slate-500">Current: <span className="text-white tabular">{handler.quickStakes.join(' · ')}</span></span>
        </div>
      </div>
    </div>
  );
}

// ── Individual exported handler panels
export function AviatorHandlingPanel() { return <GameHandlerPanel gameKey="aviator" label="Aviator" icon={Plane} manualLabel="Bust Multiplier (x)" manualPlaceholder="2.00" manualHint="Plane flies away at this multiplier for the queued round." />; }
export function WingoHandlingPanel() { return <GameHandlerPanel gameKey="wingo" label="Win Go" icon={Circle} manualLabel="Result Number (0-9)" manualPlaceholder="5" manualHint="Force the winning digit for the queued draw." />; }
export function K3HandlingPanel() { return <GameHandlerPanel gameKey="k3" label="K3" icon={Dices} manualLabel="Dice Result (a,b,c)" manualPlaceholder="3,3,3" manualHint="Three comma-separated dice values (1-6 each)." />; }
export function FiveDHandlingPanel() { return <GameHandlerPanel gameKey="fived" label="5D" icon={Dices} manualLabel="Result Digits (5)" manualPlaceholder="12345" manualHint="Five-digit outcome, one digit per column." />; }
export function SunMoonHandlingPanel() { return <GameHandlerPanel gameKey="sunvsmoon" label="Sun vs Moon" icon={Sun} manualLabel="Winning Side" manualPlaceholder="sun / moon / eclipse" manualHint="Forces the round outcome to Sun, Eclipse, or Moon." />; }

/** All auto-game handlers rendered together (used in the Handlers tab) */
export function AllGameHandlersSection() {
  return (
    <div className="space-y-4">
      <AviatorHandlingPanel />
      <WingoHandlingPanel />
      <K3HandlingPanel />
      <FiveDHandlingPanel />
      <SunMoonHandlingPanel />
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
    <div className="panel p-4 space-y-3">
      <div>
        <h2 className="font-display font-bold text-lg text-white flex items-center gap-2"><DollarSign className="w-5 h-5 text-emeraldwin-300" /> Global Bet Limits</h2>
        <p className="text-xs text-slate-500">Applies to every game as default · engine rejects out-of-range stakes.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Min Bet ({store.currency})</p>
          <input type="number" value={min} onChange={(e) => setMin(e.target.value)} min={1} step={1} className="input tabular" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Max Bet ({store.currency})</p>
          <input type="number" value={max} onChange={(e) => setMax(e.target.value)} min={1} step={1} className="input tabular" />
        </div>
      </div>
      <button onClick={save} className="btn-emerald w-full py-2">Save Global Limits</button>
      {msg && <p className="text-[11px] text-emeraldwin-300 font-semibold">{msg}</p>}
      <p className="text-[11px] text-slate-500">
        Active: <span className="tabular text-white">{store.currency}{cfg.minBet}</span> – <span className="tabular text-white">{store.currency}{cfg.maxBet}</span>
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-Game Bet Limits (spec §4)
// ─────────────────────────────────────────────────────────────────────────────
export function PerGameBetLimitsPanel() {
  const cfg = useAdminConfig();
  const [expanded, setExpanded] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { min: string; max: string }>>(() => {
    const result: Record<string, { min: string; max: string }> = {};
    gameMeta.forEach((g) => {
      const override = cfg.perGameLimits[g.key];
      result[g.key] = {
        min: override ? String(override.min) : '',
        max: override ? String(override.max) : '',
      };
    });
    return result;
  });
  const [msg, setMsg] = useState<string | null>(null);

  const save = (key: string) => {
    const d = drafts[key];
    const mn = parseFloat(d.min);
    const mx = parseFloat(d.max);
    if (d.min === '' && d.max === '') {
      // Clear override — fall back to global
      store.setGameLimit(key, null);
      setMsg(`${key} cleared — using global limits.`);
    } else if (!Number.isFinite(mn) || !Number.isFinite(mx) || mn <= 0 || mx <= mn) {
      setMsg('Invalid — max must exceed min.');
    } else {
      store.setGameLimit(key, { min: mn, max: mx });
      setMsg(`${key} limits saved.`);
    }
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="panel p-4 space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-neon-300" /> Per-Game Bet Limits
        </h2>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {expanded && (
        <>
          <p className="text-xs text-slate-500">Override global limits for individual games. Leave blank to inherit global min/max.</p>
          <div className="space-y-3">
            {gameMeta.map((g) => {
              const draft = drafts[g.key];
              const override = cfg.perGameLimits[g.key];
              return (
                <div key={g.key} className="bg-slatepanel-800 rounded-xl p-3 border border-borderline-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">{g.label}</span>
                    {override && (
                      <span className="text-[9px] bg-neon-500/20 text-neon-300 px-2 py-0.5 rounded-full border border-neon-400/30">Override active</span>
                    )}
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <p className="text-[9px] text-slate-500 mb-0.5">Min ({store.currency})</p>
                      <input
                        type="number" value={draft.min} placeholder={String(cfg.minBet)}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [g.key]: { ...prev[g.key], min: e.target.value } }))}
                        className="input tabular text-sm py-1.5 w-full"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-[9px] text-slate-500 mb-0.5">Max ({store.currency})</p>
                      <input
                        type="number" value={draft.max} placeholder={String(cfg.maxBet)}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [g.key]: { ...prev[g.key], max: e.target.value } }))}
                        className="input tabular text-sm py-1.5 w-full"
                      />
                    </div>
                    <button onClick={() => save(g.key)} className="btn-primary px-3 py-1.5 text-xs mt-4">Save</button>
                    {override && (
                      <button onClick={() => { store.setGameLimit(g.key, null); setDrafts((prev) => ({ ...prev, [g.key]: { min: '', max: '' } })); }} className="p-1.5 mt-4 rounded-lg bg-coral-500/15 border border-coral-500/30 hover:bg-coral-500/25 transition-colors">
                        <X className="w-3.5 h-3.5 text-coral-400" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {msg && <p className="text-[11px] text-emeraldwin-300 font-semibold">{msg}</p>}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Redeem Code Generator (spec §7 — admin panel)
// ─────────────────────────────────────────────────────────────────────────────
export function RedeemCodeAdminPanel() {
  const [expanded, setExpanded] = useState(true);
  const [newCode, setNewCode] = useState('');
  const [newBonus, setNewBonus] = useState('100');
  const [newMaxUses, setNewMaxUses] = useState('1');
  const [msg, setMsg] = useState<string | null>(null);
  // Trigger re-render by tracking codes locally
  const [codes, setCodes] = useState<RedeemCode[]>(() => store.listRedeemCodes());

  const refresh = () => setCodes(store.listRedeemCodes());

  const addCode = () => {
    const code = newCode.trim().toUpperCase();
    if (!code) { setMsg('Code cannot be empty.'); return; }
    const bonus = parseFloat(newBonus);
    const maxUses = parseInt(newMaxUses, 10);
    if (!Number.isFinite(bonus) || bonus <= 0) { setMsg('Invalid bonus amount.'); return; }
    if (!Number.isFinite(maxUses) || maxUses < 1) { setMsg('Max uses must be at least 1.'); return; }
    store.addRedeemCode(code, bonus, maxUses);
    refresh();
    setNewCode('');
    setNewBonus('100');
    setNewMaxUses('1');
    setMsg(`Code ${code} created.`);
    setTimeout(() => setMsg(null), 2000);
  };

  const deleteCode = (code: string) => {
    store.deleteRedeemCode(code);
    refresh();
  };

  return (
    <div className="panel p-4 space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
          <TicketPercent className="w-5 h-5 text-amberx-300" /> Redeem Code Generator
        </h2>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {expanded && (
        <>
          <p className="text-xs text-slate-500">Create bonus codes. Each code tracks per-user usage — a user can only redeem each code up to the max-uses-per-user limit.</p>

          {/* Create new code form */}
          <div className="bg-slatepanel-800 rounded-xl p-3 border border-borderline-800 space-y-2">
            <p className="text-xs font-bold text-white mb-1">New Redeem Code</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3 sm:col-span-1">
                <p className="text-[9px] text-slate-500 mb-0.5">Code</p>
                <input
                  type="text" value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="e.g. PROMO50" className="input text-sm py-1.5 w-full uppercase" maxLength={20}
                />
              </div>
              <div>
                <p className="text-[9px] text-slate-500 mb-0.5">Bonus ({store.currency})</p>
                <input type="number" value={newBonus} onChange={(e) => setNewBonus(e.target.value)} min={1} step={1} className="input tabular text-sm py-1.5 w-full" />
              </div>
              <div>
                <p className="text-[9px] text-slate-500 mb-0.5">Uses per user</p>
                <input type="number" value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value)} min={1} step={1} className="input tabular text-sm py-1.5 w-full" />
              </div>
            </div>
            <button onClick={addCode} className="btn-primary w-full py-2 flex items-center justify-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Create Code
            </button>
          </div>

          {msg && <p className="text-[11px] text-emeraldwin-300 font-semibold">{msg}</p>}

          {/* Existing codes list */}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {codes.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-4">No redeem codes yet</p>
            )}
            {codes.map((rc) => {
              const totalUses = Object.keys(rc.usageByUser).length;
              return (
                <div key={rc.code} className="flex items-center gap-3 bg-slatepanel-800 rounded-xl p-3 border border-borderline-800">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-sm">{rc.code}</span>
                      <span className="text-[9px] bg-amberx-500/15 border border-amberx-500/30 text-amberx-300 px-1.5 py-0.5 rounded-full">+{store.currency}{rc.bonus}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {totalUses} user{totalUses !== 1 ? 's' : ''} redeemed · max {rc.maxUsesPerUser}/user · created {new Date(rc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteCode(rc.code)}
                    className="flex-shrink-0 w-8 h-8 rounded-lg bg-coral-500/15 border border-coral-500/30 grid place-items-center hover:bg-coral-500/25 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-coral-400" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top Rankings
// ─────────────────────────────────────────────────────────────────────────────
type Range = 'day' | 'week' | 'month' | 'year';
const RANGE_MS: Record<Range, number> = {
  day: 86400_000,
  week: 7 * 86400_000,
  month: 30 * 86400_000,
  year: 365 * 86400_000,
};

export function TopRankingsAdminPanel() {
  const [range, setRange] = useState<Range>('day');
  const [game, setGame] = useState<'crash' | 'mines' | 'aviator' | 'wingo' | 'k3' | 'fived'>('crash');
  const [sort, setSort] = useState<'earnings' | 'recent'>('earnings');

  const rows = useMemo(() => {
    const cutoff = Date.now() - RANGE_MS[range];
    let src;
    if (game === 'crash') src = store.crashLeaderboard;
    else if (game === 'mines') src = store.minesLeaderboard;
    else src = store.crashLeaderboard; // Default to crash for other games for now
    const filtered = src.filter((r) => r.ts >= cutoff);
    filtered.sort((a, b) => (sort === 'earnings' ? b.earnings - a.earnings : b.ts - a.ts));
    return filtered.slice(0, 25);
  }, [range, game, sort]);

  return (
    <div className="panel p-4 space-y-3">
      <div>
        <h2 className="font-display font-bold text-lg text-white flex items-center gap-2"><Trophy className="w-5 h-5 text-amberx-400" /> Top Rankings</h2>
        <p className="text-xs text-slate-500">Global player metrics · mirrors the in-game leaderboard.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <SelectModal
          value={game}
          options={[
            { value: 'crash', label: 'Crash' },
            { value: 'mines', label: 'Mines' },
            { value: 'aviator', label: 'Aviator' },
            { value: 'wingo', label: 'Win Go' },
            { value: 'k3', label: 'K3' },
            { value: 'fived', label: '5D' },
          ]}
          onChange={(v) => setGame(v as 'crash' | 'mines' | 'aviator' | 'wingo' | 'k3' | 'fived')}
        />
        <SelectModal
          value={sort}
          options={[
            { value: 'earnings', label: 'Sort by Earnings' },
            { value: 'recent', label: 'Sort by Recency' },
          ]}
          onChange={(v) => setSort(v as 'earnings' | 'recent')}
        />
        <div className="flex gap-1 ml-auto">
          {(['day', 'week', 'month', 'year'] as Range[]).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase ${range === r ? 'bg-neon-500/20 border border-neon-400/50 text-neon-300' : 'bg-slatepanel-800 border border-borderline-900 text-slate-400'}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto scrollbar-thin">
        <table className="w-full text-[12px]">
          <thead className="text-slate-500 uppercase tracking-wider text-[10px] sticky top-0 bg-slatepanel-900">
            <tr><th className="text-left py-1.5">#</th><th className="text-left">Player</th><th className="text-right">Earnings</th><th className="text-right">Last Seen</th></tr>
          </thead>
          <tbody className="tabular">
            {rows.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-center text-slate-500">No data in selected range.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-borderline-900/60">
                <td className="py-1.5 text-slate-500">{i + 1}</td>
                <td className="text-slate-200 font-semibold">{r.user}</td>
                <td className="text-right text-emeraldwin-300 font-bold">{store.currency}{r.earnings.toFixed(2)}</td>
                <td className="text-right text-slate-500 text-[10px]">{new Date(r.ts).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Online Users Count Panel — admin can control the displayed online count
// with auto-fluctuation (realistic up/down movement every 2–3 s) or fixed mode.
// ─────────────────────────────────────────────────────────────────────────────
export function OnlineCountPanel() {
  const [baseCount, setBaseCount] = useState(150);
  const [autoMode, setAutoMode] = useState(true);
  const [displayCount, setDisplayCount] = useState(150);

  useEffect(() => {
    if (!autoMode) {
      setDisplayCount(baseCount);
      return;
    }
    const tick = () => {
      const delta = Math.round((Math.random() - 0.5) * 14); // ±7 per tick
      setDisplayCount((prev) => {
        const next = prev + delta;
        const lo = Math.max(0, baseCount - 30);
        const hi = baseCount + 30;
        return Math.max(lo, Math.min(hi, next));
      });
    };
    tick();
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = 2000 + Math.random() * 1000; // 2–3 s
      timeoutId = setTimeout(() => { tick(); schedule(); }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [autoMode, baseCount]);

  return (
    <div className="panel p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emeraldwin-300" /> Online Users
          </h2>
          <p className="text-xs text-slate-500">Controls the online count shown to users. Auto mode fluctuates realistically.</p>
        </div>
        <div className="text-center flex-shrink-0">
          <p className="font-display font-extrabold text-3xl text-emeraldwin-300 tabular">{displayCount.toLocaleString()}</p>
          <p className="text-[10px] text-slate-500">currently online</p>
        </div>
      </div>

      {/* Auto / Fixed mode toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setAutoMode(true)}
          className={`panel p-3 text-left transition-all ${autoMode ? 'border-emeraldwin-400 ring-1 ring-emeraldwin-400/40' : 'opacity-70 hover:opacity-100'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw className={`w-4 h-4 ${autoMode ? 'text-emeraldwin-300' : 'text-slate-500'}`} />
            <span className="font-display font-bold text-white text-sm">Auto</span>
          </div>
          <p className="text-[11px] text-slate-400">Realistic ±fluctuation every 2–3 s</p>
        </button>
        <button
          onClick={() => setAutoMode(false)}
          className={`panel p-3 text-left transition-all ${!autoMode ? 'border-neon-400 ring-1 ring-neon-400/40' : 'opacity-70 hover:opacity-100'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <SlidersHorizontal className={`w-4 h-4 ${!autoMode ? 'text-neon-300' : 'text-slate-500'}`} />
            <span className="font-display font-bold text-white text-sm">Fixed</span>
          </div>
          <p className="text-[11px] text-slate-400">Locked to slider value</p>
        </button>
      </div>

      {/* Slider — up/down (vertical feel via range input label) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-semibold text-white flex items-center gap-2">
            <ChevronUp className="w-4 h-4 text-neon-300" /> Base Count
          </label>
          <span className="tabular font-display font-extrabold text-lg text-neon-300">{baseCount}</span>
        </div>
        <input
          type="range"
          min={0} max={5000} step={10}
          value={baseCount}
          onChange={(e) => setBaseCount(parseInt(e.target.value))}
          className="w-full accent-neon-400 h-2"
        />
        <div className="flex justify-between text-[10px] text-slate-500 mt-1">
          <span>0</span>
          <span>1000</span>
          <span>2500</span>
          <span>5000</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top Win Paid Out Panel — shows highest player wins (auto-refreshes every 3 s)
// ─────────────────────────────────────────────────────────────────────────────
export function TopWinPaidOutPanel() {
  const [topWins, setTopWins] = useState<{ username: string; game: string; amount: number; ts: number }[]>([]);

  const loadWins = () => {
    const wins = store.adminHistory
      .filter((r) => r.win > 0)
      .sort((a, b) => b.win - a.win)
      .slice(0, 10)
      .map((r) => ({ username: r.username, game: r.game, amount: r.win, ts: r.ts }));
    setTopWins(wins);
  };

  useEffect(() => {
    loadWins();
    const id = setInterval(loadWins, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="panel p-4 space-y-3">
      <div>
        <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amberx-400" /> Top Win Paid Out
        </h2>
        <p className="text-xs text-slate-500">Highest winnings paid to players · auto-updates every 3 s.</p>
      </div>
      {topWins.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-4">No wins recorded yet.</p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {topWins.map((w, i) => (
            <div key={i} className="flex items-center justify-between bg-slatepanel-800 rounded-xl p-3 border border-borderline-800">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] text-slate-500 font-bold w-5 flex-shrink-0">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{w.username}</p>
                  <p className="text-[10px] text-slate-500 capitalize">{w.game}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-emeraldwin-300">{store.currency}{w.amount.toFixed(2)}</p>
                <p className="text-[10px] text-slate-500">{new Date(w.ts).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Default export — Game Algos Tab content
// ─────────────────────────────────────────────────────────────────────────────
export default function GameAlgosTab() {
  const logos   = useGameLogos();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const onUpload = (key: GameKey, file: File) => {
    if (!file.type.startsWith('image/')) {
      cms.toast({ title: 'Invalid file', body: 'Please upload an image file.', kind: 'warn' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      gameLogos.set(key, reader.result as string);
      cms.toast({ title: 'Logo updated', body: `${key} logo uploaded successfully.`, kind: 'success' });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-white">Game Algorithms & Assets</h2>
        <p className="text-xs text-slate-500">Crash handling is pinned to the top of the dashboard. Manage game logos and redeem codes here.</p>
      </div>

      {/* ── 8 game logos (no ludo) ── */}
      <div className="panel p-4">
        <h3 className="font-display font-bold text-sm text-white mb-1 flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-neon-300" /> Game Logo Upload
        </h3>
        <p className="text-xs text-slate-500 mb-3">Upload custom logos for game cards. Replaces default icons instantly.</p>
        <div className="grid grid-cols-4 gap-3">
          {gameMeta.map((g) => {
            const Icon = g.icon;
            const logo = logos[g.key];
            return (
              <div key={g.key} className="panel-tight p-3 text-center">
                <div className="w-14 h-14 mx-auto rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center overflow-hidden mb-2">
                  {logo ? (
                    <img src={logo} alt={g.label} className="w-full h-full object-contain" />
                  ) : (
                    <Icon className="w-7 h-7 text-slate-500" strokeWidth={1.5} />
                  )}
                </div>
                <p className="text-[10px] font-semibold text-white mb-2 truncate">{g.label}</p>
                <div className="flex gap-1 justify-center">
                  <button onClick={() => fileRefs.current[g.key]?.click()} className="btn-ghost px-2 py-1 text-[10px]">
                    <Upload className="w-3 h-3" /> Upload
                  </button>
                  {logo && (
                    <button onClick={() => gameLogos.remove(g.key)} className="w-7 h-7 rounded-lg bg-coral-500/15 border border-coral-500/40 grid place-items-center">
                      <Trash2 className="w-3 h-3 text-coral-400" />
                    </button>
                  )}
                </div>
                <input
                  ref={(el) => { fileRefs.current[g.key] = el; }}
                  type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && onUpload(g.key, e.target.files[0])}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* spec §7: Redeem code generator */}
      <RedeemCodeAdminPanel />
    </div>
  );
}
