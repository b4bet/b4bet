/**
 * CrashFeedPopup — Recent Crashes with Provably Fair verification.
 * Reads history from crashEngine (already loaded on startup) — no separate API call.
 */
import { useState } from 'react';
import { crashEngine } from '../lib/crashEngine';
import type { CrashRoundDetail } from '../lib/game-service';
import { X, ShieldCheck, Copy, ExternalLink } from 'lucide-react';

function multiplierColor(x: number): string {
  if (x >= 10) return 'bg-yellow-500/15 border-yellow-400/50 text-yellow-300';
  if (x >= 3)  return 'bg-cyan-500/10  border-cyan-400/40  text-cyan-300';
  if (x >= 2)  return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300';
  if (x >= 1.5) return 'bg-white/5 border-white/20 text-white';
  return 'bg-red-500/15 border-red-500/40 text-red-400';
}

// ── Verify Panel ──────────────────────────────────────────────────────────────

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
    <div className="mt-3 rounded-xl border border-neon-500/30 bg-slatepanel-800 p-3 space-y-3 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-neon-400 font-semibold">
          <ShieldCheck size={13} />
          Provably Fair — {round.bust_point.toFixed(2)}×
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white">
          <X size={13} />
        </button>
      </div>

      {/* Hash */}
      <div className="space-y-1">
        <p className="text-slate-400">Server Seed Hash (before round)</p>
        <div className="flex items-center gap-2 bg-black/30 rounded-lg px-2 py-1.5">
          <span className="font-mono text-[10px] text-slate-300 break-all flex-1 select-all">
            {round.server_seed_hash}
          </span>
          <button onClick={() => copy(round.server_seed_hash, 'hash')} className="flex-shrink-0 text-slate-500 hover:text-white">
            {copied === 'hash' ? <span className="text-neon-400 text-[10px]">✓</span> : <Copy size={11} />}
          </button>
        </div>
      </div>

      {/* Seed */}
      {round.server_seed ? (
        <div className="space-y-1">
          <p className="text-slate-400">Server Seed (revealed after crash)</p>
          <div className="flex items-center gap-2 bg-black/30 rounded-lg px-2 py-1.5">
            <span className="font-mono text-[10px] text-slate-300 break-all flex-1 select-all">
              {round.server_seed}
            </span>
            <button onClick={() => copy(round.server_seed!, 'seed')} className="flex-shrink-0 text-slate-500 hover:text-white">
              {copied === 'seed' ? <span className="text-neon-400 text-[10px]">✓</span> : <Copy size={11} />}
            </button>
          </div>
          <p className="text-slate-500">SHA-256(server_seed) must match the hash above.</p>
          <a
            href="https://emn178.github.io/online-tools/sha256.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-neon-400 hover:text-neon-300"
          >
            Verify online <ExternalLink size={10} />
          </a>
        </div>
      ) : (
        <p className="text-slate-500 italic">Server seed will be revealed after the round ends.</p>
      )}

      {/* How it works */}
      <div className="text-slate-500 space-y-0.5 border-t border-white/10 pt-2">
        <p className="font-medium text-slate-400">How to verify:</p>
        <p>1. Copy the Server Seed above</p>
        <p>2. SHA-256 hash it with any online tool</p>
        <p>3. Compare with the Server Seed Hash</p>
        <p>4. They must match — proves result was pre-determined</p>
      </div>
    </div>
  );
}

// ── Main Popup ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  history: number[];
  buttonRef?: React.RefObject<HTMLButtonElement>;
}

export default function CrashFeedPopup({ open, onClose, history, buttonRef }: Props) {
  const [selectedRound, setSelectedRound] = useState<CrashRoundDetail | null>(null);

  if (!open) return null;

  // Read detail from engine (loaded on startup, refreshed after each crash)
  const detailHistory = crashEngine.getHistoryDetail();

  // Merge: prefer detail, fallback to plain numbers from history bar
  const rounds: CrashRoundDetail[] = detailHistory.length > 0
    ? detailHistory
    : history.slice(0, 20).map((bp, i) => ({
        bust_point: bp,
        round_uuid: String(i),
        server_seed_hash: '—',
        server_seed: null,
        created_at: new Date().toISOString(),
      }));

  // Positioning relative to button
  const popupWidth = 300;
  let top = 0;
  let left = 0;
  if (buttonRef?.current) {
    const rect = buttonRef.current.getBoundingClientRect();
    top = rect.top - 20;
    left = Math.max(8, Math.min(rect.right - popupWidth - 20, window.innerWidth - popupWidth - 8));
  }

  return (
    <div
      className="fixed z-50 w-[300px] rounded-2xl border border-borderline-900 bg-slatepanel-900 shadow-2xl overflow-hidden"
      style={{ top, left }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-3 space-y-3 max-h-[80vh] overflow-y-auto">
        {/* Title */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-white">Recent Crashes</span>
            <span className="flex items-center gap-0.5 text-[10px] text-neon-400 border border-neon-500/30 rounded px-1 py-0.5">
              <ShieldCheck size={9} /> Provably Fair
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={15} />
          </button>
        </div>

        {/* Bubbles grid */}
        <div className="flex flex-wrap gap-1.5">
          {rounds.length === 0 ? (
            <p className="text-slate-500 text-xs">Waiting for crashes…</p>
          ) : (
            rounds.map((round, idx) => {
              const x = round.bust_point;
              const isSelected = selectedRound?.round_uuid === round.round_uuid;
              return (
                <button
                  key={round.round_uuid || idx}
                  onClick={() => setSelectedRound(isSelected ? null : round)}
                  className={[
                    'rounded px-2 py-1.5 text-xs font-semibold border transition-all hover:scale-105 min-w-[44px] text-center',
                    isSelected ? 'ring-1 ring-neon-400 scale-105' : '',
                    multiplierColor(x),
                  ].join(' ')}
                  title="Tap to verify"
                >
                  {x.toFixed(2)}×
                </button>
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
          <p className="text-center text-[10px] text-slate-500">Tap any result to verify fairness</p>
        )}
      </div>
    </div>
  );
}
