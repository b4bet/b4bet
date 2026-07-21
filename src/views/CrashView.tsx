import { useEffect, useState, useRef } from 'react';
import { crashEngine } from '../lib/crashEngine';
import { useCrashState, useCrashHistory, useGameLogos } from '../lib/hooks';
import CrashCanvas from '../components/CrashCanvas';
import DualBetPanel from '../components/DualBetPanel';
import CrashSettingsModal from '../components/CrashSettingsModal';
import CashoutPopupOverlay from '../components/CashoutPopupOverlay';
import CrashFeedPopup from '../components/CrashFeedPopup';
import CrashHistoryTabs from '../components/CrashHistoryTabs';
import { Settings, History, Rocket, ShieldCheck, X, Copy, ExternalLink } from 'lucide-react';
import type { CrashRoundDetail } from '../lib/game-service';

function multiplierColor(x: number) {
  if (x >= 10) return 'text-yellow-300 bg-yellow-500/15 border-yellow-400/50';
  if (x >= 3) return 'text-cyan-300 bg-cyan-500/10 border-cyan-400/40';
  if (x >= 2) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40';
  if (x >= 1.5) return 'text-white bg-white/5 border-white/20';
  return 'text-red-400 bg-red-500/10 border-red-500/40';
}

// ── Inline Verify Panel ───────────────────────────────────────────────────────

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
    <div className="mx-2 mt-1 mb-2 rounded-xl border border-neon-500/30 bg-slatepanel-800 p-3 space-y-3 text-xs">
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

export default function CrashView({ onBack }: { onBack?: () => void }) {
  const state = useCrashState();
  const history = useCrashHistory();
  const logos = useGameLogos();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [selectedRound, setSelectedRound] = useState<CrashRoundDetail | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const feedButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    import('../lib/crashAudio').then((m) => { m.setCrashAudioActive(true); m.startBgm(); });
    const onVis = () => {
      if (document.hidden) {
        import('../lib/crashAudio').then((m) => { m.stopBgm(); m.stopHum(); });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      import('../lib/crashAudio').then((m) => { m.setCrashAudioActive(false); });
    };
  }, []);

  const recentHistory = history.slice(0, 10);
  const detailHistory = crashEngine.getHistoryDetail();

  const handleBubbleClick = (bp: number, idx: number) => {
    // Find matching detail by index or bust_point
    const detail = detailHistory[idx] ?? detailHistory.find((d) => d.bust_point === bp);
    if (!detail) {
      // Fallback: show minimal panel
      const fallback: CrashRoundDetail = {
        bust_point: bp,
        round_uuid: String(idx),
        server_seed_hash: '—',
        server_seed: null,
        created_at: new Date().toISOString(),
      };
      setSelectedRound((prev) => (prev?.round_uuid === fallback.round_uuid ? null : fallback));
      return;
    }
    setSelectedRound((prev) => (prev?.round_uuid === detail.round_uuid ? null : detail));
  };

  return (
    <div className="flex flex-col h-full w-full bg-slatepanel-950 select-none">

      {/* ── Top header row — logo · provably fair badge · settings · feed ── */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 min-w-0">
          {logos.crash ? (
            <img src={logos.crash} alt="Crash" className="h-7 w-auto object-contain flex-shrink-0" />
          ) : (
            <Rocket size={20} className="text-neon-400 flex-shrink-0" />
          )}
        </div>

        {/* Right side: Provably Fair badge + settings + feed */}
        <div className="flex items-center gap-2 flex-shrink-0">

          <button
            onClick={() => setFeedOpen(!feedOpen)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emeraldwin-500/10 border border-emeraldwin-500/30 hover:border-emeraldwin-400/60 transition-colors"
            aria-label="Provably fair — tap to verify"
          >
            <ShieldCheck size={12} className="text-emeraldwin-400 flex-shrink-0" />
            <span className="text-emeraldwin-400 text-[11px] font-semibold leading-none">Provably Fair</span>
          </button>

          <button
            ref={settingsButtonRef}
            onClick={() => setSettingsOpen(true)}
            className="w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-emeraldwin-400/60 transition-colors flex-shrink-0"
            aria-label="Game settings"
          >
            <Settings size={16} className="text-slate-400" />
          </button>

          <button
            ref={feedButtonRef}
            onClick={() => setFeedOpen(!feedOpen)}
            className="w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60 transition-colors flex-shrink-0"
            aria-label={feedOpen ? 'Close crash feed' : 'Open crash feed'}
          >
            {feedOpen ? (
              <div className="relative">
                <History size={16} className="text-neon-400" />
              </div>
            ) : (
              <History size={16} className="text-slate-400" />
            )}
          </button>
        </div>
      </div>

      <CrashSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} buttonRef={settingsButtonRef} />
      <CrashFeedPopup open={feedOpen} onClose={() => setFeedOpen(false)} history={history} buttonRef={feedButtonRef} />

      {/* ── Recent Crash History Bar (clickable bubbles) ── */}
      <div className="flex flex-col px-2 pb-1 flex-shrink-0 gap-0.5">
        <div className="flex items-center gap-1 flex-nowrap overflow-x-auto hide-scrollbar">
          {recentHistory.length === 0 ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 h-6 w-11 rounded bg-slatepanel-800 animate-pulse" />
            ))
          ) : (
            recentHistory.map((bp, i) => {
              const detail = detailHistory[i] ?? detailHistory.find((d) => d.bust_point === bp);
              const isSelected = selectedRound && (detail ? selectedRound.round_uuid === detail.round_uuid : selectedRound.bust_point === bp && selectedRound.round_uuid === String(i));
              return (
                <button
                  key={i}
                  onClick={() => handleBubbleClick(bp, i)}
                  className={[
                    'flex-shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded border transition-all hover:scale-105',
                    isSelected ? 'ring-1 ring-neon-400 scale-105' : '',
                    multiplierColor(bp),
                  ].join(' ')}
                  title="Tap to verify fairness"
                >
                  {bp.toFixed(2)}×
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Inline Verify Panel (shows below history bar on tap) ── */}
      {selectedRound && (
        <VerifyPanel round={selectedRound} onClose={() => setSelectedRound(null)} />
      )}

      {/* Game canvas with overlay popup container */}
      <div className="relative flex-1 min-h-0">
        <CrashCanvas state={state} />
        <CashoutPopupOverlay />
      </div>

      {/* Dual stacked betting panels */}
      <DualBetPanel />

      {/* History tabs */}
      <CrashHistoryTabs />
    </div>
  );
}
