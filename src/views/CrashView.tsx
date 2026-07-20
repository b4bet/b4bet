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
  if (x >= 10)  return 'text-yellow-300 bg-yellow-500/15 border-yellow-400/50';
  if (x >= 3)   return 'text-cyan-300 bg-cyan-500/10 border-cyan-400/40';
  if (x >= 2)   return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40';
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
    <div className="space-y-2 animate-fade-in">
      {/* Top header row — logo · settings · feed */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center overflow-hidden">
            {logos.crash ? (
              <img src={logos.crash} alt="Crash" className="w-full h-full object-contain" />
            ) : (
              <Rocket className="w-5 h-5 text-neon-300" />
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0" />

        <button
          ref={settingsButtonRef}
          onClick={() => setSettingsOpen(true)}
          className="w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-emeraldwin-400/60 transition-colors flex-shrink-0"
          aria-label="Game settings"
        >
          <Settings className="w-4 h-4 text-slate-300" />
        </button>
        <button
          ref={feedButtonRef}
          onClick={() => setFeedOpen(!feedOpen)}
          className="w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60 transition-colors flex-shrink-0"
          aria-label={feedOpen ? 'Close crash feed' : 'Open crash feed'}
        >
          {feedOpen ? (
            <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          ) : (
            <History className="w-4 h-4 text-slate-300" />
          )}
        </button>
      </div>

      <CrashSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} buttonRef={settingsButtonRef} />
      <CrashFeedPopup open={feedOpen} onClose={() => setFeedOpen(false)} history={history} buttonRef={feedButtonRef} />

      {/* ── Recent Crash History Bar (last 10 from Supabase) ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-0.5 py-0.5">
        {recentHistory.length === 0 ? (
          // Skeleton placeholders while loading
          Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 h-7 w-12 rounded-md bg-slatepanel-800 border border-borderline-900 animate-pulse"
            />
          ))
        ) : (
          recentHistory.map((bp, i) => (
            <div
              key={i}
              className={[
                'flex-shrink-0 h-7 px-2 rounded-md border text-[11px] font-bold tabular-nums',
                'flex items-center justify-center whitespace-nowrap transition-all',
                multiplierColor(bp),
              ].join(' ')}
            >
              {bp.toFixed(2)}×
            </div>
          ))
        )}
      </div>

      {/* Game canvas with overlay popup container */}
      <div className="relative">
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
