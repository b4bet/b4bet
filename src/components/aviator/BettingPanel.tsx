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

  useEffect(() => { setAmountInput(String(bet.amount)); }, [bet.amount]);
  useEffect(() => { setAutoCashoutInput(String(bet.autoCashoutValue)); }, [bet.autoCashoutValue]);

  const limits = store.getGameLimits('aviator');
  const isDisabled = bet.placed || phase === 'flying';

  // Round transition — fire pending/auto bets
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
    if (bet.placed && bet.cashedOutAt === null && bet.autoCashoutEnabled && phase === 'flying' && multiplier >= bet.autoCashoutValue) {
      void doCashOut(bet.autoCashoutValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiplier, phase]);

  // Crash — settle lost bet
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

  const canCancel = phase === 'waiting' && bet.placed && bet.cashedOutAt === null;
  const canPlace = phase === 'waiting' && !bet.placed && bet.amount <= balance && countdown > 0;
  const canCashOut = phase === 'flying' && bet.placed && bet.cashedOutAt === null;
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
        cms.toast({ title: 'Bet out of range', body: `Must be ${store.currency}${limits.min}–${store.currency}${limits.max}`, kind: 'alert' });
        return;
      }
      if (bet.amount > balance) { onInsufficientBalance?.(); return; }
      if (phase === 'waiting' && !bet.placed && countdown > 0) {
        void onPlaceBet(bet.amount).then((ok) => {
          if (ok) setBet((b) => ({ ...b, autoBetEnabled: true, placed: true, placedAtMs: Date.now() }));
          else onInsufficientBalance?.();
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
        cms.toast({ title: 'Bet out of range', body: `Must be ${store.currency}${limits.min}–${store.currency}${limits.max}`, kind: 'alert' });
        return;
      }
      if (countdown <= 0.01) { onTimeout?.(); return; }
      void onPlaceBet(bet.amount).then((ok) => {
        if (ok) setBet((b) => ({ ...b, placed: true, placedAtMs: Date.now() }));
        else onInsufficientBalance?.();
      });
      return;
    }
    if (canQueueNextRound) {
      if (bet.amount < limits.min || bet.amount > limits.max) {
        cms.toast({ title: 'Bet out of range', body: `Must be ${store.currency}${limits.min}–${store.currency}${limits.max}`, kind: 'alert' });
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

  // ── Button label + color ──
  let betLabel: React.ReactNode;
  let btnClass: string;

  if (canCashOut) {
    const livePayout = bet.amount * multiplier;
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-sm font-black">CASH OUT</span>
        <span className="text-xs font-normal opacity-90">{formatMoney(livePayout)}</span>
      </span>
    );
    btnClass = 'bg-aviator-orange hover:bg-aviator-orange-bright shadow-btn-orange';
  } else if (canCancelQueue) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-sm font-black">CANCEL</span>
        <span className="text-xs font-normal opacity-80">Next round</span>
      </span>
    );
    btnClass = 'bg-aviator-red hover:bg-aviator-red-bright';
  } else if (canCancel) {
    betLabel = 'CANCEL';
    btnClass = 'bg-aviator-red hover:bg-aviator-red-bright';
  } else if (phase === 'flying' && bet.placed && bet.cashedOutAt !== null) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-sm font-black">CASHED OUT</span>
        <span className="text-xs font-normal opacity-80">{bet.cashedOutAt.toFixed(2)}x</span>
      </span>
    );
    btnClass = 'bg-aviator-green/50 cursor-default';
  } else if (canQueueNextRound) {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-sm font-black">BET</span>
        <span className="text-xs font-normal opacity-80">Next round</span>
      </span>
    );
    btnClass = 'bg-aviator-green hover:bg-aviator-green-bright shadow-btn-green';
  } else {
    betLabel = (
      <span className="flex flex-col items-center leading-tight">
        <span className="text-sm font-black">BET</span>
        <span className="text-xs font-normal opacity-80">Next round</span>
      </span>
    );
    btnClass = 'bg-aviator-green hover:bg-aviator-green-bright shadow-btn-green';
  }

  const isBtnDisabled = !canPlace && !canCashOut && !canCancel && !isInsufficientBalance && !canQueueNextRound && !canCancelQueue;

  return (
    <div className="rounded-xl bg-[#1a1f2e] border border-[#2a3040] p-3">
      {/* Row 1: Autobet checkbox | Autowithdrawal toggle | x | multiplier input */}
      <div className="flex items-center gap-2 mb-3">
        {/* Autobet */}
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <span
            className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
              bet.autoBetEnabled ? 'bg-aviator-green border-aviator-green' : 'border-[#444c60] bg-transparent'
            }`}
            onClick={() => handleAutoBetToggle(!bet.autoBetEnabled)}
          >
            {bet.autoBetEnabled && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2.5 2.5L8 3" stroke="#0a0f1c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </span>
          <span className="text-xs text-gray-300 font-medium">Autobet</span>
        </label>

        {/* Autowithdrawal toggle */}
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <button
            type="button"
            onClick={() => setBet((b) => ({ ...b, autoCashoutEnabled: !b.autoCashoutEnabled }))}
            className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
              bet.autoCashoutEnabled ? 'bg-aviator-green' : 'bg-[#333d50]'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                bet.autoCashoutEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-xs text-gray-300 font-medium">Autowithdrawal</span>
        </label>

        {/* x + multiplier */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-gray-400">x</span>
          <input
            type="number"
            className="w-14 text-xs text-center rounded-md bg-[#0e1220] border border-[#2a3040] text-white px-1 py-1 [appearance:textfield] outline-none focus:border-aviator-green"
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
        </div>
      </div>

      {/* Row 2: — amount + | BET button (right half) */}
      <div className="flex items-stretch gap-2 mb-2">
        {/* Left: minus + input + plus */}
        <div className="flex items-center gap-1 flex-1 bg-[#0e1220] rounded-lg border border-[#2a3040] px-2 py-1">
          <button
            className="w-7 h-7 flex items-center justify-center rounded text-gray-300 hover:text-white hover:bg-[#2a3040] disabled:opacity-30 transition-colors"
            onClick={() => adjustAmount(-100)}
            disabled={isDisabled}
          >
            <Minus size={14} />
          </button>
          <input
            type="number"
            className="flex-1 text-center text-base font-bold bg-transparent text-white [appearance:textfield] outline-none min-w-0"
            value={amountInput}
            min={limits.min}
            max={limits.max}
            onChange={(e) => setAmountInput(e.target.value)}
            onBlur={() => {
              const v = parseFloat(amountInput);
              if (!isNaN(v)) setAmount(v);
              else setAmountInput(String(bet.amount));
            }}
            disabled={isDisabled}
          />
          <button
            className="w-7 h-7 flex items-center justify-center rounded text-gray-300 hover:text-white hover:bg-[#2a3040] disabled:opacity-30 transition-colors"
            onClick={() => adjustAmount(100)}
            disabled={isDisabled}
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Right: BET button */}
        <button
          className={`w-36 rounded-xl font-bold text-white transition-all cursor-pointer py-2 disabled:opacity-50 disabled:cursor-not-allowed ${
            btnClass
          }`}
          onClick={handleBetClick}
          disabled={isBtnDisabled}
        >
          {betLabel}
        </button>
      </div>

      {/* Row 3: Quick bet buttons */}
      <div className="flex gap-1.5">
        {QUICK_ADDS.map(({ label, value }) => (
          <button
            key={value}
            className="flex-1 text-xs py-1.5 rounded-lg font-semibold bg-[#252d3d] hover:bg-[#2e3850] text-gray-300 hover:text-white transition-colors disabled:opacity-40"
            onClick={() => setAmount(value)}
            disabled={isDisabled}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
