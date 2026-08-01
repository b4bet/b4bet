import { useEffect, useState, useRef } from 'react';
import { crashEngine } from '../lib/crashEngine';
import { useCrashState, useCrashHistory, useGameLogos, useBalance } from '../lib/hooks';
import CrashCanvas from '../components/CrashCanvas';
import DualBetPanel from '../components/DualBetPanel';
import CrashSettingsModal from '../components/CrashSettingsModal';
import CashoutPopupOverlay from '../components/CashoutPopupOverlay';
import CrashFeedPopup from '../components/CrashFeedPopup';
import CrashHistoryTabs from '../components/CrashHistoryTabs';
import { startCrashPendingBetsSync } from '../lib/crashPendingBets';
import { Settings, History, Rocket, Wallet } from 'lucide-react';
import { store } from '../lib/store';

function multiplierColor(x: number) {
  if (x >= 10) return 'text-yellow-300 bg-yellow-500/15 border-yellow-400/50';
  if (x >= 3)  return 'text-cyan-300 bg-cyan-500/10 border-cyan-400/40';
  if (x >= 2)  return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40';
  if (x >= 1.5) return 'text-white bg-white/5 border-white/20';
  return 'text-red-400 bg-red-500/10 border-red-500/40';
}

interface Props { onBack?: () => void; }

export default function CrashView({ onBack }: Props) {
  const state = useCrashState();
  const history = useCrashHistory();
  const logos = useGameLogos();
  const balance = useBalance();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const feedButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
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

  // Lock body scroll while crash game is mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Mobile back button — go home
  useEffect(() => {
    if (!onBack) return;
    window.history.pushState({ crashView: true }, '');
    const handlePopstate = () => { onBack(); };
    window.addEventListener('popstate', handlePopstate);
    return () => { window.removeEventListener('popstate', handlePopstate); };
  }, [onBack]);

  const recentHistory = history.slice(0, 10);

  // Total height = 100dvh minus bottom nav (52px)
  // Header = 52px, history bar ~36px, rest scrolls
  return (
    <div
      className="bg-midnight-950"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        // Reserve space for bottom nav
        paddingBottom: 52,
      }}
    >
      {/* ── Game Header ── */}
      <div
        className="flex items-center justify-between px-3 bg-slatepanel-900 border-b border-borderline-900"
        style={{ height: 52, flexShrink: 0 }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 bg-slatepanel-800 border border-borderline-900 grid place-items-center">
            {logos.crash ? (
              <img src={logos.crash} alt="Crash" className="w-full h-full object-cover" />
            ) : (
              <Rocket className="w-4 h-4 text-neon-400" />
            )}
          </div>
          <span className="text-sm font-bold text-white">JetX</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slatepanel-800 border border-borderline-900 rounded-xl px-2.5 py-1">
            <Wallet className="w-3 h-3 text-emeraldwin-400" />
            {balance < 0 ? (
              <span className="text-xs font-bold text-white/40">...</span>
            ) : (
              <span className="text-xs font-bold text-emeraldwin-400">
                {store.currency}{balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
          <button
            ref={settingsButtonRef}
            onClick={() => setSettingsOpen(true)}
            className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-emeraldwin-400/60 transition-colors flex-shrink-0"
            aria-label="Game settings"
          >
            <Settings className="w-4 h-4 text-white/60" />
          </button>
          <button
            ref={feedButtonRef}
            onClick={() => setFeedOpen(!feedOpen)}
            className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60 transition-colors flex-shrink-0"
            aria-label={feedOpen ? 'Close crash feed' : 'Open crash feed'}
          >
            <History className={`w-4 h-4 ${feedOpen ? 'text-neon-400' : 'text-white/60'}`} />
          </button>
        </div>
      </div>

      <CrashSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} buttonRef={settingsButtonRef} />
      <CrashFeedPopup open={feedOpen} onClose={() => setFeedOpen(false)} history={history} buttonRef={feedButtonRef} />

      {/* ── Recent History Bar ── */}
      <div className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none bg-slatepanel-900/50" style={{ flexShrink: 0 }}>
        {recentHistory.length === 0
          ? Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-5 w-12 rounded-md bg-slatepanel-800 animate-pulse flex-shrink-0" />
            ))
          : recentHistory.map((bp, i) => (
              <span key={i} className={`text-[11px] font-bold px-2 py-0.5 rounded-md border flex-shrink-0 ${multiplierColor(bp)}`}>
                {bp.toFixed(2)}×
              </span>
            ))
        }
      </div>

      {/* ── Scrollable content ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'scroll',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch', // smooth momentum scroll on iOS/Android
          overscrollBehavior: 'contain',
        }}
      >
        <div className="relative px-3 pt-2">
          <CrashCanvas state={state} />
          <CashoutPopupOverlay />
        </div>
        <div className="px-3 pt-2">
          <DualBetPanel />
        </div>
        <div className="px-3 pt-2 pb-4">
          <CrashHistoryTabs />
        </div>
      </div>
    </div>
  );
}
