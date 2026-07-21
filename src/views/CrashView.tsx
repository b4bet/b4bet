import { useEffect, useState, useRef } from 'react';
import { crashEngine } from '../lib/crashEngine';
import { useCrashState, useCrashHistory, useGameLogos } from '../lib/hooks';
import CrashCanvas from '../components/CrashCanvas';
import DualBetPanel from '../components/DualBetPanel';
import CrashSettingsModal from '../components/CrashSettingsModal';
import CashoutPopupOverlay from '../components/CashoutPopupOverlay';
import CrashFeedPopup from '../components/CrashFeedPopup';
import CrashHistoryTabs from '../components/CrashHistoryTabs';
import { Settings, History, Rocket } from 'lucide-react';

function multiplierColor(x: number) {
  if (x >= 10) return 'text-yellow-300 bg-yellow-500/15 border-yellow-400/50';
  if (x >= 3) return 'text-cyan-300 bg-cyan-500/10 border-cyan-400/40';
  if (x >= 2) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40';
  if (x >= 1.5) return 'text-white bg-white/5 border-white/20';
  return 'text-red-400 bg-red-500/10 border-red-500/40';
}

export default function CrashView({ onBack }: { onBack?: () => void }) {
  const state = useCrashState();
  const history = useCrashHistory();
  const logos = useGameLogos();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
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

  // Last 10 history entries from Supabase (loaded by crashEngine on startup)
  const recentHistory = history.slice(0, 10);

  return (
    <div className="flex flex-col h-full w-full bg-slatepanel-950 select-none">

      {/* Top header row — logo · settings · feed */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {logos.crash ? (
            <img src={logos.crash} alt="JetX" className="h-7 object-contain" />
          ) : (
            <Rocket className="w-5 h-5 text-purple-400" />
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
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
              <span className="text-neon-400 font-bold text-xs leading-none">✕</span>
            ) : (
              <History size={15} className="text-slate-400" />
            )}
          </button>
        </div>
      </div>

      <CrashSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} buttonRef={settingsButtonRef} />
      <CrashFeedPopup open={feedOpen} onClose={() => setFeedOpen(false)} history={history} buttonRef={feedButtonRef} />

      {/* ── Recent Crash History Bar (last 10 from Supabase) ── */}
      <div
        className="flex items-center gap-1 px-2 pb-1 flex-shrink-0 flex-nowrap overflow-x-auto"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {recentHistory.length === 0 ? (
          // Skeleton placeholders while loading
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 h-6 w-11 rounded bg-slatepanel-800 animate-pulse" />
          ))
        ) : (
          recentHistory.map((bp, i) => (
            <span
              key={i}
              className={`flex-shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded border ${multiplierColor(bp)}`}
            >
              {bp.toFixed(2)}×
            </span>
          ))
        )}
      </div>

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
