import { useEffect, useRef } from 'react';
import { multiplierBadgeClass } from './game/format';

interface HistoryBarProps {
  history: number[];
}

export function HistoryBar({ history }: HistoryBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the most recent (leftmost) badge in view as new rounds land.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  }, [history]);

  return (
    <div className="relative bg-ink-800 border-b border-ink-600/60">
      <div
        ref={scrollRef}
        className="no-scrollbar flex items-center gap-2 overflow-x-auto px-3 sm:px-4 py-2"
      >
        {history.length === 0 && (
          <span className="text-xs text-gray-600 italic px-1">No rounds yet — first flight incoming…</span>
        )}
        {history.map((m, i) => (
          <span
            key={i}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold tabular-nums ${multiplierBadgeClass(
              m,
            )}`}
          >
            {m.toFixed(2)}x
          </span>
        ))}
      </div>
    </div>
  );
}
