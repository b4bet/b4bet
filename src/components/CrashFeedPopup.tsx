/**
 * CrashFeedPopup — Recent Crashes with Provably Fair verification.
 * Data comes directly from crashEngine.getHistoryDetail() (loaded on startup from Supabase).
 * No separate API call needed — engine already has full detail.
 */
import { useState } from 'react';
import { crashEngine } from '../lib/crashEngine';
import type { CrashRoundDetail } from '../lib/game-service';
import { X, ShieldCheck, Copy, ExternalLink } from 'lucide-react';

function multiplierColor(x: number) {
  if (x >= 10) return 'text-amberx-300 bg-amberx-500/10 border-amberx-400/50';
  if (x >= 3) return 'text-neon-300 bg-neon-500/10 border-neon-500/30';
  if (x >= 2) return 'text-emeraldwin-400 bg-emeraldwin-500/10 border-emeraldwin-500/40';
  if (x >= 1.5) return 'text-white bg-slatepanel-700 border-borderline-800';
  return 'text-coral-400 bg-coral-500/10 border-coral-500/40';
}

interface VerifyPanelProps {
  round: CrashRoundDetail;
  onClose: () => void;
}

function VerifyPanel({ round, onClose }: VerifyPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="mt-2 rounded-xl bg-slatepanel-800 border border-borderline-800 p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-emeraldwin-400 font-bold flex items-center gap-1">
          <ShieldCheck size={12} />
          Provably Fair — {round.bust_point.toFixed(2)}×
        </span>
        <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={12} /></button>
      </div>

      {/* Server Seed Hash */}
      <div className="space-y-1">
        <div className="text-slate-500">Server Seed Hash (pre-committed)</div>
        <div className="flex items-center gap-1 bg-slatepanel-900/60 rounded px-2 py-1">
          <span className="text-slate-300 break-all flex-1 font-mono text-[10px] leading-tight">{round.server_seed_hash}</span>
          <button onClick={() => copy(round.server_seed_hash, 'hash')} className="flex-shrink-0 text-slate-500 hover:text-white">
            {copied === 'hash' ? <span className="text-emeraldwin-400 text-[10px]">✓</span> : <Copy size={10} />}
          </button>
        </div>
      </div>

      {/* Server Seed (revealed) */}
      {round.server_seed ? (
        <div className="space-y-1">
          <div className="text-slate-500">Server Seed (revealed)</div>
          <div className="flex items-center gap-1 bg-slatepanel-900/60 rounded px-2 py-1">
            <span className="text-slate-300 break-all flex-1 font-mono text-[10px] leading-tight">{round.server_seed}</span>
            <button onClick={() => copy(round.server_seed!, 'seed')} className="flex-shrink-0 text-slate-500 hover:text-white">
              {copied === 'seed' ? <span className="text-emeraldwin-400 text-[10px]">✓</span> : <Copy size={10} />}
            </button>
          </div>
          <div className="text-slate-500 text-[10px]">SHA-256(server_seed) must match hash above</div>
          <a
            href="https://emn178.github.io/online-tools/sha256.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-neon-400 hover:underline text-[10px]"
          >
            Verify online <ExternalLink size={9} />
          </a>
        </div>
      ) : (
        <div className="text-slate-500 text-[10px]">Seed revealed after round ends</div>
      )}

      {/* How to verify */}
      <div className="text-slate-500 space-y-0.5 border-t border-borderline-900 pt-2">
        <div className="text-slate-400 font-medium mb-1">How to verify:</div>
        <div>1. Copy the Server Seed</div>
        <div>2. SHA-256 hash it using any tool</div>
        <div>3. Compare with the Server Seed Hash</div>
        <div className="text-emeraldwin-400">They must match ✓</div>
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  history: number[];
  buttonRef?: React.RefObject<HTMLButtonElement>;
}

export default function CrashFeedPopup({ open, onClose, history, buttonRef }: Props) {
  const [selectedRound, setSelectedRound] = useState<CrashRoundDetail | null>(null);

  if (!open) return null;

  // Get full provably-fair detail from engine (already loaded on startup)
  const detailHistory = crashEngine.getHistoryDetail();

  const popupWidth = 300;
  let top = 0;
  let left = 0;

  if (buttonRef?.current) {
    const rect = buttonRef.current.getBoundingClientRect();
    top = rect.top - 20;
    left = Math.max(8, Math.min(rect.right - popupWidth - 20, window.innerWidth - popupWidth - 8));
  }

  // Merge: use detailHistory if available, fallback to plain numbers
  const rounds: CrashRoundDetail[] = detailHistory.length > 0
    ? detailHistory
    : history.slice(0, 20).map((bp, i) => ({
        bust_point: bp,
        round_uuid: String(i),
        server_seed: null,
        server_seed_hash: '—',
        created_at: new Date().toISOString(),
      }));

  return (
    <div
      className="fixed z-50 w-[300px] rounded-2xl bg-slatepanel-800/95 border border-borderline-800 shadow-2xl backdrop-blur-sm overflow-hidden"
      style={{ top, left }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Title */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-white font-semibold text-sm">Recent Crashes</span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-emeraldwin-400 text-xs font-medium">
            <ShieldCheck size={11} />
            Provably Fair
          </span>
          <button onClick={onClose} className="text-slate-500 hover:text-white ml-1"><X size={14} /></button>
        </div>
      </div>

      {/* Bubbles */}
      <div className="px-2 pb-2 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
        {rounds.length === 0 ? (
          <div className="text-slate-500 text-xs p-2 w-full text-center">Waiting for crashes…</div>
        ) : (
          rounds.map((round, idx) => {
            const x = round.bust_point;
            const isWin = x >= 2;
            const displayText = x.toFixed(2) + '×';
            const textLength = displayText.length;
            let textSize = 'text-xs';
            let minBoxWidth = 'min-w-11';
            if (textLength > 8) { textSize = 'text-[8px]'; minBoxWidth = 'min-w-14'; }
            else if (textLength > 6) { textSize = 'text-[9px]'; minBoxWidth = 'min-w-12'; }
            else if (textLength > 5) { textSize = 'text-[10px]'; minBoxWidth = 'min-w-11'; }

            const isSelected = selectedRound?.round_uuid === round.round_uuid;

            return (
              <div key={round.round_uuid ?? idx} className="flex flex-col items-center">
                <button
                  onClick={() => setSelectedRound(isSelected ? null : round)}
                  className={[
                    'rounded px-1.5 py-2 text-center flex items-center justify-center',
                    'border transition-all hover:scale-105 min-h-11 flex-shrink-0',
                    minBoxWidth,
                    isSelected ? 'ring-1 ring-neon-400 scale-105' : '',
                    isWin
                      ? 'bg-emeraldwin-500/15 border-emeraldwin-500/40 text-emeraldwin-300'
                      : 'bg-coral-500/15 border-coral-500/40 text-coral-300',
                  ].join(' ')}
                  title="Tap to verify"
                >
                  <span className={`${textSize} font-bold leading-tight`}>
                    {displayText}
                  </span>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Verify panel for selected round */}
      {selectedRound && (
        <div className="px-2 pb-2">
          <VerifyPanel round={selectedRound} onClose={() => setSelectedRound(null)} />
        </div>
      )}

      {/* Footer hint */}
      {!selectedRound && rounds.length > 0 && (
        <div className="text-center text-slate-600 text-[10px] pb-2">
          Tap any result to verify fairness
        </div>
      )}
    </div>
  );
}
