import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Phase } from './game/useAviatorGame';
import type { PlaceBetResult } from './AviatorGame';
import { formatMoney } from './game/format';
import { store } from '../../lib/store';
import { cms } from '../../lib/cms';
import { auth } from '../../lib/auth';
import { bus } from '../../lib/bus';
import { aviatorLoop } from '../../lib/persistentGameEngine';

export interface BetState {
  amount: number;
  mode: 'bet' | 'auto';
  placed: boolean;
  cashedOutAt: number | null;
  autoCashoutEnabled: boolean;
  autoCashoutValue: number;
  autoBetEnabled: boolean;
  pendingNextRound: boolean;
  roundId: number;
  placedAtMs: number;
  betId: string | null;
}

export function createInitialBet(roundId: number): BetState {
  return {
    amount: 100,
    mode: 'bet',
    placed: false,
    cashedOutAt: null,
    autoCashoutEnabled: false,
    autoCashoutValue: 2.0,
    autoBetEnabled: false,
    pendingNextRound: false,
    roundId,
    placedAtMs: 0,
    betId: null,
  };
}

interface BettingPanelProps {
  bet: BetState;
  setBet: (updater: (b: BetState) => BetState) => void;
  phase: Phase;
  multiplier: number;
  countdown: number;
  roundId: number;
  balance: number;
  onPlaceBet: (amount: number) => Promise<PlaceBetResult>;
  onCancelBet: (amount: number, betId?: string | null) => void;
  onCashOut: (amount: number, at: number) => void;
  onWin: (amount: number) => void;
  onInsufficientBalance?: () => void;
  onTimeout?: () => void;
}

const QUICK_ADDS: { label: string; value: number }[] = [
  { label: '200', value: 200 },
  { label: '500', value: 500 },
  { label: '1K', value: 1000 },
  { label: '2K', value: 2000 },
];

export function BettingPanel({
  bet,
  setBet,
  phase,
  multiplier,
  countdown,
  roundId,
  balance,
  onPlaceBet,
  onCancelBet,
  onCashOut,
  onWin,
  onInsufficientBalance,
  onTimeout,
}: BettingPanelProps) {
  const [amountInput, setAmountInput] = useState<string>(String(bet.amount));
  const [autoCashoutInput, setAutoCashoutInput] = useState<string>(String(bet.autoCashoutValue));
  const [lastQuickBet, setLastQuickBet] = useState<number | null>(null);

  useEffect(() => { setAmountInput(String(bet.amount)); }, [bet.amount]);
  useEffect(() => { setAutoCashoutInput(String(bet.autoCashoutValue)); }, [bet.autoCashoutValue]);

  const limits = store.getGameLimits('aviator');

  // Round transition — fire pending/auto bets for next round.
  useEffect(() => {
    if (bet.roundId !== roundId) {
      setBet((b) => {
        const nextRound = { ...b, roundId, placed: false, cashedOutAt: null, pendingNextRound: false, betId: null };
        const shouldPlace = b.autoBetEnabled || b.pendingNextRound;
        if (shouldPlace) {
          if (b.amount < limits.min || b.amount > limits.max) {
            nextRound.autoBetEnabled = false;
            nextRound.pendingNextRound = false;
            cms.toast({ title: 'Bet out of range', body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`, kind: 'alert' });
          } else {
            void onPlaceBet(b.amount).then((res) => {
              if (!res.ok) {
                setBet((bb) => ({ ...bb, autoBetEnabled: false, pendingNextRound: false, placed: false }));
                if (res.reason === 'insufficient') onInsufficientBalance?.();
              }
            });
            nextRound.placed = true;
            nextRound.placedAtMs = Date.now();
          }
        }
        return nextRound;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  // Auto cash-out trigger.
  useEffect(() => {
    if (
      bet.placed &&
      bet.cashedOutAt === null &&
      bet.autoCashoutEnabled &&
      phase === 'flying' &&
      multiplier >= bet.autoCashoutValue
    ) {
      void doCashOut(bet.autoCashoutValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiplier, phase]);

  // Round crashed without cash-out — bet is lost.
  useEffect(() => {
    if (phase === 'crashed' && bet.placed && bet.cashedOutAt === null) {
      const session = auth.getSession();
      if (session) {
        void import('../../lib/game-service').then(({ GameService }) => {
          void GameService.aviatorSettle(
            session.userId,
            aviatorLoop.getRoundUuid(),
            bet.roundId,
            bet.amount,
          )
            .then((res) => {
              if (res.crash_point) {
                aviatorLoop.reportServerCrash(res.crash_point);
              }
            })
            .catch(() => { /* non-fatal */ });
        });
      }
      setBet((b) => ({ ...b, placed: false, betId: null }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const canPlace = phase === 'waiting' && !bet.placed && bet.amount <= balance && countdown > 0;
  const canCashOut = phase === 'flying' && bet.placed && bet.cashedOutAt === null;
  const canCancel = phase === 'waiting' && bet.placed && bet.cashedOutAt === null;
  const isInsufficientBalance = phase === 'waiting' && !bet.placed && bet.amount > balance && countdown > 0;
  const canQueueNextRound = phase === 'flying' && !bet.placed && bet.cashedOutAt === null;
  const canCancelQueue = phase === 'flying' && !bet.placed && bet.pendingNextRound;

  function adjustAmount(delta: number) {
    setBet((b) => ({
      ...b,
      amount: Math.max(limits.min, Math.min(limits.max, Math.round((b.amount + delta) * 100) / 100)),
    }));
  }

  function setAmount(v: number) {
    setBet((b) => ({ ...b, amount: Math.max(limits.min, Math.min(limits.max, v)) }));
  }

  function handleAutoBetToggle(enabled: boolean) {
    if (enabled) {
      if (bet.amount < limits.min || bet.amount > limits.max) {
        cms.toast({ title: 'Bet out of range', body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`, kind: 'alert' });
        return;
      }
      if (bet.amount > balance) { onInsufficientBalance?.(); return; }
      if (phase === 'waiting' && !bet.placed && countdown > 0) {
        void onPlaceBet(bet.amount).then((res) => {
          if (res.ok) {
            setBet((b) => ({ ...b, autoBetEnabled: true, placed: true, placedAtMs: Date.now() }));
          } else {
            if (res.reason === 'insufficient') onInsufficientBalance?.();
          }
        });
      } else {
        setBet((b) => ({ ...b, autoBetEnabled: true }));
      }
    } else {
      setBet((b) => ({ ...b, autoBetEnabled: false }));
    }
  }

  function handleBetClick() {
    if (!auth.getSession()) { bus.emit('auth:open_modal' as Parameters<typeof bus.emit>[0], 'login'); return; }
    if (canCashOut) { void doCashOut(); return; }
    if (canCancelQueue) { setBet((b) => ({ ...b, pendingNextRound: false })); return; }
    if (canCancel) { doCancel(); return; }
    if (isInsufficientBalance) { onInsufficientBalance?.(); return; }
    if (canPlace) {
      if (bet.amount < limits.min || bet.amount > limits.max) {
        cms.toast({ title: 'Bet out of range', body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`, kind: 'alert' });
        return;
      }
      if (countdown <= 0.01) { onTimeout?.(); return; }
      void onPlaceBet(bet.amount).then((res) => {
        if (res.ok) {
          setBet((b) => ({ ...b, placed: true, placedAtMs: Date.now() }));
        } else {
          if (res.reason === 'insufficient') onInsufficientBalance?.();
        }
      });
      return;
    }
    if (canQueueNextRound) {
      if (bet.amount < limits.min || bet.amount > limits.max) {
        cms.toast({ title: 'Bet out of range', body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`, kind: 'alert' });
        return;
      }
      if (bet.amount > balance) { onInsufficientBalance?.(); return; }
      setBet((b) => ({ ...b, pendingNextRound: true }));
    }
  }

  function doCancel() {
    if (!canCancel) return;
    const amt = bet.amount;
    const id = bet.betId;
    setBet((b) => ({ ...b, placed: false, betId: null }));
    onCancelBet(amt, id);
  }

  async function doCashOut(atOverride?: number) {
    if (!canCashOut) return;
    const at = atOverride ?? multiplier;
    setBet((b) => ({ ...b, cashedOutAt: at }));

    try {
      const res = await aviatorLoop.cashoutBet(bet.amount, bet.placedAtMs, at, bet.betId);
      if (res.won && res.win > 0) {
        store.setBalance(res.balance_after);
        onCashOut(bet.amount, res.cashout_at ?? at);
        onWin(res.win);
      } else {
        if (res.crash_point !== null) {
          aviatorLoop.reportServerCrash(res.crash_point);
        }
      }
    } catch {
      cms.toast({ title: 'Cashout error', body: 'Could not confirm cashout. Please check your balance.', kind: 'alert' });
    }
  }

  // ── Button appearance ──────────────────────────────────────────────────────
  let betLabel: React.ReactNode = 'BET';
  let betShade = 'bg-aviator-green hover:bg-aviator-green-bright';
  let betShadow = 'shadow-btn-green';

  if (canCashOut) {
    const livePayout = bet.amount * multiplier;
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-xs font-semibold tracking-wider">CASH OUT</span>
        <span className="text-sm font-bold">{formatMoney(livePayout)}</span>
      </span>
    );
    betShade = 'bg-aviator-orange hover:bg-aviator-orange-bright';
    betShadow = 'shadow-btn-orange';
  } else if (canCancelQueue) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-xs font-semibold tracking-wider">CANCEL</span>
        <span className="text-[10px] opacity-70">Next round</span>
      </span>
    );
    betShade = 'bg-aviator-red hover:bg-aviator-red-bright';
    betShadow = 'shadow-btn-red';
  } else if (canCancel) {
    betLabel = 'CANCEL';
    betShade = 'bg-aviator-red hover:bg-aviator-red-bright';
    betShadow = 'shadow-btn-red';
  } else if (phase === 'flying' && bet.placed && bet.cashedOutAt !== null) {
    betShade = 'bg-aviator-green/40';
    betShadow = '';
  } else if (canQueueNextRound) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-xs font-semibold tracking-wider">BET</span>
        <span className="text-[10px] opacity-70">Next round</span>
      </span>
    );
  } else if (phase === 'crashed') {
    betShade = 'bg-ink-600 opacity-50';
    betShadow = '';
  } else if (!canPlace && !isInsufficientBalance) {
    betShade = 'bg-aviator-green/40';
    betShadow = '';
  }

  const isButtonDisabled = !canPlace && !canCashOut && !canCancel && !isInsufficientBalance && !canQueueNextRound && !canCancelQueue;

  return (
    <div className="flex-1 bg-[#1a1f2e] rounded-xl p-3 flex flex-col gap-2 border border-white/5 min-w-0">
      {/* Top row: auto-cashout controls */}
      <div className="flex items-center gap-2 text-xs">
        <label className="flex items-center gap-1 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-3 h-3 accent-green-500"
            checked={bet.autoBetEnabled}
            onChange={(e) => handleAutoBetToggle(e.target.checked)}
          />
          <span className="text-white/60">Auto</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer select-none ml-auto">
          <span className="text-white/60">Auto W/D</span>
          <button
            type="button"
            className={`w-8 h-4 rounded-full transition-colors ${
              bet.autoCashoutEnabled ? 'bg-green-500' : 'bg-white/20'
            }`}
            onClick={() => setBet((b) => ({ ...b, autoCashoutEnabled: !b.autoCashoutEnabled }))}
          >
            <span
              className={`block w-3 h-3 rounded-full bg-white shadow transition-transform mx-0.5 ${
                bet.autoCashoutEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </label>
        {bet.autoCashoutEnabled && (
          <div className="flex items-center gap-0.5">
            <input
              type="number"
              min="1.1"
              step="0.1"
              className="w-12 bg-white/10 rounded px-1 py-0.5 text-white text-xs text-right focus:outline-none"
              value={autoCashoutInput}
              onChange={(e) => {
                setAutoCashoutInput(e.target.value);
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 1.1) setBet((b) => ({ ...b, autoCashoutValue: v }));
              }}
            />
            <span className="text-white/40">x</span>
          </div>
        )}
      </div>

      {/* Amount row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer"
          onClick={() => adjustAmount(-50)}
        >
          <Minus className="w-3 h-3" />
        </button>
        <input
          type="number"
          min={limits.min}
          max={limits.max}
          className="flex-1 bg-white/10 rounded-lg px-2 py-1.5 text-white text-sm font-bold text-center focus:outline-none min-w-0"
          value={amountInput}
          onChange={(e) => {
            setAmountInput(e.target.value);
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) setAmount(v);
          }}
          onBlur={() => setAmountInput(String(bet.amount))}
        />
        <button
          type="button"
          className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer"
          onClick={() => adjustAmount(50)}
        >
          <Plus className="w-3 h-3" />
        </button>
        <button
          type="button"
          disabled={isButtonDisabled}
          className={`h-10 px-3 rounded-xl font-bold text-white transition-all flex items-center justify-center flex-shrink-0 cursor-pointer ${
            betShade
          } ${betShadow} disabled:opacity-40 disabled:cursor-not-allowed`}
          style={{ minWidth: '72px' }}
          onClick={handleBetClick}
        >
          {betLabel}
        </button>
      </div>

      {/* Quick bet row */}
      <div className="flex gap-1">
        {QUICK_ADDS.map(({ label, value }) => (
          <button
            key={value}
            type="button"
            className={`flex-1 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              lastQuickBet === value
                ? 'bg-aviator-green text-white'
                : 'bg-white/10 hover:bg-white/20 text-white/70'
            }`}
            onClick={() => {
              setLastQuickBet(value);
              setAmount(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
