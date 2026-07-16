import { useEffect, useRef, useState } from 'react';
import { crashEngine } from '../lib/crashEngine';
import { useCrashBets, useCrashState, useAdminConfig } from '../lib/hooks';
import { store } from '../lib/store';
import { auth } from '../lib/auth';
import { bus, Topics } from '../lib/bus';
import { Check, Minus, Plus, Zap, Loader2 } from 'lucide-react';
import { cms } from '../lib/cms';
import { sfx } from '../lib/crashAudio';
import type { BetSlot } from '../lib/crashEngine';

// ─── spec §2: next-round queue state per slot ──────────────────────────────
interface QueuedBet {
  amount: number;
  autoEnabled: boolean;
  autoTarget: number;
}

function BetConsole({ id }: { id: 'A' | 'B' }) {
  const bets = useCrashBets();
  const state = useCrashState();
  const cfg = useAdminConfig();
  const slot: BetSlot = bets[id];
  // Use string state so user can fully clear the field (type freely)
  const [amountStr, setAmountStr] = useState('100');
  const [autoTarget, setAutoTarget] = useState('2.00');
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoBet, setAutoBet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // spec §2: queued-for-next-round bet
  const [queued, setQueued] = useState<QueuedBet | null>(null);

  // spec §5: cumulative quick-stake — tracks last base value so repeated
  // clicks keep adding that same delta on top of the current input total.
  const lastQuickRef = useRef<number | null>(null);

  const phase = state.phase;
  const canPlace = phase === 'countdown' && !slot.placed;
  const canCancel = phase === 'countdown' && slot.placed;
  const canCashout = phase === 'flying' && slot.placed && !slot.cashedOut;
  const autoCashoutLocked = phase === 'flying';

  // Derived numeric value — NaN when field is empty/invalid
  const amount = parseFloat(amountStr);
  const stake = isNaN(amount) ? 0 : amount;

  // ── spec §2: inject queued bet as soon as the next countdown opens ────────
  useEffect(() => {
    if (!queued) return;
    if (phase === 'countdown' && !slot.placed) {
      const res = crashEngine.placeBet(id, queued.amount);
      if (res.ok) {
        sfx.bet();
        if (queued.autoEnabled) crashEngine.setAuto(id, true, queued.autoTarget);
        setError(null);
      } else {
        setError(res.reason || 'Queued bet failed');
      }
      setQueued(null);
    }
  }, [phase, slot.placed, queued, id]);

  const place = () => {
    if (!auth.getSession()) { bus.emit('auth:open_modal' as any, 'login'); return; }
    const amt = parseFloat(amountStr);
    if (!Number.isNaN(amt) && amt > store.balance) {
      setError('Insufficient balance');
      bus.emit(Topics.InsufficientBalance);
      return;
    }
    const crashLimits = store.getGameLimits('crash');
    if (!Number.isNaN(amt) && (amt < crashLimits.min || amt > crashLimits.max)) {
      setError(`Stake must be between ${store.currency}${crashLimits.min} and ${store.currency}${crashLimits.max}`);
      return;
    }

    // spec §2: if round is already flying, queue for next round instead of blocking
    if (phase === 'flying' || phase === 'busted') {
      setQueued({ amount: amt, autoEnabled, autoTarget: parseFloat(autoTarget) || 2 });
      setError(null);
      return;
    }

    const res = crashEngine.placeBet(id, amt);
    if (res.ok) {
      setError(null);
      sfx.bet();
      if (autoEnabled) crashEngine.setAuto(id, true, parseFloat(autoTarget) || 2);
    } else {
      const insufficient = (res.reason || '').toLowerCase().includes('insufficient');
      setError(res.reason || 'Bet failed');
      if (insufficient) bus.emit(Topics.InsufficientBalance);
      cms.toast({ title: insufficient ? 'Insufficient Balance' : 'Bet failed', body: res.reason || '', kind: 'alert' });
    }
  };

  const cashout = () => {
    const res = crashEngine.cashOut(id);
    if (!res.ok) {
      cms.pushFromTemplate('nt_cashout_failed', 'Cashout failed', res.reason || '', 'warn');
    }
  };

  const toggleAutoBet = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAutoBet((b) => !b);
  };
  const toggleAutoCashout = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (autoCashoutLocked) return;
    const next = !autoEnabled;
    setAutoEnabled(next);
    crashEngine.setAuto(id, next, parseFloat(autoTarget) || 2);
  };
  const setAutoTargetVal = (v: string) => {
    setAutoTarget(v);
    if (autoEnabled) crashEngine.setAuto(id, true, parseFloat(v) || 2);
  };

  // Autobet loop
  useEffect(() => {
    if (!autoBet) return;
    if (phase === 'countdown' && !slot.placed) {
      const amt = parseFloat(amountStr);
      const crashLimits = store.getGameLimits('crash');
      if (Number.isNaN(amt) || amt < crashLimits.min || amt > crashLimits.max) {
        setError(`Autobet paused — stake must be ${store.currency}${crashLimits.min}–${store.currency}${crashLimits.max}`);
        return;
      }
      const res = crashEngine.placeBet(id, amt);
      if (res.ok && autoEnabled) {
        crashEngine.setAuto(id, true, parseFloat(autoTarget) || 2);
      }
    }
  }, [autoBet, phase, slot.placed, amountStr, id, autoEnabled, autoTarget]);

  // ── spec §5: cumulative quick-stake clicks ────────────────────────────────
  const quickAmt = (base: number) => {
    if (lastQuickRef.current === base) {
      // same button clicked again — add the base value cumulatively
      setAmountStr((prev) => {
        const cur = parseFloat(prev) || 0;
        return String(cur + base);
      });
    } else {
      // first click on this button — set flat value
      setAmountStr(String(base));
      lastQuickRef.current = base;
    }
  };
  const quickStakes = cfg.crashQuickStakes && cfg.crashQuickStakes.length ? cfg.crashQuickStakes : [200, 500, 1000, 2000];

  const stepDelta = stake < 100 ? 5 : stake < 1000 ? 25 : 100;
  const inc = () => { setAmountStr(String(Math.round((stake + stepDelta) * 100) / 100)); lastQuickRef.current = null; };
  const dec = () => { setAmountStr(String(Math.max(1, Math.round((stake - stepDelta) * 100) / 100))); lastQuickRef.current = null; };

  const showStake = stake >= 1000 ? `${(stake / 1000).toFixed(stake % 1000 === 0 ? 0 : 2)}K` : amountStr;

  const isQueued = !!queued;

  // ── spec §3: determine action button state ────────────────────────────────
  const getActionButton = () => {
    // queued for next round — show loading indicator (spec §2)
    if (isQueued) {
      return (
        <button
          type="button"
          disabled
          className="w-24 rounded-xl px-2 font-display font-extrabold uppercase tracking-wider text-xs
                     bg-slatepanel-700 border border-neon-400/60 text-neon-300
                     flex flex-col items-center justify-center gap-1 leading-tight"
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-[9px] font-bold uppercase tracking-wider">Next</span>
        </button>
      );
    }
    
    // After cashout during flying phase — show "NEXT BET" to queue next bet
    if (slot.placed && slot.cashedOut && (phase === 'flying' || phase === 'busted')) {
      return (
        <button
          type="button"
          onClick={place}
          className="w-24 rounded-xl px-2 font-display font-extrabold uppercase tracking-wider
                     bg-slatepanel-700 border border-neon-400/60 text-neon-300 text-xs leading-tight
                     flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-transform"
        >
          <span className="text-[9px] font-bold uppercase tracking-widest opacity-70">Next</span>
          <span className="text-sm font-extrabold">BET</span>
        </button>
      );
    }
    
    if (!slot.placed) {
      const isFlying = phase === 'flying' || phase === 'busted';
      return (
        <button
          type="button"
          onClick={place}
          className={[
            'w-24 rounded-xl px-2 font-display font-extrabold uppercase tracking-wider',
            isFlying
              ? 'bg-slatepanel-700 border border-neon-400/60 text-neon-300 text-xs leading-tight flex flex-col items-center justify-center gap-0.5'
              : 'bg-slatepanel-700 border border-borderline-800 text-white text-base',
            'active:scale-[0.98] transition-transform',
          ].join(' ')}
        >
          {isFlying ? (
            <>
              <span className="text-[9px] font-bold uppercase tracking-widest opacity-70">Next</span>
              <span className="text-sm font-extrabold">BET</span>
            </>
          ) : 'BET'}
        </button>
      );
    }
    if (canCashout) {
      return (
        <button
          type="button"
          onClick={cashout}
          className="w-24 rounded-xl px-1.5 font-display font-extrabold uppercase tracking-wider
                     bg-gradient-to-br from-amberx-400 to-amberx-600 text-white
                     border border-amberx-400/40
                     active:scale-[0.98] transition-all flex flex-col items-center justify-center leading-tight"
        >
          <span className="text-[10px]">CASH OUT</span>
          <span className="tabular text-sm">
            {store.currency}{(slot.amount * state.multiplier).toFixed(2)}
          </span>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => crashEngine.cancelBet(id)}
        disabled={!canCancel}
        className="w-24 rounded-xl px-2 font-display font-extrabold uppercase tracking-wider text-sm
                   bg-gradient-to-br from-coral-400 to-coral-600 text-white
                   border border-coral-300/40 active:scale-[0.98] transition-all
                   disabled:opacity-40 disabled:cursor-not-allowed"
      >
        CANCEL
      </button>
    );
  };

  const limits = store.getGameLimits('crash');

  return (
    // spec §3: premium deep-dark slate panel with razor-thin neon border
    <div
      className={[
        'rounded-2xl p-3 border',
        isQueued
          ? 'bg-slatepanel-900 border-neon-400/60'
          : 'bg-slatepanel-900 border-borderline-900',
      ].join(' ')}
    >
      {/* ROW 1 — Autobet · Auto Cash Out · x target */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={toggleAutoBet}
            aria-pressed={autoBet}
            className="inline-flex items-center gap-1.5 select-none"
          >
            <span
              className={[
                'relative inline-grid place-items-center w-4 h-4 rounded border transition-all flex-shrink-0',
                autoBet
                  ? 'bg-slatepanel-700 border-slate-500'
                  : 'bg-slatepanel-800 border-borderline-800',
              ].join(' ')}
            >
              {autoBet && <Check className="w-3 h-3 text-white" strokeWidth={4} />}
            </span>
            <span className="text-[10px] font-bold text-slate-300 whitespace-nowrap uppercase tracking-wider">Autobet</span>
          </button>

          <button
            type="button"
            onClick={toggleAutoCashout}
            aria-pressed={autoEnabled}
            disabled={autoCashoutLocked}
            className={[
              'inline-flex items-center gap-1.5 select-none transition-opacity',
              autoCashoutLocked ? 'opacity-40 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <span
              className={[
                'relative inline-grid place-items-center w-4 h-4 rounded border transition-all flex-shrink-0',
                autoEnabled
                  ? 'bg-slatepanel-700 border-slate-500'
                  : 'bg-slatepanel-800 border-borderline-800',
              ].join(' ')}
            >
              {autoEnabled && <Check className="w-3 h-3 text-white" strokeWidth={4} />}
            </span>
            <span className="text-[10px] font-bold text-slate-300 whitespace-nowrap uppercase tracking-wider">Auto Cash Out</span>
          </button>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 rounded-lg px-2 py-1 border border-borderline-900 bg-midnight-850">
          <Zap className="w-2.5 h-2.5 text-slate-600" />
          <span className="text-[10px] font-bold text-slate-500">x</span>
          <input
            type="number"
            value={autoTarget}
            onChange={(e) => setAutoTargetVal(e.target.value)}
            disabled={!autoEnabled || autoCashoutLocked}
            min={1.01}
            step={0.1}
            className="w-10 bg-transparent border-0 outline-none tabular text-[11px] text-right font-bold text-white disabled:opacity-50 p-0"
            placeholder="2.00"
          />
        </div>
      </div>

      {/* Min/Max labels */}
      <div className="flex items-center gap-3 mb-1.5">
        <span className="text-[9px] text-slate-500">Min: <span className="text-slate-400 font-semibold">{store.currency}{limits.min}</span></span>
        <span className="text-[9px] text-slate-500">Max: <span className="text-slate-400 font-semibold">{store.currency}{limits.max.toLocaleString()}</span></span>
      </div>

      {/* ROW 2 — stake controls left + action button right */}
      <div className="grid grid-cols-[1fr_auto] gap-2 items-stretch">
        {/* LEFT — stake controls */}
        <div
          className="rounded-xl border border-borderline-900 p-2 flex flex-col gap-2"
          style={{ background: 'rgba(10,12,26,0.8)' }}
        >
          {/* minus / amount input / plus */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={dec}
              disabled={slot.placed || isQueued}
              aria-label="Decrease stake"
              className="w-7 h-7 grid place-items-center rounded-lg bg-slatepanel-800 border border-borderline-800 text-slate-200 hover:border-borderline-800 active:scale-95 transition-transform disabled:opacity-40"
            >
              <Minus className="w-3 h-3" strokeWidth={3} />
            </button>
            {/* Fully editable input — allows backspace to clear */}
            <input
              type="text"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => {
                setAmountStr(e.target.value);
                lastQuickRef.current = null;
              }}
              disabled={slot.placed || isQueued}
              className="flex-1 text-center tabular font-extrabold text-white text-base leading-none bg-transparent border-0 outline-none disabled:opacity-40 w-0 min-w-0"
            />
            <button
              type="button"
              onClick={inc}
              disabled={slot.placed || isQueued}
              aria-label="Increase stake"
              className="w-7 h-7 grid place-items-center rounded-lg bg-slatepanel-800 border border-borderline-800 text-slate-200 hover:border-borderline-800 active:scale-95 transition-transform disabled:opacity-40"
            >
              <Plus className="w-3 h-3" strokeWidth={3} />
            </button>
          </div>

          {/* spec §5: cumulative quick-stake chips — repeated clicks ADD, not reset */}
          <div className="flex items-stretch gap-1">
            {quickStakes.slice(0, 4).map((v) => {
              const label = v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 2)}K` : String(v);
              return (
                <button
                  key={v}
                  type="button"
                  disabled={slot.placed || isQueued}
                  onClick={() => quickAmt(v)}
                  className="flex-1 py-1 rounded-lg text-[10px] tabular font-bold border border-borderline-800 bg-slatepanel-800 text-slate-300 active:scale-95 transition-transform disabled:opacity-40"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT — action button */}
        {getActionButton()}
      </div>

      {/* Inline validation error */}
      {error && !isQueued && (
        <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-coral-500/10 border border-coral-500/40 text-[10px] font-semibold text-coral-300">
          {error}
        </div>
      )}
    </div>
  );
}

export default function DualBetPanel() {
  return (
    // spec §3: no "Bet A" / "Bet B" text headers
    <div className="flex flex-col gap-2 w-full max-w-xl mx-auto items-stretch">
      <BetConsole id="A" />
      <BetConsole id="B" />
    </div>
  );
}
