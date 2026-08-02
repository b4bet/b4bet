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
    if (!auth.getSession()) { bus.emit('auth:open_modal' as Parameters<typeof bus.emit>[0], 'login'); return; }
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
    // Capture multiplier before calling cashOut (it may change after)
    const m = state.multiplier;
    const winAmount = Math.floor(slot.amount * m);
    const res = crashEngine.cashOut(id);
    if (res.ok) {
      // Emit cashout event so CashoutPopupOverlay shows the win popup
      bus.emit(Topics.CrashCashout, { id, amount: winAmount, multiplier: m, ts: Date.now() });
    } else {
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
  // Read quick stakes from gameHandlers.crash first, then fall back to crashQuickStakes
  const quickStakes = (cfg.gameHandlers['crash']?.quickStakes?.length ? cfg.gameHandlers['crash'].quickStakes : null) ?? (cfg.crashQuickStakes?.length ? cfg.crashQuickStakes : [200, 500, 1000, 2000]);

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
        <button disabled className="w-24 rounded-xl px-2 font-display font-extrabold uppercase tracking-wider text-sm bg-gradient-to-br from-amber-500 to-amber-600 text-white border border-amber-300/40 opacity-80">
          <Loader2 className="inline w-4 h-4 animate-spin mr-1" />
          Next
        </button>
      );
    }
    
    // After cashout during flying phase — show "NEXT BET" to queue next bet
    if (slot.placed && slot.cashedOut && (phase === 'flying' || phase === 'busted')) {
      return (
        <button onClick={place} className="w-24 rounded-xl px-2 font-display font-extrabold uppercase tracking-wider text-sm bg-gradient-to-br from-emerald-500 to-emerald-700 text-white border border-emerald-300/40 active:scale-[0.98] transition-all">
          Next
          <br />BET
        </button>
      );
    }
    
    if (!slot.placed) {
      const isFlying = phase === 'flying' || phase === 'busted';
      return (
        <button
          onClick={place}
          disabled={!!queued}
          className="w-24 rounded-xl px-2 font-display font-extrabold uppercase tracking-wider text-sm bg-gradient-to-br from-emerald-500 to-emerald-700 text-white border border-emerald-300/40 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isFlying ? (
            <>
              Next
              <br />BET
            </>
          ) : 'BET'}
        </button>
      );
    }
    if (canCashout) {
      return (
        <button
          onClick={cashout}
          className="w-24 rounded-xl px-1 font-display font-extrabold uppercase tracking-wider text-xs
            bg-gradient-to-br from-amber-400 to-amber-600 text-white
            border border-amber-300/60 active:scale-[0.98] transition-all
            shadow-[0_0_12px_rgba(245,158,11,0.4)]"
        >
          CASH OUT
          <br />
          <span className="text-[11px] font-bold tabular-nums">{store.currency}{(slot.amount * state.multiplier).toFixed(2)}</span>
        </button>
      );
    }
    return (
      <button
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
    <div className="flex flex-col gap-2 p-3 rounded-2xl bg-slatepanel-900 border border-borderline-900">
      {/* ROW 1 — Autobet · Auto Cash Out · x target */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleAutoBet}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors
            ${autoBet ? 'bg-neon-500/20 border-neon-400/60 text-neon-300' : 'bg-slatepanel-800 border-borderline-800 text-slate-400'}`}
        >
          {autoBet && <Check className="w-3 h-3" />}
          Autobet
        </button>

        <button
          onClick={toggleAutoCashout}
          disabled={autoCashoutLocked}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors
            ${autoEnabled ? 'bg-emeraldwin-500/20 border-emeraldwin-400/60 text-emeraldwin-300' : 'bg-slatepanel-800 border-borderline-800 text-slate-400'}
            disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {autoEnabled && <Check className="w-3 h-3" />}
          Auto Cash Out
        </button>

        <div className="flex items-center gap-0.5 ml-auto">
          <span className="text-slate-400 text-[11px] font-bold">x</span>
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
      <div className="flex justify-between text-[10px] text-slate-500 -mt-1">
        <span>Min: {store.currency}{limits.min}</span>
        <span>Max: {store.currency}{limits.max.toLocaleString()}</span>
      </div>

      {/* ROW 2 — stake controls left + action button right */}
      <div className="flex items-center gap-2">
        {/* LEFT — stake controls */}
        <div className="flex-1 flex flex-col gap-1">
          {/* minus / amount input / plus */}
          <div className="flex items-center gap-1 bg-slatepanel-800 rounded-xl border border-borderline-800 px-2 py-1">
            <button onClick={dec} disabled={slot.placed || isQueued} className="text-slate-400 hover:text-white disabled:opacity-40 p-0.5">
              <Minus className="w-3.5 h-3.5" />
            </button>

            {/* Fully editable input — allows backspace to clear */}
            <input
              type="number"
              value={showStake}
              onChange={(e) => {
                setAmountStr(e.target.value);
                lastQuickRef.current = null;
              }}
              disabled={slot.placed || isQueued}
              className="flex-1 text-center tabular font-extrabold text-white text-base leading-none bg-transparent border-0 outline-none disabled:opacity-40 w-0 min-w-0"
            />
            <button onClick={inc} disabled={slot.placed || isQueued} className="text-slate-400 hover:text-white disabled:opacity-40 p-0.5">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* spec §5: cumulative quick-stake chips — repeated clicks ADD, not reset */}
          <div className="flex gap-1">
            {quickStakes.slice(0, 4).map((v) => {
              const label = v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 2)}K` : String(v);
              return (
                <button
                  key={v}
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
        <p className="text-[11px] text-red-400 font-medium -mt-1">{error}</p>
      )}
    </div>
  );
}

export default function DualBetPanel() {
  return (
    // spec §3: no "Bet A" / "Bet B" text headers
    <div className="grid grid-cols-2 gap-2 p-2">
      <BetConsole id="A" />
      <BetConsole id="B" />
    </div>
  );
}
