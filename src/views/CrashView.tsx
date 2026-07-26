import { useEffect, useState, useRef } from 'react';
import { crashEngine } from '../lib/crashEngine';
import { useCrashState, useCrashHistory, useGameLogos } from '../lib/hooks';
import CrashCanvas from '../components/CrashCanvas';
import DualBetPanel from '../components/DualBetPanel';
import CrashSettingsModal from '../components/CrashSettingsModal';
import CashoutPopupOverlay from '../components/CashoutPopupOverlay';
import CrashFeedPopup from '../components/CrashFeedPopup';
import CrashHistoryTabs from '../components/CrashHistoryTabs';
import { startCrashPendingBetsSync } from '../lib/crashPendingBets';
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
    // Start syncing bets to Supabase for All Bets tab
    startCrashPendingBetsSync();
  }, []);

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
    <div className="flex flex-col gap-3 pb-4 min-h-0">
      {/* Top header row — logo · settings · feed */}
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0 w-9 h-9 rounded-xl overflow-hidden">
            {logos.crash ? (
              <img src={logos.crash} alt="Crash" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-neon-500/40 to-emeraldwin-500/40 grid place-items-center">
                <Rocket size={18} className="text-neon-300" />
              </div>
            )}
          </div>
          <span className="text-base font-bold text-white truncate">Crash</span>
        </div>

        <div className="flex items-center gap-2">
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
              <span className="text-neon-300">
                <History size={16} />
              </span>
            ) : (
              <History size={16} className="text-slate-400" />
            )}
          </button>
        </div>
      </div>

      <CrashSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} buttonRef={settingsButtonRef} />
      <CrashFeedPopup open={feedOpen} onClose={() => setFeedOpen(false)} history={history} buttonRef={feedButtonRef} />

      {/* ── Recent Crash History Bar (last 10 from Supabase) ── */}
      <div className="flex gap-1.5 px-1 overflow-x-auto scrollbar-none flex-shrink-0">
        {recentHistory.length === 0 ? (
          // Skeleton placeholders while loading
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 h-7 w-16 rounded-lg bg-slatepanel-700 animate-pulse" />
          ))
        ) : (
          recentHistory.map((bp, i) => (
            <div
              key={i}
              className={`flex-shrink-0 h-7 px-2.5 rounded-lg border text-[11px] font-bold grid place-items-center whitespace-nowrap ${multiplierColor(bp)}`}
            >
              {bp.toFixed(2)}×
            </div>
          ))
        )}
      </div>

      {/* Game canvas with overlay popup container */}
      <div className="relative flex-shrink-0">
        <CrashCanvas />
        <CashoutPopupOverlay />
      </div>

      {/* Dual stacked betting panels */}
      <DualBetPanel />

      {/* History tabs */}
      <div className="px-1">
        <CrashHistoryTabs />
      </div>
    </div>
  );
}
