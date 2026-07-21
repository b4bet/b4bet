import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Phase } from './game/useAviatorGame';
import { formatMoney } from './game/format';
import { store } from '../../lib/store';
import { cms } from '../../lib/cms';
import { auth } from '../../lib/auth';
import { bus } from '../../lib/bus';
import { useBetting } from '../../lib/hooks/useBetting';

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
  onPlaceBet: (amount: number) => boolean;
  onCancelBet: (amount: number) => void;
  onCashOut: (amount: number, at: number) => void;
  onWin: (amount: number) => void;
  onInsufficientBalance?: () => void;
  onTimeout?: () => void;
}

// Quick-bet buttons — replace amount
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
  const { placeBet: supabasePlaceBet } = useBetting();

  useEffect(() => {
    setAmountInput(String(bet.amount));
  }, [bet.amount]);

  useEffect(() => {
    setAutoCashoutInput(String(bet.autoCashoutValue));
  }, [bet.autoCashoutValue]);

  // Round transition — fire pending/auto bets for next round.
  useEffect(() => {
    if (bet.roundId !== roundId) {
      setBet((b) => {
        const nextRound = { ...b, roundId, placed: false, cashedOutAt: null, pendingNextRound: false };
        const shouldPlace = b.autoBetEnabled || b.pendingNextRound;
        if (shouldPlace) {
          if (b.amount < limits.min || b.amount > limits.max) {
            nextRound.autoBetEnabled = false;
            nextRound.pendingNextRound = false;
            cms.toast({ title: 'Bet out of range', body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`, kind: 'alert' });
          } else {
            const ok = onPlaceBet(b.amount);
            if (ok) {
              nextRound.placed = true;
            } else {
              // Insufficient balance — clear autobet/pending and warn
              nextRound.autoBetEnabled = false;
              nextRound.pendingNextRound = false;
              onInsufficientBalance?.();
            }
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
      // Auto cash-out must honor the EXACT value entered by the user,
      // not the (possibly higher) current multiplier.
      doCashOut(bet.autoCashoutValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiplier, phase]);

  // Round crashed without cash-out — bet is lost.
  useEffect(() => {
    if (phase === 'crashed' && bet.placed && bet.cashedOutAt === null) {
      setBet((b) => ({ ...b, placed: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const canPlace = phase === 'waiting' && !bet.placed && bet.amount <= balance && countdown > 0;
  const canCashOut = phase === 'flying' && bet.placed && bet.cashedOutAt === null;
  const canCancel = phase === 'waiting' && bet.placed && bet.cashedOutAt === null;
  const isInsufficientBalance = phase === 'waiting' && !bet.placed && bet.amount > balance && countdown > 0;
  // REQ 1: allow queueing a bet for the next round while flying (not yet placed this round)
  const canQueueNextRound = phase === 'flying' && !bet.placed && bet.cashedOutAt === null;
  const canCancelQueue = phase === 'flying' && !bet.placed && bet.pendingNextRound;

  const limits = store.getGameLimits('aviator');

  function adjustAmount(delta: number) {
    setBet((b) => ({
      ...b,
      amount: Math.max(limits.min, Math.min(limits.max, Math.round((b.amount + delta) * 100) / 100)),
    }));
  }

  function setAmount(v: number) {
    setBet((b) => ({ ...b, amount: Math.max(limits.min, Math.min(limits.max, v)) }));
  }

  // Autobet checkbox toggle — if enabling, immediately place bet (if possible)
  function handleAutoBetToggle(enabled: boolean) {
    if (enabled) {
      if (bet.amount < limits.min || bet.amount > limits.max) {
        cms.toast({ title: 'Bet out of range', body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`, kind: 'alert' });
        return;
      }
      if (bet.amount > balance) {
        onInsufficientBalance?.();
        return;
      }
      if (phase === 'waiting' && !bet.placed && countdown > 0) {
        const ok = onPlaceBet(bet.amount);
        if (ok) {
          setBet((b) => ({ ...b, autoBetEnabled: true, placed: true }));
        } else {
          onInsufficientBalance?.();
        }
      } else {
        setBet((b) => ({ ...b, autoBetEnabled: true }));
      }
    } else {
      setBet((b) => ({ ...b, autoBetEnabled: false }));
    }
  }

  function handleBetClick() {
    if (!auth.getSession()) { bus.emit('auth:open_modal' as any, 'login'); return; }
    if (canCashOut) { doCashOut(); return; }
    // Cancel queued next-round bet
    if (canCancelQueue) {
      setBet((b) => ({ ...b, pendingNextRound: false }));
      return;
    }
    // Cancel placed bet during waiting
    if (canCancel) { doCancel(); return; }
    if (isInsufficientBalance) {
      onInsufficientBalance?.();
      return;
    }
    if (canPlace) {
      if (bet.amount < limits.min || bet.amount > limits.max) {
        cms.toast({ title: 'Bet out of range', body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`, kind: 'alert' });
        return;
      }
      // If countdown is essentially at 0, treat as timeout
      if (countdown <= 0.01) {
        onTimeout?.();
        return;
      }
      const ok = onPlaceBet(bet.amount);
      if (ok) {
        setBet((b) => ({ ...b, placed: true }));
      } else {
        onInsufficientBalance?.();
      }
      return;
    }
    // REQ 1: queue bet for next round while flying
    if (canQueueNextRound) {
      if (bet.amount < limits.min || bet.amount > limits.max) {
        cms.toast({ title: 'Bet out of range', body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`, kind: 'alert' });
        return;
      }
      if (bet.amount > balance) {
        onInsufficientBalance?.();
        return;
      }
      setBet((b) => ({ ...b, pendingNextRound: true }));
    }
  }

  function doCancel() {
    if (!canCancel) return;
    const amt = bet.amount;
    setBet((b) => ({ ...b, placed: false }));
    onCancelBet(amt);
  }

  function doCashOut(atOverride?: number) {
    if (!canCashOut) return;
    // For auto cash-out, use the exact multiplier the user configured.
    // For a manual cash-out (no override), use the live multiplier.
    const at = atOverride ?? multiplier;
    const win = bet.amount * at;
    setBet((b) => ({ ...b, cashedOutAt: at }));
    onCashOut(bet.amount, at);
    onWin(win);
  }

  // REQ 3: Bet button is GREEN. REQ 2: live payout only when bet IS placed (canCashOut).
  let betLabel: React.ReactNode = 'BET';
  let betShade = 'bg-aviator-green hover:bg-aviator-green-bright';
  let betShadow = 'shadow-btn-green';

  if (canCashOut) {
    // Show live payout in orange when bet is actively placed and flying
    const livePayout = bet.amount * multiplier;
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-xl font-extrabold tracking-wide">CASH OUT</span>
        <span className="text-sm font-bold opacity-90 tabular-nums">{formatMoney(livePayout)}</span>
      </span>
    );
    betShade = 'bg-aviator-orange hover:bg-aviator-orange-bright';
    betShadow = 'shadow-btn-orange';
  } else if (canCancelQueue) {
    // Queued for next round — cancel queue (cancel state → red)
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-xl font-extrabold tracking-wide">CANCEL</span>
        <span className="text-xs font-semibold opacity-70">Next round</span>
      </span>
    );
    betShade = 'bg-aviator-red hover:bg-aviator-red-bright';
    betShadow = 'shadow-btn-red';
  } else if (canCancel) {
    // REQ 1: only this state is red
    betLabel = 'CANCEL';
    betShade = 'bg-aviator-red hover:bg-aviator-red-bright';
    betShadow = 'shadow-btn-red';
  } else if (phase === 'flying' && bet.placed && bet.cashedOutAt !== null) {
    // Cashed out this round — dim green, disabled
    betShade = 'bg-aviator-green/40';
    betShadow = '';
  } else if (canQueueNextRound) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-xl font-extrabold tracking-wide">BET</span>
        <span className="text-xs font-semibold opacity-70">Next round</span>
      </span>
    );
    // REQ 1: stays green
  } else if (phase === 'crashed') {
    // Fix: crashed phase uses neutral dark gray, not green
    betShade = 'bg-ink-600 opacity-50';
    betShadow = '';
  } else if (!canPlace && !isInsufficientBalance) {
    // Waiting disabled states — dim green
    betShade = 'bg-aviator-green/40';
    betShadow = '';
  }

  // REQ 1: button is only disabled when truly nothing can be done
  const isButtonDisabled = !canPlace && !canCashOut && !canCancel && !isInsufficientBalance && !canQueueNextRound && !canCancelQueue;

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-ink-700 border border-ink-500/60 p-3">
      {/* Top row: checkboxes + auto-withdraw multiplier input */}
      <div className="flex items-center gap-2">
        <CheckboxRow
          label="Autobet"
          checked={bet.autoBetEnabled}
          onChange={handleAutoBetToggle}
        />
        <CheckboxRow
          label="Autowithdrawal"
          checked={bet.autoCashoutEnabled}
          disabled={phase === 'flying'}
          onChange={(v) => setBet((b) => ({ ...b, autoCashoutEnabled: v }))}
        />
        <div
          className={`ml-auto flex items-center gap-1 rounded-lg bg-ink-850 border border-ink-500/70 px-2 py-1.5 shrink-0 ${
            phase === 'flying' ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          <span className="text-xs font-semibold text-gray-400">x</span>
          <input
            type="number"
            step="0.1"
            min="1.01"
            disabled={phase === 'flying'}
            value={autoCashoutInput}
            onChange={(e) => setAutoCashoutInput(e.target.value)}
            onBlur={() => {
              const parsed = parseFloat(autoCashoutInput);
              const safe = isNaN(parsed) || parsed < 1.01 ? 1.01 : parsed;
              const rounded = Math.round(safe * 100) / 100;
              setBet((b) => ({ ...b, autoCashoutValue: rounded }));
              setAutoCashoutInput(String(rounded));
            }}
            className="w-10 bg-transparent text-center font-mono text-sm font-bold text-white tabular-nums outline-none"
          />
        </div>

      </div>

      {/* Bottom row: bet amount controls + BET button */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5 rounded-xl bg-ink-850 border border-ink-500/60 p-1.5">
          <div className="flex items-center">
            <button
              onClick={() => adjustAmount(-10)}
              disabled={bet.placed}
              className="grid h-9 w-9 place-items-center rounded-md bg-ink-700 text-gray-300 hover:bg-ink-650 disabled:opacity-40"
              aria-label="Decrease bet"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="number"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              onBlur={() => {
                const parsed = parseFloat(amountInput);
                const safe = isNaN(parsed) || parsed < 10 ? 10 : Math.min(100000, parsed);
                const rounded = Math.round(safe * 100) / 100;
                setAmount(rounded);
                setAmountInput(String(rounded));
              }}
              disabled={bet.placed}
              className="h-9 w-full min-w-0 bg-transparent text-center font-mono text-base font-bold text-white tabular-nums outline-none disabled:opacity-60"
            />
            <button
              onClick={() => adjustAmount(10)}
              disabled={bet.placed}
              className="grid h-9 w-9 place-items-center rounded-md bg-ink-700 text-gray-300 hover:bg-ink-650 disabled:opacity-40"
              aria-label="Increase bet"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {/* Additive quick-bet buttons */}
          <div className="grid grid-cols-4 gap-1">
            {QUICK_ADDS.map((q) => (
              <button
                key={q.value}
                disabled={bet.placed}
                onClick={() => {
                  // Same button → add; different button → replace
                  const next = Math.min(100000, lastQuickBet === q.value ? bet.amount + q.value : q.value);
                  setLastQuickBet(q.value);
                  setAmount(next);
                  setAmountInput(String(next));
                }}
                className="rounded-md bg-ink-700 border border-ink-500/60 py-1 text-[11px] font-semibold text-gray-300 hover:bg-ink-650 hover:text-white disabled:opacity-40 transition-colors"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleBetClick}
          disabled={isButtonDisabled}
          className={`rounded-xl text-white font-extrabold text-2xl tracking-wide ${betShadow} active:translate-y-0.5 transition-colors ${betShade}`}
        >
          {betLabel}
        </button>
      </div>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex shrink-0 items-center gap-1.5 select-none ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
          checked
            ? 'bg-aviator-green-bright border-aviator-green-bright'
            : 'bg-ink-850 border-ink-500'
        } ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        {checked && (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-black" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M3 8l3.5 3.5L13 5" />
          </svg>
        )}
      </button>
      <span className="whitespace-nowrap text-[11px] sm:text-sm font-semibold text-gray-200">{label}</span>
    </label>
  );
}
