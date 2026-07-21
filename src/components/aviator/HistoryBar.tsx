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

  // Mouse wheel scroll — horizontal
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Prefer horizontal delta (trackpad), fall back to vertical (mouse wheel)
      el.scrollLeft += e.deltaX !== 0 ? e.deltaX : e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Mouse drag-to-scroll (click + drag left/right)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let isDragging = false;
    let startX = 0;
    let scrollStart = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      startX = e.pageX;
      scrollStart = el.scrollLeft;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.pageX - startX;
      el.scrollLeft = scrollStart - dx;
    };
    const onMouseUp = () => {
      isDragging = false;
      el.style.cursor = 'grab';
      el.style.userSelect = '';
    };

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div className="relative bg-ink-800 border-b border-ink-600/60">
      {/* Gradient fade on left */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-ink-800 to-transparent z-10" />
      {/* Gradient fade on right */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-ink-800 to-transparent z-10" />

      <div
        ref={scrollRef}
        className="flex items-center gap-2 overflow-x-auto px-4 sm:px-5 py-2"
        style={{
          scrollbarWidth: 'none',
          cursor: 'grab',
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
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold tabular-nums select-none ${multiplierBadgeClass(m)}`}
          >
            {m.toFixed(2)}x
          </span>
        ))}
      </div>
    </div>
  );
}
