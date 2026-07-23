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
  /** Timestamp (ms) when the bet was placed — sent to server for timing validation */
  placedAtMs: number;
  /** Server-assigned bet ID returned by aviator_place_bet. Used for direct cashout lookup. */
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
  /** Returns { ok, betId, reason } — reason is 'insufficient_balance' | 'phase_closed' | 'network' | null */
  onPlaceBet: (amount: number, placedAtMs: number) => Promise<{ ok: boolean; betId: string | null; reason?: string | null }>;
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

  useEffect(() => { setAmountInput(String(bet.amount)); }, [bet.amount]);
  useEffect(() => { setAutoCashoutInput(String(bet.autoCashoutValue)); }, [bet.autoCashoutValue]);

  const limits = store.getGameLimits('aviator');

  // ── Round transition: fire auto/pending bets for next round ───────────────
  useEffect(() => {
    if (bet.roundId === roundId) return;

    // Capture values before state update
    const prevAmount = bet.amount;
    const prevAutoBetEnabled = bet.autoBetEnabled;
    const prevPendingNextRound = bet.pendingNextRound;
    const shouldPlace = (prevAutoBetEnabled || prevPendingNextRound)
      && prevAmount >= limits.min
      && prevAmount <= limits.max
      && prevAmount <= balance;

    const nowMs = Date.now();

    // Update round state immediately (optimistic for auto/pending bets)
    setBet((b) => ({
      ...b,
      roundId,
      placed: shouldPlace,
      cashedOutAt: null,
      pendingNextRound: false,
      betId: null,
      placedAtMs: shouldPlace ? nowMs : 0,
    }));

    if (shouldPlace) {
      onPlaceBet(prevAmount, nowMs)
        .then(({ ok, betId, reason }) => {
          if (ok) {
            setBet((bb) => ({ ...bb, betId: betId ?? null }));
          } else {
            // Bet rejected — undo placed state
            setBet((bb) => ({
              ...bb,
              placed: false,
              betId: null,
              // Only kill autobet if balance ran out
              autoBetEnabled: reason === 'insufficient_balance' ? false : bb.autoBetEnabled,
              pendingNextRound: reason === 'insufficient_balance' ? false : bb.pendingNextRound,
            }));
            if (reason === 'insufficient_balance') onInsufficientBalance?.();
          }
        })
        .catch(() => {
          setBet((bb) => ({ ...bb, placed: false, betId: null }));
        });
    } else if (prevAutoBetEnabled || prevPendingNextRound) {
      // Wanted to auto-place but couldn't (out of range or balance)
      if (prevAmount < limits.min || prevAmount > limits.max) {
        setBet((b) => ({ ...b, autoBetEnabled: false, pendingNextRound: false }));
        cms.toast({ title: 'Bet out of range', body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`, kind: 'alert' });
      } else if (prevAmount > balance) {
        setBet((b) => ({ ...b, autoBetEnabled: false, pendingNextRound: false }));
        onInsufficientBalance?.();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  // ── Auto cash-out trigger ─────────────────────────────────────────────────
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

  // ── Crash without cashout: settle loss ───────────────────────────────────
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
              if (res.crash_point) aviatorLoop.reportServerCrash(res.crash_point);
            })
            .catch(() => {});
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
        const nowMs = Date.now();
        // Optimistically mark placed, then confirm with server
        setBet((b) => ({ ...b, autoBetEnabled: true, placed: true, placedAtMs: nowMs }));
        onPlaceBet(bet.amount, nowMs)
          .then(({ ok, betId, reason }) => {
            if (ok) {
              setBet((b) => ({ ...b, betId: betId ?? null }));
            } else {
              setBet((b) => ({
                ...b,
                placed: false,
                betId: null,
                autoBetEnabled: reason === 'insufficient_balance' ? false : b.autoBetEnabled,
              }));
              if (reason === 'insufficient_balance') onInsufficientBalance?.();
              else {
                // phase_closed on autobet enable — queue for next round
                setBet((b) => ({ ...b, pendingNextRound: true }));
              }
            }
          })
          .catch(() => { setBet((b) => ({ ...b, placed: false, betId: null, pendingNextRound: true })); });
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

      const nowMs = Date.now();
      // Optimistically show BET as placed in UI immediately for snappy feel
      setBet((b) => ({ ...b, placed: true, placedAtMs: nowMs }));

      onPlaceBet(bet.amount, nowMs)
        .then(({ ok, betId, reason }) => {
          if (ok) {
            // Confirmed by server — store betId for cashout
            setBet((b) => ({ ...b, betId: betId ?? null }));
          } else if (reason === 'insufficient_balance') {
            // Undo optimistic placed state
            setBet((b) => ({ ...b, placed: false, betId: null }));
            onInsufficientBalance?.();
          } else {
            // phase_closed / network — bet arrived late (cold-start).
            // Undo placed state and queue for next round automatically.
            setBet((b) => ({ ...b, placed: false, betId: null, pendingNextRound: true }));
          }
        })
        .catch(() => {
          // Network error — queue for next round
          setBet((b) => ({ ...b, placed: false, betId: null, pendingNextRound: true }));
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
    setBet((b) => ({ ...b, placed: false, betId: null }));
    onCancelBet(amt);
  }

  /**
   * Server-validated cash out.
   * Passes bet_id (if known) so the server can find the bet directly by ID.
   */
  async function doCashOut(atOverride?: number) {
    if (!canCashOut) return;
    const at = atOverride ?? multiplier;
    // Optimistically mark as cashed out in UI immediately
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
        <span className="text-xl font-extrabold tracking-wide">CASH OUT</span>
        <span className="text-sm font-bold opacity-90 tabular-nums">{formatMoney(livePayout)}</span>
      </span>
    );
    betShade = 'bg-aviator-orange hover:bg-aviator-orange-bright';
    betShadow = 'shadow-btn-orange';
  } else if (canCancelQueue) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-xl font-extrabold tracking-wide">CANCEL</span>
        <span className="text-xs opacity-80">Next round</span>
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
  } else if (canQueueNextRound || bet.pendingNextRound) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-xl font-extrabold tracking-wide">BET</span>
        <span className="text-xs opacity-80">Next round</span>
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
    <div className="flex flex-col gap-2.5 rounded-2xl bg-ink-700 border border-ink-500/60 p-3 select-none">
      <div className="flex items-center gap-2">
        <CheckboxRow label="Autobet" checked={bet.autoBetEnabled} onChange={handleAutoBetToggle} />
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

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5 rounded-xl bg-ink-850 border border-ink-500/60 p-1.5">
          <div className="flex items-center">
            <button
              onClick={() => adjustAmount(-10)}
              disabled={bet.placed}
              className="grid h-9 w-9 place-items-center rounded-md bg-ink-700 text-gray-300 hover:bg-ink-650 disabled:opacity-40 cursor-pointer"
              aria-label="Decrease bet"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="number"
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                const v = parseFloat(e.target.value);
                if (isFinite(v)) setAmount(v);
              }}
              onBlur={() => setAmountInput(String(bet.amount))}
              disabled={bet.placed}
              className="h-9 w-full min-w-0 bg-transparent text-center font-mono text-base font-bold text-white tabular-nums outline-none disabled:opacity-60"
            />
            <button
              onClick={() => adjustAmount(10)}
              disabled={bet.placed}
              className="grid h-9 w-9 place-items-center rounded-md bg-ink-700 text-gray-300 hover:bg-ink-650 disabled:opacity-40 cursor-pointer"
              aria-label="Increase bet"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {QUICK_ADDS.map(({ label, value }) => (
              <button
                key={value}
                className={`rounded-md py-1 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-40 border ${
                  lastQuickBet === value
                    ? 'bg-aviator-green text-black border-aviator-green'
                    : 'bg-ink-700 text-gray-300 hover:bg-ink-650 border-ink-500/60'
                }`}
                disabled={bet.placed}
                onClick={() => {
                  if (lastQuickBet === value) { setAmount(bet.amount + value); }
                  else { setLastQuickBet(value); setAmount(value); }
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          className={`rounded-xl font-bold text-black transition-all duration-150 cursor-pointer ${betShade} ${betShadow}`}
          onClick={handleBetClick}
          disabled={isButtonDisabled}
        >
          {betLabel}
        </button>
      </div>
    </div>
  );
}

function CheckboxRow({
  label, checked, onChange, disabled = false,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className={`flex shrink-0 items-center gap-1.5 select-none ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
          checked ? 'bg-aviator-green-bright border-aviator-green-bright' : 'bg-ink-850 border-ink-500'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
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
