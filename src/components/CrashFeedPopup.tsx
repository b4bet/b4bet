/**
 * CrashFeedPopup — spec §4
 * Replaces the old history-only sheet with a live-feed split view:
 *   LEFT — scrollable round history (crashpoints with colour coding)
 *   RIGHT — live activity ticker (bet-placed / cashed-out events, most-recent on top)
 *
 * The popup stays completely client-side; no new data layer is required —
 * it derives activity from the existing CrashHistory and CrashMyBets subscriptions.
 */
import { useEffect, useState, useRef } from 'react';
import { useCrashHistory } from '../lib/hooks';
import { X } from 'lucide-react';

function multiplierColor(x: number) {
  if (x >= 10) return 'text-amberx-300 bg-amberx-500/10 border-amberx-400/50';
  if (x >= 3)  return 'text-neon-300 bg-neon-500/10 border-neon-500/30';
  if (x >= 2)  return 'text-emeraldwin-400 bg-emeraldwin-500/10 border-emeraldwin-500/40';
  if (x >= 1.5) return 'text-white bg-slatepanel-700 border-borderline-800';
  return 'text-coral-400 bg-coral-500/10 border-coral-500/40';
}

function MultiBubble({ x, size = 'sm' }: { x: number | undefined; size?: 'sm' | 'md' }) {
  if (!x || typeof x !== 'number') return <span className="text-[10px] text-slate-500">—</span>;
  const cls = multiplierColor(x);
  return (
    <span
      className={[
        'tabular font-extrabold rounded-md px-1.5 border leading-tight',
        size === 'md' ? 'text-xs py-0.5' : 'text-[10px] py-px',
        cls,
      ].join(' ')}
    >
      {x.toFixed(2)}×
    </span>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  history: number[];
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}

export default function CrashFeedPopup({ open, onClose, history, buttonRef }: Props) {
  if (!open) return null;

  const recentHistory = Array.isArray(history) ? history.slice(0, 35) : [];
  const popupWidth = 300;
  
  let top = 0;
  let left = 0;

  if (buttonRef?.current) {
    const rect = buttonRef.current.getBoundingClientRect();
    // Position popup 20px above the button
    top = rect.top - 20;
    left = Math.max(8, Math.min(rect.right - popupWidth - 20, window.innerWidth - popupWidth - 8));
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-none" onClick={onClose}>
      <div
        style={{
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
          width: `${popupWidth}px`,
          maxHeight: '600px',
          overflowY: 'auto'
        }}
        className="bg-slatepanel-900/95 backdrop-blur-sm border border-borderline-900 rounded-xl shadow-2xl p-3 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="mb-2 pb-2 border-b border-borderline-800">
          <p className="text-xs font-bold text-neon-300 uppercase tracking-widest">Recent Crashes</p>
        </div>

        {/* Auto-wrapping Grid with responsive boxes */}
        <div className="flex flex-wrap gap-1">
          {recentHistory.length === 0 ? (
            <div className="w-full text-center py-4">
              <span className="text-[10px] text-slate-600">Waiting for crashes…</span>
            </div>
          ) : (
            recentHistory.map((crashPoint, idx) => {
              const isWin = crashPoint >= 2;
              const displayText = crashPoint.toFixed(2) + '×';
              // Calculate text size and box width dynamically based on number length
              const textLength = displayText.length;
              let textSize = 'text-xs';
              let minBoxWidth = 'min-w-11';
              
              if (textLength > 8) {
                textSize = 'text-[8px]';
                minBoxWidth = 'min-w-14';
              } else if (textLength > 6) {
                textSize = 'text-[9px]';
                minBoxWidth = 'min-w-12';
              } else if (textLength > 5) {
                textSize = 'text-[10px]';
                minBoxWidth = 'min-w-11';
              }
              
              return (
                <div
                  key={idx}
                  className={`
                    rounded px-1.5 py-2 text-center flex items-center justify-center
                    border transition-all hover:scale-105 cursor-default min-h-11
                    flex-shrink-0
                    ${minBoxWidth}
                    ${isWin 
                      ? 'bg-emeraldwin-500/15 border-emeraldwin-500/40 text-emeraldwin-300' 
                      : 'bg-coral-500/15 border-coral-500/40 text-coral-300'
                    }
                  `}
                >
                  <span className={`tabular font-bold ${textSize} whitespace-nowrap`}>
                    {displayText}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
