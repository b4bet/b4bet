/**
 * CashoutPopupOverlay  — spec §3
 * Renders over the crash canvas when the player cashes out.
 * - Larger multiplier display (font-display 4xl–5xl)
 * - Shows net profit (win − stake) below the payout amount
 */
import { useEffect, useState } from 'react';
import { bus, Topics } from '../lib/bus';
import { store } from '../lib/store';
import type { CashoutEvent } from '../lib/crashEngine';

interface PopupSlot {
  key: string;       // unique render key per cashout event
  win: number;
  multiplier: number;
}

// Keep up to 2 pills (one per bet slot A and B). Each cashout event appends a
// new entry; entries auto-expire after 3 s. A Map keyed by the event id ensures
// one pill per slot at a time.
export default function CashoutPopupOverlay() {
  const [pills, setPills] = useState<Map<string, PopupSlot>>(new Map());

  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const off = bus.on(Topics.CrashCashout, (ev) => {
      const e = ev as CashoutEvent;
      const slotKey = e.id ?? Math.random().toString(36).slice(2); // group by slot id
      const win = typeof e.amount === 'number' ? e.amount : 0;
      const multiplier = typeof e.multiplier === 'number' && e.multiplier > 0 ? e.multiplier : 1;

      setPills((prev) => {
        const next = new Map(prev);
        next.set(slotKey, { key: Math.random().toString(36).slice(2), win, multiplier });
        return next;
      });

      // Clear previous timer for this slot then set a fresh one
      if (timers.has(slotKey)) clearTimeout(timers.get(slotKey)!);
      timers.set(slotKey, setTimeout(() => {
        setPills((prev) => { const next = new Map(prev); next.delete(slotKey); return next; });
        timers.delete(slotKey);
      }, 3000));
    });

    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, []);

  if (pills.size === 0) return null;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-20 flex flex-col items-center gap-1.5">
      {Array.from(pills.values()).map((p) => (
        <div
          key={p.key}
          className="cashout-popup-slide flex items-center gap-2 px-4 py-2 rounded-full border border-emeraldwin-500/50 bg-midnight-900/90 backdrop-blur-sm shadow-emerald-glow"
        >
          <span className="font-display font-extrabold text-base leading-none text-emeraldwin-400">
            {p.multiplier.toFixed(2)}×
          </span>
          <span className="w-px h-3 bg-emeraldwin-500/30" />
          <span className="tabular font-bold text-sm leading-none text-white">
            {store.currency}{p.win.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}
