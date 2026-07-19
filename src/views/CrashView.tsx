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
      // Full cleanup on unmount — silence ALL crash audio sources (bgm, hum, sfx)
      import('../lib/crashAudio').then((m) => { m.setCrashAudioActive(false); });
    };
  }, []);


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

        {/* Round number badge removed — local counter was not in sync with server */}
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
          aria-label={feedOpen ? "Close crash feed" : "Open crash feed"}
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
