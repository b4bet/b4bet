/**
 * CrashFeedPopup — Recent Crashes with Provably Fair verification.
 * Players can tap any crash bubble to see server_seed + hash and verify.
 */
import { useEffect, useState } from 'react';
import { GameService } from '../lib/game-service';
import type { CrashRoundDetail } from '../lib/game-service';
import { X, ShieldCheck, Copy, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

function multiplierColor(x: number) {
  if (x >= 10) return 'text-amberx-300 bg-amberx-500/10 border-amberx-400/50';
  if (x >= 3)  return 'text-neon-300 bg-neon-500/10 border-neon-500/30';
  if (x >= 2)  return 'text-emeraldwin-400 bg-emeraldwin-500/10 border-emeraldwin-500/40';
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

  // Verification URL — sha256 online tool
  const verifyUrl = `https://emn178.github.io/online-tools/sha256.html`;

  return (
    <div className="mt-2 p-2.5 rounded-lg bg-slatepanel-800 border border-borderline-800 space-y-2 text-[10px]">
      <div className="flex items-center gap-1 text-neon-300 font-bold text-[11px]">
        <ShieldCheck className="w-3.5 h-3.5" />
        Provably Fair — {round.bust_point.toFixed(2)}×
        <button onClick={onClose} className="ml-auto text-slate-500 hover:text-white">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Hash (shown before round) */}
      <div>
        <p className="text-slate-500 mb-0.5 uppercase tracking-wider">Server Seed Hash (before round)</p>
        <div className="flex items-center gap-1 bg-slatepanel-900 rounded px-2 py-1 font-mono break-all">
          <span className="flex-1 text-slate-300 select-all">{round.server_seed_hash}</span>
          <button onClick={() => copy(round.server_seed_hash, 'hash')} className="flex-shrink-0 text-slate-500 hover:text-white">
            {copied === 'hash' ? <span className="text-emeraldwin-400">✓</span> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Seed (revealed after crash) */}
      {round.server_seed ? (
        <div>
          <p className="text-slate-500 mb-0.5 uppercase tracking-wider">Server Seed (revealed after crash)</p>
          <div className="flex items-center gap-1 bg-slatepanel-900 rounded px-2 py-1 font-mono break-all">
            <span className="flex-1 text-emeraldwin-300 select-all">{round.server_seed}</span>
            <button onClick={() => copy(round.server_seed!, 'seed')} className="flex-shrink-0 text-slate-500 hover:text-white">
              {copied === 'seed' ? <span className="text-emeraldwin-400">✓</span> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <p className="text-slate-600 mt-1">
            SHA-256(server_seed) should match the hash above.
          </p>
          <a
            href={verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-neon-400 hover:text-neon-300 mt-1"
          >
            Verify online <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      ) : (
        <p className="text-slate-600 italic">Server seed will be revealed after the round ends.</p>
      )}

      {/* How it works */}
      <div className="border-t border-borderline-900 pt-2 text-slate-600 leading-relaxed">
        <p className="font-semibold text-slate-500 mb-0.5">How to verify:</p>
        <ol className="list-decimal list-inside space-y-0.5">
          <li>Copy the Server Seed above</li>
          <li>SHA-256 hash it using any tool</li>
          <li>Compare with the Server Seed Hash</li>
          <li>They must match — proves result was pre-determined</li>
        </ol>
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  history: number[];
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}

export default function CrashFeedPopup({ open, onClose, history, buttonRef }: Props) {
  const [detailHistory, setDetailHistory] = useState<CrashRoundDetail[]>([]);
  const [selectedRound, setSelectedRound] = useState<CrashRoundDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    GameService.crashGetHistoryDetail()
      .then((r) => setDetailHistory(r.history))
      .catch(() => setDetailHistory([]))
      .finally(() => setLoading(false));
  }, [open, history.length]);

  if (!open) return null;

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
        server_seed_hash: '—',
        created_at: new Date().toISOString(),
      }));

  return (
    <div className="fixed inset-0 z-50 pointer-events-none" onClick={onClose}>
      <div
        style={{
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
          width: `${popupWidth}px`,
          maxHeight: '620px',
          overflowY: 'auto',
        }}
        className="bg-slatepanel-900/95 backdrop-blur-sm border border-borderline-900 rounded-xl shadow-2xl p-3 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="mb-2 pb-2 border-b border-borderline-800 flex items-center gap-1.5">
          <p className="text-xs font-bold text-neon-300 uppercase tracking-widest flex-1">Recent Crashes</p>
          <ShieldCheck className="w-3.5 h-3.5 text-emeraldwin-400" />
          <span className="text-[10px] text-emeraldwin-400 font-semibold">Provably Fair</span>
        </div>

        {loading && (
          <p className="text-[10px] text-slate-600 text-center py-2">Loading…</p>
        )}

        {/* Bubbles */}
        <div className="flex flex-wrap gap-1">
          {rounds.length === 0 ? (
            <div className="w-full text-center py-4">
              <span className="text-[10px] text-slate-600">Waiting for crashes…</span>
            </div>
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
                <div key={idx} className="flex flex-col items-center">
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
                    <span className={`tabular font-bold ${textSize} whitespace-nowrap`}>
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
          <VerifyPanel round={selectedRound} onClose={() => setSelectedRound(null)} />
        )}

        {/* Footer hint */}
        {!selectedRound && rounds.length > 0 && (
          <p className="text-[9px] text-slate-700 text-center mt-2">
            Tap any result to verify fairness
          </p>
        )}
      </div>
    </div>
  );
}
