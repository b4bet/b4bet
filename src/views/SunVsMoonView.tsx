/**
 * SunVsMoonView — server-side outcome version.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { store } from '../lib/store';
import { useGameLogos } from '../lib/hooks';
import { bus, Topics } from '../lib/bus';
import type { SunMoonRoundRecord } from '../lib/store';
import { useBalance } from '../lib/hooks';
import { cms } from '../lib/cms';
import { auth } from '../lib/auth';
import { sunMoonLoop, EngineTopics, type SunMoonState } from '../lib/persistentGameEngine';
import { GameService } from '../lib/game-service';

type BetChoice = 'sun' | 'moon' | 'tie';
type Phase = 'betting' | 'processing' | 'revealed';

const BETTING_DURATION = 15;
const YEAR_PREFIX      = 2026;
const PAYOUTS: Record<BetChoice, number> = { sun: 1, moon: 1, tie: 8 };

const QUICK_STAKE_AMOUNTS = [100, 200, 300, 500];

function TimerCircle({ secondsLeft, total }: { secondsLeft: number; total: number }) {
  const radius = 38;
  const circ   = 2 * Math.PI * radius;
  const frac   = secondsLeft / total;
  const offset = circ * (1 - frac);
  const color  = frac > 0.5 ? '#22c55e' : frac > 0.25 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg viewBox="0 0 96 96" className="absolute inset-0 w-full h-full -rotate-90">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle
          cx="48" cy="48" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.4s' }}
        />
      </svg>
      <div className="flex flex-col items-center z-10">
        <span className="text-2xl font-black text-white tabular-nums leading-none">{secondsLeft}</span>
        <span className="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">secs</span>
      </div>
    </div>
  );
}

function BetButton({
  choice, payout, imageSrc, glowColor,
  selected, disabled, onSelect,
}: {
  choice: BetChoice; payout: string; imageSrc: string; glowColor: string;
  selected: boolean; disabled: boolean; onSelect: (c: BetChoice) => void;
}) {
  return (
    <button
      onClick={() => !disabled && onSelect(choice)}
      disabled={disabled}
      className={[
        'flex flex-col items-center justify-center gap-1 rounded-2xl border-2 transition-all duration-200 py-3 px-2 flex-1',
        'active:scale-95',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        selected ? 'scale-[1.04]' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]',
      ].join(' ')}
      style={{
        borderColor:     selected ? glowColor : undefined,
        backgroundColor: selected ? `${glowColor}22` : undefined,
        boxShadow:       selected ? `0 0 18px 4px ${glowColor}55` : undefined,
      }}
    >
      <img src={imageSrc} alt={choice} className="w-14 h-14 object-contain drop-shadow-lg" />
      <span className="text-[10px] text-slate-400 font-semibold">{payout}</span>
    </button>
  );
}

/**
 * Result overlay — covers ONLY the game card (absolute inset-0 inside relative parent).
 * History sections below remain fully visible.
 */
function ResultOverlay({
  visible, result, won, payout, choice,
}: {
  visible: boolean; result: BetChoice | null; won: boolean; payout: number; choice: BetChoice | null;
}) {
  if (!visible || !result) return null;

  const images: Record<BetChoice, string> = { sun: '/sun.png', moon: '/moon.png', tie: '/eclipse.png' };
  const labels: Record<BetChoice, string> = { sun: 'SUN', moon: 'MOON', tie: 'ECLIPSE' };

  return (
    /* absolute inset-0 — fills exactly the game card box, rounded to match card */
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-3xl overflow-hidden bg-black/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 px-6 py-8 w-full">
        <img
          src={images[result]}
          alt={labels[result]}
          className="w-20 h-20 object-contain drop-shadow-2xl"
        />
        <div className="text-center">
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Result</p>
          <p className="text-3xl font-black text-white">{labels[result]}</p>
        </div>

        {choice ? (
          won ? (
            <div className="w-full max-w-[200px] bg-emeraldwin-500/20 border border-emeraldwin-500/40 rounded-2xl px-6 py-4 text-center">
              <p className="text-emeraldwin-400 font-black text-2xl">+₹{payout.toLocaleString()}</p>
              <p className="text-sm text-emeraldwin-300/80 mt-1">YOU WIN!</p>
            </div>
          ) : (
            <div className="w-full max-w-[200px] bg-coral-500/20 border border-coral-500/40 rounded-2xl px-6 py-4 text-center">
              <p className="text-coral-400 font-black text-2xl">LOST</p>
              <p className="text-sm text-coral-300/80 mt-1">Better luck next round</p>
            </div>
          )
        ) : (
          <div className="w-full max-w-[200px] bg-slate-800/60 rounded-2xl px-6 py-4 text-center">
            <p className="text-slate-400 text-sm">No bet placed</p>
          </div>
        )}

        <p className="text-[10px] text-slate-500 animate-pulse">Next round starting soon…</p>
      </div>
    </div>
  );
}

function HistoryStrip({ history }: { history: Array<{ round: number; result: BetChoice }> }) {
  const images: Record<BetChoice, string> = { sun: '/sun.png', moon: '/moon.png', tie: '/eclipse.png' };
  const colors: Record<BetChoice, string> = { sun: '#FFB627', moon: '#818CF8', tie: '#F59E0B' };
  const labels: Record<BetChoice, string> = { sun: 'SUN', moon: 'MOON', tie: 'ECLIPSE' };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Round History</span>
        <span className="text-[10px] text-slate-500">{history.length} rounds</span>
      </div>
      {history.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-4">No rounds yet — play to see history</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {history.map((h) => (
            <div
              key={h.round}
              className="flex-shrink-0 flex flex-col items-center gap-1 rounded-xl py-2 px-2 w-16"
              style={{ background: `${colors[h.result]}18`, border: `1px solid ${colors[h.result]}33` }}
            >
              <span className="text-[9px] font-bold text-white/60">#{h.round}</span>
              <img src={images[h.result]} alt={labels[h.result]} className="w-8 h-8 object-contain" />
              <span className="text-[8px] font-bold uppercase" style={{ color: colors[h.result] }}>
                {labels[h.result]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SunVsMoonView({ onBack }: { onBack?: () => void }) {
  const gameLogos = useGameLogos();
  const balance   = useBalance();

  const [betAmount, setBetAmount] = useState(100);
  const betAmountStr = String(betAmount);

  const initEng = sunMoonLoop.getState();
  const [selectedChoice, setSelectedChoice] = useState<BetChoice | null>(null);
  const [betPlaced, setBetPlaced]           = useState(false);
  const [phase,       setPhase]             = useState<Phase>(initEng.phase);
  const [secondsLeft, setSecondsLeft]       = useState(initEng.secondsLeft);
  const [roundNumber, setRoundNumber]       = useState(YEAR_PREFIX * 10 + initEng.roundId);
  const [result,      setResult]            = useState<BetChoice | null>(initEng.result);
  const [lastWon,     setLastWon]           = useState(false);
  const [lastPayout,  setLastPayout]        = useState(0);
  const [history,     setHistory]           = useState<Array<{ round: number; result: BetChoice }>>(() => {
    const h = sunMoonLoop.getHistory();
    return h.map((r, i) => ({ round: YEAR_PREFIX * 10 + initEng.roundId - (i + 1), result: r }));
  });
  const [myBets, setMyBets] = useState<Array<{
    id: string; round: number; bet: BetChoice; result: BetChoice; stake: number; win: number; ts: number;
  }>>([]);
  const [historyTab, setHistoryTab] = useState<'rounds' | 'my'>('rounds');
  const [settling, setSettling] = useState(false);

  const settledRoundRef   = useRef<number>(-1);
  const selectedChoiceRef = useRef<BetChoice | null>(null);
  const betAmountRef      = useRef<number>(betAmount);
  const betPlacedRef      = useRef(false);
  useEffect(() => { selectedChoiceRef.current = selectedChoice; }, [selectedChoice]);
  useEffect(() => { betAmountRef.current = betAmount; }, [betAmount]);
  useEffect(() => { betPlacedRef.current = betPlaced; }, [betPlaced]);

  useEffect(() => {
    const off = bus.on(EngineTopics.SunMoonState, (payload) => {
      const p = payload as { state: SunMoonState; history: BetChoice[] };
      const s = p.state;
      const rn = YEAR_PREFIX * 10 + s.roundId;
      setRoundNumber(rn);
      setPhase(s.phase);
      setSecondsLeft(s.secondsLeft);
      setResult(s.result);

      if (s.phase === 'betting' && settledRoundRef.current !== -1 && settledRoundRef.current !== rn) {
        setSelectedChoice(null);
        setBetPlaced(false);
      }

      if (s.phase === 'revealed' && s.result && settledRoundRef.current !== rn) {
        settledRoundRef.current = rn;
        const sb      = selectedChoiceRef.current;
        const placed  = betPlacedRef.current;
        const outcome = s.result;

        setHistory((prev) => [{ round: rn, result: outcome }, ...prev].slice(0, 20));

        if (sb !== null && placed) {
          const stake = betAmountRef.current;
          const session = auth.getSession();
          if (!session) return;

          setSettling(true);
          void GameService.sunMoonSettle(session.userId, rn, sb, stake)
            .then((res) => {
              store.setBalance(res.balance_after);
              setLastWon(res.won);
              setLastPayout(res.profit);

              const record: Omit<SunMoonRoundRecord, 'id' | 'ts'> = {
                roundNumber: rn,
                stake,
                bet: sb,
                result: outcome,
                payout: PAYOUTS[sb],
                win: res.won ? res.profit : 0,
              };
              store.recordSunMoonRound(record);
              setMyBets((prev) => [{
                id: Math.random().toString(36).slice(2),
                round: rn,
                bet: sb,
                result: outcome,
                stake,
                win: res.won ? res.profit : 0,
                ts: Date.now(),
              }, ...prev].slice(0, 50));
            })
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : 'Server error';
              cms.toast({ title: 'Settle failed', body: msg, kind: 'alert' });
            })
            .finally(() => setSettling(false));
        }
      }
    });
    return off;
  }, []);

  const handleSelectChoice = useCallback((choice: BetChoice) => {
    if (phase !== 'betting' || betPlaced) return;
    setSelectedChoice((prev) => prev === choice ? null : choice);
  }, [phase, betPlaced]);

  const handlePlaceBet = useCallback(() => {
    if (phase !== 'betting' || betPlaced || selectedChoice === null) return;
    const session = auth.getSession();
    if (!session) {
      bus.emit('auth:open_modal' as Parameters<typeof bus.emit>[0], 'login');
      return;
    }
    const limits = store.getGameLimits('sunvsmoon');
    const stake  = betAmountRef.current;
    if (stake < limits.min || stake > limits.max) {
      cms.toast({ title: 'Bet out of range', body: `Sun vs Moon bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`, kind: 'alert' });
      return;
    }
    if (stake > balance) {
      bus.emit(Topics.InsufficientBalance);
      return;
    }
    store.debit(stake);
    setBetPlaced(true);
  }, [phase, betPlaced, selectedChoice, balance]);

  const handleQuickStake = (amount: number) => {
    if (betPlaced) return;
    setBetAmount((prev) => Math.min(prev + amount, balance));
  };

  const handleAmountInput = (val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0) setBetAmount(n);
    else if (val === '') setBetAmount(0);
  };

  const adjustAmount = (delta: number) => {
    setBetAmount((prev) => Math.max(10, Math.min(balance, Math.round(prev + delta))));
  };

  const limits          = store.getGameLimits('sunvsmoon');
  const canPlaceBet     = phase === 'betting' && !betPlaced && !settling && selectedChoice !== null && betAmount > 0;
  const canSelectChoice = phase === 'betting' && !betPlaced;

  return (
    <div className="relative space-y-4 animate-fade-in px-3">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mt-2 mb-1">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/40 transition-colors">
              <ArrowLeft className="w-4 h-4 text-slate-300" />
            </button>
          )}
          {gameLogos["sunvsmoon"] ? (
            <img
              src={gameLogos["sunvsmoon"]}
              alt="Sun vs Moon"
              className="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-2 ring-yellow-500/30"
            />
          ) : (
            <img
              src="/eclipse.png"
              alt="Sun vs Moon"
              className="w-10 h-10 rounded-full object-contain flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).src = '/sun.png'; }}
            />
          )}
          <div>
            <p className="text-sm font-black text-white leading-none">Sun vs Moon</p>
            <p className="text-[9px] text-slate-400 mt-0.5">Round #{roundNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slatepanel-800 border border-borderline-900">
          <span className="text-white text-xs font-bold tabular-nums whitespace-nowrap">
            {store.currency}{balance.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* ── Game card — relative so overlay stays inside it ── */}
      <div className="relative rounded-3xl bg-slatepanel-900 border border-borderline-900 overflow-hidden">

        {/* Result overlay — absolute, covers only this card */}
        <ResultOverlay
          visible={phase === 'revealed'}
          result={result}
          won={lastWon}
          payout={lastPayout}
          choice={betPlaced ? selectedChoice : null}
        />

        <div className="p-4 space-y-4">

          {/* Timer / Processing */}
          <div className="flex flex-col items-center gap-2">
            {phase === 'betting' ? (
              <>
                <TimerCircle secondsLeft={secondsLeft} total={BETTING_DURATION} />
                {betPlaced && (
                  <p className="text-[11px] text-slate-400">
                    Bet on {selectedChoice === 'tie' ? 'ECLIPSE' : selectedChoice?.toUpperCase()} — waiting for result
                  </p>
                )}
              </>
            ) : phase === 'processing' ? (
              <div className="py-6 flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-4 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                <p className="text-sm font-bold text-amber-300">{settling ? 'Settling…' : 'Processing result…'}</p>
              </div>
            ) : null}
          </div>

          {/* Direction selector buttons */}
          {phase !== 'processing' && (
            <div className="flex items-stretch gap-2">
              <BetButton
                choice="sun" payout="1:1" imageSrc="/sun.png" glowColor="#FFB627"
                selected={selectedChoice === 'sun'} disabled={!canSelectChoice}
                onSelect={handleSelectChoice}
              />
              <BetButton
                choice="tie" payout="8:1" imageSrc="/eclipse.png" glowColor="#F59E0B"
                selected={selectedChoice === 'tie'} disabled={!canSelectChoice}
                onSelect={handleSelectChoice}
              />
              <BetButton
                choice="moon" payout="1:1" imageSrc="/moon.png" glowColor="#818CF8"
                selected={selectedChoice === 'moon'} disabled={!canSelectChoice}
                onSelect={handleSelectChoice}
              />
            </div>
          )}

          {/* Amount controls */}
          {phase === 'betting' && !betPlaced && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">Bet Amount</p>
                <div className="flex gap-2">
                  <span className="text-[9px] text-slate-500">Min: <span className="text-slate-400 font-semibold">₹{limits.min}</span></span>
                  <span className="text-[9px] text-slate-500">Max: <span className="text-slate-400 font-semibold">₹{limits.max.toLocaleString()}</span></span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjustAmount(-50)}
                  className="w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 text-slate-300 hover:border-neon-400/40 transition-colors text-lg font-bold"
                >−</button>
                <input
                  type="text"
                  inputMode="decimal"
                  value={betAmountStr}
                  onChange={(e) => handleAmountInput(e.target.value)}
                  className="flex-1 bg-slatepanel-800 border border-borderline-900 rounded-xl px-3 py-2 text-center text-white font-bold text-sm focus:outline-none focus:border-neon-400/60"
                />
                <button
                  onClick={() => adjustAmount(50)}
                  className="w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 text-slate-300 hover:border-neon-400/40 transition-colors text-lg font-bold"
                >+</button>
              </div>
              <div className="flex gap-2">
                {QUICK_STAKE_AMOUNTS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleQuickStake(s)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors bg-slatepanel-800 border-borderline-900 text-slate-300 hover:border-neon-400/50 hover:text-neon-300 active:scale-95"
                  >
                    +{s >= 1000 ? `${s / 1000}K` : s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PLACE BET button */}
          {phase === 'betting' && !betPlaced && (
            <button
              onClick={handlePlaceBet}
              disabled={!canPlaceBet}
              className={[
                'w-full py-3.5 rounded-2xl font-black text-sm tracking-wide transition-all active:scale-[0.97]',
                canPlaceBet
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-black shadow-lg shadow-amber-500/30 hover:brightness-110 cursor-pointer'
                  : 'bg-slatepanel-800 border border-borderline-900 text-slate-500 cursor-not-allowed opacity-60',
              ].join(' ')}
            >
              {selectedChoice === null
                ? 'Select SUN / ECLIPSE / MOON first'
                : betAmount <= 0
                  ? 'Enter bet amount'
                  : `PLACE BET — ₹${betAmount.toLocaleString()}`}
            </button>
          )}

          {/* Bet placed bar */}
          {phase === 'betting' && betPlaced && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2.5">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
              <p className="text-xs font-bold text-amber-300">
                ₹{betAmount.toLocaleString()} on {selectedChoice === 'tie' ? 'ECLIPSE' : selectedChoice?.toUpperCase()} — waiting for result
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── History — always visible, even during result overlay ── */}
      <div className="rounded-2xl bg-slatepanel-900 border border-borderline-900 p-4 space-y-4">
        <div className="flex gap-1 bg-slatepanel-800/60 rounded-xl p-1">
          {(['rounds', 'my'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setHistoryTab(tab)}
              className={[
                'flex-1 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors',
                historyTab === tab ? 'bg-slatepanel-700 text-white' : 'text-slate-500 hover:text-slate-300',
              ].join(' ')}
            >
              {tab === 'rounds' ? 'Round History' : 'My Bets'}
            </button>
          ))}
        </div>

        {historyTab === 'rounds' && <HistoryStrip history={history} />}

        {historyTab === 'my' && (
          <div className="space-y-2">
            {myBets.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">Place a bet to see your history here</p>
            ) : (
              myBets.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-xl bg-slatepanel-800/60 border border-borderline-900 px-3 py-2.5">
                  <img src={`/${b.result}.png`} alt={b.result} className="w-8 h-8 object-contain flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white">#{b.round}</p>
                    <p className="text-[10px] text-slate-400">
                      Bet {b.bet === 'tie' ? 'ECLIPSE' : b.bet.toUpperCase()} · Result {b.result === 'tie' ? 'ECLIPSE' : b.result.toUpperCase()}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-black ${b.win > 0 ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                      {b.win > 0 ? `+₹${b.win.toLocaleString()}` : `-₹${b.stake.toLocaleString()}`}
                    </p>
                    <p className="text-[9px] text-slate-500">Stake ₹{b.stake.toLocaleString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
