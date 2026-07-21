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
  onPlaceBet: (amount: number) => Promise<boolean>;
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
            // Fire the async bet placement; update betId when server confirms
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

  // Auto cash-out trigger — calls server-validated cashout.
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
      // Settle the lost bet server-side (fire-and-forget)
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
    setBet((b) => ({ ...b, placed: false, betId: null }));
    onCancelBet(amt);
  }

  /**
   * Server-validated cash out.
   *
   * Passes bet_id (if known) so the server can find the bet directly by ID,
   * eliminating the round_uuid race condition that caused intermittent errors.
   *
   * On success: updates balance from server's balance_after (single source of truth).
   * On failure: rolls back optimistic cashedOutAt so the user can retry.
   */
  async function doCashOut(atOverride?: number) {
    if (!canCashOut) return;
    const at = atOverride ?? multiplier;

    // Optimistic UI — show cashed-out state immediately for snappy feel
    setBet((b) => ({ ...b, cashedOutAt: at }));

    try {
      const res = await aviatorLoop.cashoutBet(bet.amount, bet.placedAtMs, at, bet.betId);
      if (res.won && res.win > 0) {
        // Server is the sole source of truth for Supabase balance.
        // setBalance() syncs local + Supabase from the server's confirmed value.
        store.setBalance(res.balance_after);
        onCashOut(bet.amount, res.cashout_at ?? at);
        onWin(res.win);
      } else {
        // Server says round already crashed — snap UI to crashed state
        if (res.crash_point !== null) {
          aviatorLoop.reportServerCrash(res.crash_point);
        }
        // Roll back optimistic cashout so the crash handler can clean up properly
        setBet((b) => ({ ...b, cashedOutAt: null }));
      }
    } catch {
      // Network or server error — roll back optimistic state so user can retry
      // (the bet is still active on the server; don't assume it's lost)
      setBet((b) => ({ ...b, cashedOutAt: null }));
      cms.toast({
        title: 'Cashout failed',
        body: 'Network error. Your bet is still active — try again.',
        kind: 'warn',
      });
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
        <span className="text-sm font-bold">{formatMoney(livePayout)}</span>
      </span>
    );
    betShade = 'bg-aviator-orange hover:bg-aviator-orange-bright';
    betShadow = 'shadow-btn-orange';
  } else if (canCancelQueue) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span>CANCEL</span>
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
  } else if (canQueueNextRound) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span>BET</span>
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
    <div className="flex flex-col gap-2 rounded-xl bg-ink-800 p-3 select-none">
      {/* Top row: checkboxes + auto-withdraw multiplier input */}
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            className="accent-aviator-green"
            checked={bet.autoCashoutEnabled}
            onChange={(e) => setBet((b) => ({ ...b, autoCashoutEnabled: e.target.checked }))}
          />
          Auto
        </label>
        {bet.autoCashoutEnabled && (
          <div className="flex items-center gap-1">
            <input
              type="number"
              className="w-16 rounded bg-ink-700 px-2 py-0.5 text-xs text-white outline-none"
              value={autoCashoutInput}
              min={1.01}
              step={0.1}
              onChange={(e) => {
                setAutoCashoutInput(e.target.value);
                const v = parseFloat(e.target.value);
                if (isFinite(v) && v >= 1.01) {
                  setBet((b) => ({ ...b, autoCashoutValue: v }));
                }
              }}
            />
            <span>x</span>
          </div>
        )}
        <label className="flex items-center gap-1 cursor-pointer ml-auto">
          <input
            type="checkbox"
            className="accent-aviator-green"
            checked={bet.autoBetEnabled}
            onChange={(e) => handleAutoBetToggle(e.target.checked)}
          />
          Auto Bet
        </label>
      </div>

      {/* Amount row */}
      <div className="flex items-center gap-2">
        <button
          className="h-8 w-8 rounded bg-ink-700 text-white flex items-center justify-center hover:bg-ink-600 cursor-pointer"
          onClick={() => adjustAmount(-50)}
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          className="flex-1 rounded bg-ink-700 px-3 py-1.5 text-center text-sm font-semibold text-white outline-none"
          value={amountInput}
          min={limits.min}
          max={limits.max}
          onChange={(e) => {
            setAmountInput(e.target.value);
            const v = parseFloat(e.target.value);
            if (isFinite(v)) setAmount(v);
          }}
          onBlur={() => setAmountInput(String(bet.amount))}
        />
        <button
          className="h-8 w-8 rounded bg-ink-700 text-white flex items-center justify-center hover:bg-ink-600 cursor-pointer"
          onClick={() => adjustAmount(50)}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Quick-bet chips */}
      <div className="flex gap-1.5">
        {QUICK_ADDS.map(({ label, value }) => (
          <button
            key={value}
            className={`flex-1 rounded py-1 text-xs font-semibold transition-colors cursor-pointer ${
              lastQuickBet === value
                ? 'bg-aviator-green text-black'
                : 'bg-ink-700 text-gray-300 hover:bg-ink-600'
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

      {/* Main action button */}
      <button
        className={`mt-1 w-full rounded-lg py-3 font-bold text-black transition-all duration-150 cursor-pointer ${betShade} ${betShadow}`}
        onClick={handleBetClick}
        disabled={isButtonDisabled}
      >
        {betLabel}
      </button>

      {/* Live multiplier ticker when bet is active */}
      {bet.placed && bet.cashedOutAt === null && phase === 'flying' && (
        <div className="text-center text-xs text-gray-400">
          Live payout: <span className="font-bold text-aviator-orange">{formatMoney(bet.amount * multiplier)}</span>
        </div>
      )}
      {bet.placed && bet.cashedOutAt !== null && (
        <div className="text-center text-xs text-aviator-green font-semibold">
          Cashed out at {bet.cashedOutAt.toFixed(2)}x — Won {formatMoney(bet.amount * bet.cashedOutAt)}
        </div>
      )}
    </div>
  );
}
