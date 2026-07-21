import { useEffect, useRef } from 'react';
import { multiplierBadgeClass } from './game/format';

interface HistoryBarProps {
  history: number[];
}

export function HistoryBar({ history }: HistoryBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to leftmost (most recent) badge when history updates.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  }, [history]);

  // Allow horizontal scrolling with mouse wheel on desktop.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta !== 0) {
        e.preventDefault();
        el.scrollLeft += delta;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    // No overflow-hidden on the outer div — it would clip the scrollable row.
    <div className="relative bg-ink-800 border-b border-ink-600/60">
      {/* Gradient fade on left */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-ink-800 to-transparent z-10" />
      {/* Gradient fade on right */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-ink-800 to-transparent z-10" />

      <div
        ref={scrollRef}
        className="flex items-center gap-2 overflow-x-auto px-4 sm:px-5 py-2"
        style={{
          // Hide scrollbar visually while keeping scroll functionality
          scrollbarWidth: 'none',
          // Allow native horizontal swipe on mobile without fighting vertical scroll
          touchAction: 'pan-x',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
      >
        {history.length === 0 && (
          <span className="text-xs text-gray-600 italic px-1 shrink-0">No rounds yet — first flight incoming…</span>
        )}
        {history.map((m, i) => (
          <span
            key={`${m.toFixed(2)}-${i}`}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold tabular-nums cursor-default select-none ${multiplierBadgeClass(m)}`}
          >
            {m.toFixed(2)}x
          </span>
        ))}
      </div>
    </div>
  );
}
