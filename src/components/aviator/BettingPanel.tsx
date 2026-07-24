import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Phase } from './game/useAviatorGame';
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
  onPlaceBet: (amount: number) => Promise<boolean>;
  onCancelBet: (amount: number, betId: string | null) => void;
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

  // Round transition — fire pending/auto bets for next round
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
            void onPlaceBet(b.amount).then((ok) => {
              if (!ok) {
                setBet((bb) => ({ ...bb, autoBetEnabled: false, pendingNextRound: false, placed: false }));
                onInsufficientBalance?.();
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

  // Auto cash-out trigger
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

  // Round crashed — settle lost bet
  useEffect(() => {
    if (phase === 'crashed' && bet.placed && bet.cashedOutAt === null) {
      const session = auth.getSession();
      if (session) {
        const roundUuid = aviatorLoop.getRoundUuid();
        void import('../../lib/game-service').then(({ GameService }) => {
          void GameService.aviatorSettle(session.userId, roundUuid, bet.amount)
            .then((res) => { if (res.crash_point) aviatorLoop.reportServerCrash(res.crash_point); })
            .catch(() => {});
        });
      }
      setBet((b) => ({ ...b, placed: false, betId: null }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Cancel only allowed during waiting phase
  const canCancel = phase === 'waiting' && bet.placed && bet.cashedOutAt === null;
  const canPlace = phase === 'waiting' && !bet.placed && bet.amount <= balance && countdown > 0;
  // Cash out only during flying
  const canCashOut = phase === 'flying' && bet.placed && bet.cashedOutAt === null;
  const isInsufficientBalance = phase === 'waiting' && !bet.placed && bet.amount > balance && countdown > 0;
  // Queue next round only during flying when not placed
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
        void onPlaceBet(bet.amount).then((ok) => {
          if (ok) {
            setBet((b) => ({ ...b, autoBetEnabled: true, placed: true, placedAtMs: Date.now() }));
          } else {
            onInsufficientBalance?.();
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
      void onPlaceBet(bet.amount).then((ok) => {
        if (ok) {
          setBet((b) => ({ ...b, placed: true, placedAtMs: Date.now() }));
        } else {
          onInsufficientBalance?.();
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
    const betId = bet.betId;
    setBet((b) => ({ ...b, placed: false, betId: null }));
    onCancelBet(amt, betId);
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
        if (res.crash_point !== null) aviatorLoop.reportServerCrash(res.crash_point);
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
        <span>CASH OUT</span>
        <span className="text-xs font-normal">{multiplier.toFixed(2)}x · {formatMoney(livePayout)}</span>
      </span>
    );
    betShade = 'bg-aviator-orange hover:bg-aviator-orange-bright';
    betShadow = 'shadow-btn-orange';
  } else if (canCancelQueue) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span>CANCEL</span>
        <span className="text-xs font-normal">Next round</span>
      </span>
    );
    betShade = 'bg-aviator-red hover:bg-aviator-red-bright';
    betShadow = 'shadow-btn-red';
  } else if (canCancel) {
    betLabel = 'CANCEL';
    betShade = 'bg-aviator-red hover:bg-aviator-red-bright';
    betShadow = 'shadow-btn-red';
  } else if (phase === 'flying' && bet.placed && bet.cashedOutAt !== null) {
    // Already cashed out this round
    const winAmt = bet.amount * (bet.cashedOutAt ?? 1);
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span>CASHED OUT</span>
        <span className="text-xs font-normal">{bet.cashedOutAt?.toFixed(2)}x · {formatMoney(winAmt)}</span>
      </span>
    );
    betShade = 'bg-aviator-green/40';
    betShadow = '';
  } else if (canQueueNextRound) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span>BET NEXT</span>
        <span className="text-xs font-normal">Round</span>
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
    <div className="flex flex-col gap-2 p-2 rounded-xl bg-ink-800 border border-ink-600">
      {/* Top row: auto cashout + auto bet */}
      <div className="flex items-center gap-3 px-1">
        <label className="flex items-center gap-1.5 text-xs text-ink-300 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-3.5 h-3.5 accent-aviator-green"
            checked={bet.autoCashoutEnabled}
            onChange={(e) => setBet((b) => ({ ...b, autoCashoutEnabled: e.target.checked }))}
          />
          Auto
        </label>
        <input
          type="number"
          className="w-16 text-xs text-center rounded bg-ink-700 border border-ink-500 text-white px-1 py-0.5 [appearance:textfield]"
          value={autoCashoutInput}
          min="1.01"
          step="0.1"
          onChange={(e) => setAutoCashoutInput(e.target.value)}
          onBlur={() => {
            const v = parseFloat(autoCashoutInput);
            if (!isNaN(v) && v >= 1.01) setBet((b) => ({ ...b, autoCashoutValue: Math.round(v * 100) / 100 }));
            else setAutoCashoutInput(String(bet.autoCashoutValue));
          }}
          disabled={bet.placed}
        />
        <span className="text-xs text-ink-400">x</span>
        <label className="flex items-center gap-1.5 text-xs text-ink-300 cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            className="w-3.5 h-3.5 accent-aviator-green"
            checked={bet.autoBetEnabled}
            onChange={(e) => handleAutoBetToggle(e.target.checked)}
          />
          Auto Bet
        </label>
      </div>

      {/* Amount row */}
      <div className="flex items-center gap-1">
        <button
          className="w-7 h-7 flex items-center justify-center rounded bg-ink-700 hover:bg-ink-600 text-white disabled:opacity-40"
          onClick={() => adjustAmount(-100)}
          disabled={bet.placed || phase === 'flying'}
        >
          <Minus size={12} />
        </button>
        <input
          type="number"
          className="flex-1 text-center text-sm font-semibold rounded bg-ink-700 border border-ink-500 text-white px-2 py-1 [appearance:textfield]"
          value={amountInput}
          min={limits.min}
          max={limits.max}
          onChange={(e) => setAmountInput(e.target.value)}
          onBlur={() => {
            const v = parseFloat(amountInput);
            if (!isNaN(v)) setAmount(v);
            else setAmountInput(String(bet.amount));
          }}
          disabled={bet.placed || phase === 'flying'}
        />
        <button
          className="w-7 h-7 flex items-center justify-center rounded bg-ink-700 hover:bg-ink-600 text-white disabled:opacity-40"
          onClick={() => adjustAmount(100)}
          disabled={bet.placed || phase === 'flying'}
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Quick-bet buttons */}
      <div className="flex gap-1">
        {QUICK_ADDS.map(({ label, value }) => (
          <button
            key={value}
            className={`flex-1 text-xs py-1 rounded font-medium transition-colors ${
              lastQuickBet === value
                ? 'bg-aviator-green text-black'
                : 'bg-ink-700 hover:bg-ink-600 text-ink-200'
            } disabled:opacity-40`}
            onClick={() => { setAmount(value); setLastQuickBet(value); }}
            disabled={bet.placed || phase === 'flying'}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main action button */}
      <button
        className={`w-full py-3 rounded-lg font-bold text-white text-sm transition-all ${betShade} ${betShadow} disabled:opacity-50 disabled:cursor-not-allowed`}
        onClick={handleBetClick}
        disabled={isButtonDisabled}
      >
        {betLabel}
      </button>
    </div>
  );
}
