import { useEffect, useRef, useState } from 'react';
import { HelpCircle, Menu, Volume2, Music, X, Wallet, ChevronLeft, Plane } from 'lucide-react';
import { AviatorLogo } from './AviatorLogo';
import { Toggle } from './Toggle';
import { formatMoney } from './game/format';

interface HeaderProps {
  balance: number;
  soundOn: boolean;
  musicOn: boolean;
  animationOn: boolean;
  onToggleSound: (v: boolean) => void;
  onToggleMusic: (v: boolean) => void;
  onToggleAnimation: (v: boolean) => void;
  onBack?: () => void;
}

export function Header({ balance, soundOn, musicOn, animationOn, onToggleSound, onToggleMusic, onToggleAnimation, onBack }: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  return (
    <header className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 bg-ink-800 border-b border-ink-600/60">
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="hidden flex items-center gap-0.5 h-7 px-2 rounded-lg bg-ink-700 border border-ink-500/70 hover:border-aviator-blue/60 transition-colors text-gray-300 hover:text-white active:scale-95"
            aria-label="Go back"
          >
            <ChevronLeft className="w-3 h-3" strokeWidth={2.5} />
            <span className="text-[10px] font-bold">Back</span>
          </button>
        )}
        <AviatorLogo size="md" />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => setHowToOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-ink-700 hover:bg-ink-650 border border-ink-500/70 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold text-gray-200 transition-colors"
        >
          <HelpCircle className="h-4 w-4 text-aviator-blue" />
          <span className="hidden sm:inline">How to Play</span>
        </button>

        <div className="hidden">
          <Wallet className="h-4 w-4 text-aviator-green" />
          <span className="font-mono font-bold text-aviator-green text-sm sm:text-base tabular-nums">
            {formatMoney(balance)}
          </span>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="flex items-center justify-center rounded-lg bg-ink-700 hover:bg-ink-650 border border-ink-500/70 p-2 transition-colors"
            aria-label="Settings"
          >
            <Menu className="h-5 w-5 text-gray-200" />
          </button>

          {settingsOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-ink-700 border border-ink-500/80 shadow-2xl z-50 animate-slide-up overflow-hidden">
              <div className="px-4 py-3 border-b border-ink-600 flex items-center justify-between">
                <span className="text-sm font-bold text-white">Settings</span>
                <button onClick={() => setSettingsOpen(false)} className="text-gray-400 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-2">
                <SettingRow
                  icon={<Volume2 className="h-4 w-4 text-aviator-blue" />}
                  label="Sound Effects"
                  checked={soundOn}
                  onChange={onToggleSound}
                />
                <SettingRow
                  icon={<Music className="h-4 w-4 text-aviator-purple" />}
                  label="Background Music"
                  checked={musicOn}
                  onChange={onToggleMusic}
                />
                <SettingRow
                  icon={<Plane className="h-4 w-4 text-aviator-green" />}
                  label="Animation"
                  checked={animationOn}
                  onChange={onToggleAnimation}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {howToOpen && <HowToPlayModal onClose={() => setHowToOpen(false)} />}
    </header>
  );
}

function SettingRow({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-ink-650">
      <div className="flex items-center gap-2.5">
        {icon}
        <span className="text-sm font-medium text-gray-200">{label}</span>
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-ink-700 border border-ink-500/80 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-600">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-aviator-red" />
            How to Play
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm text-gray-300 leading-relaxed">
          <Step n={1} title="Place your bet">
            During the countdown, press <span className="text-aviator-green font-semibold">BET</span> on either
            panel before the plane takes off.
          </Step>
          <Step n={2} title="Watch the multiplier climb">
            Once the plane launches, the multiplier rises from 1.00x. The longer it flies, the bigger your
            potential win.
          </Step>
          <Step n={3} title="Cash out in time">
            Hit <span className="text-aviator-orange font-semibold">CASH OUT</span> before the plane flies away.
            Your win = bet × multiplier at cash-out.
          </Step>
          <Step n={4} title="Don't wait too long">
            If the plane flies away before you cash out, your bet is lost for that round.
          </Step>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-aviator-red/20 text-aviator-red font-bold text-sm">
        {n}
      </div>
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="text-gray-400">{children}</p>
      </div>
    </div>
  );
}
