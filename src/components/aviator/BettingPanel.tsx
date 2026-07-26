import { useEffect, useRef, useState } from 'react';
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
  { label: '100', value: 100 },
  { label: '200', value: 200 },
  { label: '500', value: 500 },
  { label: '1K', value: 1000 },
];

// Minimum ms to block double-tap after BET click
const BET_DEBOUNCE_MS = 800;

/** Delay helper for retry backoff */
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

  // Prevent double-tap / rapid re-click from cancelling an optimistic bet
  const betClickedAt = useRef<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Synchronous guard: prevents doCashOut from firing more than once per round.
  // React state updates (cashedOutAt) are batched and async, so the auto-cashout
  // useEffect can fire multiple times before cashedOutAt propagates — this ref
  // blocks re-entry immediately on the first call.
  const cashoutFiredRef = useRef(false);

  useEffect(() => { setAmountInput(String(bet.amount)); }, [bet.amount]);
  useEffect(() => { setAutoCashoutInput(String(bet.autoCashoutValue)); }, [bet.autoCashoutValue]);

  // Reset the cashout guard each time a new round starts or bet is placed
  useEffect(() => {
    cashoutFiredRef.current = false;
  }, [roundId, bet.placed]);

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
            nextRound.placed = true;
            nextRound.placedAtMs = Date.now();
            void onPlaceBet(b.amount).then((res) => {
              if (!res.ok) {
                setBet((bb) => ({ ...bb, autoBetEnabled: false, pendingNextRound: false, placed: false }));
                if (res.reason === 'insufficient') onInsufficientBalance?.();
              }
            });
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
      // Reset cashout guard so it can fire next round
      cashoutFiredRef.current = false;
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
  const canCancel = phase === 'waiting' && bet.placed && bet.cashedOutAt === null &&
    (Date.now() - betClickedAt.current) > BET_DEBOUNCE_MS;
  const isInsufficientBalance = phase === 'waiting' && !bet.placed && bet.amount > balance && countdown > 0;
  const canQueueNextRound = phase === 'flying' && !bet.placed && bet.cashedOutAt === null;
  const canCancelQueue = bet.pendingNextRound && !bet.placed;

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
        setBet((b) => ({ ...b, autoBetEnabled: true, placed: true, placedAtMs: Date.now() }));
        void onPlaceBet(bet.amount).then((res) => {
          if (!res.ok) {
            setBet((b) => ({ ...b, autoBetEnabled: false, placed: false }));
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

    if (isProcessing) return;

    if (canCashOut) { void doCashOut(); return; }

    if (canCancelQueue) {
      setBet((b) => ({ ...b, pendingNextRound: false }));
      return;
    }

    if (canCancel) { doCancel(); return; }

    if (isInsufficientBalance) { onInsufficientBalance?.(); return; }

    if (canPlace) {
      if (bet.amount < limits.min || bet.amount > limits.max) {
        cms.toast({ title: 'Bet out of range', body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`, kind: 'alert' });
        return;
      }
      if (countdown <= 0.01) { onTimeout?.(); return; }

      betClickedAt.current = Date.now();
      setIsProcessing(true);

      const placedAtMs = Date.now();
      setBet((b) => ({ ...b, placed: true, placedAtMs }));

      void onPlaceBet(bet.amount).then((res) => {
        setIsProcessing(false);
        if (!res.ok) {
          setBet((b) => ({ ...b, placed: false, betId: null }));
          if (res.reason === 'insufficient') {
            onInsufficientBalance?.();
          }
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

    // SYNCHRONOUS guard — must be checked and set before any await.
    // The auto-cashout useEffect fires every 50ms (on each multiplier tick).
    // React state (cashedOutAt) is async, so bet.cashedOutAt is still null
    // on subsequent ticks before the state update re-renders.
    // This ref prevents any second call from proceeding within the same round.
    if (cashoutFiredRef.current) return;
    cashoutFiredRef.current = true;

    const at = atOverride ?? multiplier;
    // Optimistically mark as cashed out so UI updates immediately
    setBet((b) => ({ ...b, cashedOutAt: at }));

    // Snapshot values now — state changes during async calls
    const snapBetId = bet.betId;
    const snapAmount = bet.amount;
    const snapPlacedAtMs = bet.placedAtMs;

    // Retry is ONLY safe when we have a betId — the server uses it as an
    // idempotency key to prevent double-crediting.
    // Without a betId there is NO deduplication on the server, so exactly
    // ONE request is sent. Balance auto-syncs from the 300ms server poll.
    const maxAttempts = snapBetId ? 2 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await aviatorLoop.cashoutBet(snapAmount, snapPlacedAtMs, at, snapBetId);
        if (res.won && res.win > 0) {
          store.setBalance(res.balance_after);
          onCashOut(snapAmount, res.cashout_at ?? at);
          onWin(res.win);
        } else {
          // Server says not won (crashed before cashout was confirmed)
          if (res.crash_point !== null) {
            aviatorLoop.reportServerCrash(res.crash_point);
          }
        }
        return; // success — stop retrying
      } catch {
        if (attempt < maxAttempts - 1) {
          // Brief pause before retry on transient network failure
          await delay(1200);
          continue;
        }
        // All attempts failed — UI already shows "CASHED OUT".
        // Balance will sync from next server poll (every 300ms). No toast shown.
      }
    }
  }

  // ── Button appearance ─────────────────────────────────────────────────────
  let betLabel: React.ReactNode;
  let buttonClass = '';

  if (isProcessing) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-sm font-bold opacity-70">PLACING...</span>
      </span>
    );
    buttonClass = 'bg-[#22c55e]/50 cursor-wait';
  } else if (canCashOut) {
    const livePayout = bet.amount * multiplier;
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-sm font-bold tracking-wide">CASH OUT</span>
        <span className="text-base font-extrabold">{formatMoney(livePayout)}</span>
      </span>
    );
    buttonClass = 'bg-[#f97316] hover:bg-[#fb923c] shadow-[0_4px_15px_rgba(249,115,22,0.5)]';
  } else if (canCancelQueue) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-sm font-bold">CANCEL</span>
        <span className="text-[11px] opacity-75">Next round</span>
      </span>
    );
    buttonClass = 'bg-[#ef4444] hover:bg-[#f87171] shadow-[0_4px_15px_rgba(239,68,68,0.4)]';
  } else if (canCancel) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-sm font-bold">CANCEL BET</span>
        <span className="text-[11px] opacity-75">{formatMoney(bet.amount)}</span>
      </span>
    );
    buttonClass = 'bg-[#ef4444] hover:bg-[#f87171] shadow-[0_4px_15px_rgba(239,68,68,0.4)]';
  } else if (phase === 'waiting' && bet.placed) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-sm font-bold">BET PLACED</span>
        <span className="text-[11px] opacity-75">{formatMoney(bet.amount)}</span>
      </span>
    );
    buttonClass = 'bg-[#22c55e]/60 cursor-default';
  } else if (phase === 'flying' && bet.placed && bet.cashedOutAt !== null) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-sm font-bold opacity-60">CASHED OUT</span>
        <span className="text-[11px] opacity-50">{bet.cashedOutAt.toFixed(2)}x</span>
      </span>
    );
    buttonClass = 'bg-[#22c55e]/30 cursor-default';
  } else if (canQueueNextRound) {
    if (bet.pendingNextRound) {
      betLabel = (
        <span className="flex flex-col items-center leading-tight">
          <span className="text-sm font-bold">CANCEL</span>
          <span className="text-[11px] opacity-75">Next round</span>
        </span>
      );
      buttonClass = 'bg-[#ef4444] hover:bg-[#f87171] shadow-[0_4px_15px_rgba(239,68,68,0.4)]';
    } else {
      betLabel = (
        <span className="flex flex-col items-center leading-tight">
          <span className="text-sm font-bold">BET</span>
          <span className="text-[11px] opacity-75">Next round</span>
        </span>
      );
      buttonClass = 'bg-[#22c55e]/70 hover:bg-[#22c55e] shadow-[0_4px_15px_rgba(34,197,94,0.3)]';
    }
  } else if (phase === 'crashed') {
    betLabel = <span className="text-sm font-bold opacity-40">BET</span>;
    buttonClass = 'bg-white/10 cursor-not-allowed';
  } else if (isInsufficientBalance) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-sm font-bold">LOW BALANCE</span>
      </span>
    );
    buttonClass = 'bg-[#ef4444]/70 cursor-not-allowed';
  } else {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-sm font-bold">BET</span>
        <span className="text-[11px] opacity-75">{formatMoney(bet.amount)}</span>
      </span>
    );
    buttonClass = canPlace
      ? 'bg-[#22c55e] hover:bg-[#4ade80] shadow-[0_4px_20px_rgba(34,197,94,0.5)] active:scale-95'
      : 'bg-[#22c55e]/30 cursor-not-allowed';
  }

  const isButtonDisabled =
    isProcessing ||
    (!canPlace &&
    !canCashOut &&
    !canCancel &&
    !canQueueNextRound &&
    !canCancelQueue &&
    !(isInsufficientBalance) &&
    !(phase === 'waiting' && bet.placed));

  return (
    <div className="flex-1 bg-[#1a1f2e] rounded-xl p-3 flex flex-col gap-2.5 border border-white/5 min-w-0">

      {/* Top row: Auto bet + Auto W/D */}
      <div className="flex items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-3.5 h-3.5 accent-green-500"
            checked={bet.autoBetEnabled}
            onChange={(e) => handleAutoBetToggle(e.target.checked)}
          />
          <span className="text-white/60 font-medium">Auto</span>
        </label>

        <label className="flex items-center gap-1.5 cursor-pointer select-none ml-auto">
          <span className="text-white/60 font-medium">Auto W/D</span>
          <button
            type="button"
            className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${
              bet.autoCashoutEnabled ? 'bg-green-500' : 'bg-white/20'
            }`}
            onClick={() => setBet((b) => ({ ...b, autoCashoutEnabled: !b.autoCashoutEnabled }))}
          >
            <span
              className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow transition-all ${
                bet.autoCashoutEnabled ? 'left-5' : 'left-1'
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
              className="w-14 bg-white/10 rounded-lg px-1.5 py-0.5 text-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-green-500/50"
              value={autoCashoutInput}
              onChange={(e) => {
                setAutoCashoutInput(e.target.value);
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 1.1) setBet((b) => ({ ...b, autoCashoutValue: v }));
              }}
            />
            <span className="text-white/40 text-xs">x</span>
          </div>
        )}
      </div>

      {/* Amount row: [-] input [+] */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer border border-white/10"
          onClick={() => adjustAmount(-50)}
          disabled={bet.placed || bet.pendingNextRound}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1 relative">
          <input
            type="number"
            min={limits.min}
            max={limits.max}
            className="w-full bg-white/10 rounded-lg px-2 py-2 text-white text-sm font-bold text-center focus:outline-none focus:ring-1 focus:ring-green-500/50 border border-white/10 disabled:opacity-50"
            value={amountInput}
            disabled={bet.placed || bet.pendingNextRound}
            onChange={(e) => {
              setAmountInput(e.target.value);
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) setAmount(v);
            }}
            onBlur={() => setAmountInput(String(bet.amount))}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 text-xs pointer-events-none">
            {store.currency}
          </span>
        </div>
        <button
          type="button"
          className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer border border-white/10"
          onClick={() => adjustAmount(50)}
          disabled={bet.placed || bet.pendingNextRound}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quick amounts */}
      <div className="flex gap-1.5">
        {QUICK_ADDS.map(({ label, value }) => (
          <button
            key={value}
            type="button"
            disabled={bet.placed || bet.pendingNextRound}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer bg-white/8 hover:bg-white/15 text-white/70 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10"
            onClick={() => {
              setAmount(value);
              setAmountInput(String(value));
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── MAIN ACTION BUTTON ── */}
      <button
        type="button"
        disabled={isButtonDisabled}
        className={`w-full h-14 rounded-xl font-bold text-white transition-all flex items-center justify-center cursor-pointer ${buttonClass} disabled:opacity-30 disabled:cursor-not-allowed`}
        onClick={handleBetClick}
      >
        {betLabel}
      </button>
    </div>
  );
}
