import { useEffect, useRef, useState } from 'react';
import { HelpCircle, Menu, Volume2, Music, X, Wallet, Plane } from 'lucide-react';
import { Toggle } from './Toggle';
import { formatMoney } from './game/format';
import { useGameLogos } from '../../lib/hooks';

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

export function Header({ balance, soundOn, musicOn, animationOn, onToggleSound, onToggleMusic, onToggleAnimation }: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const logos = useGameLogos();
  const aviatorLogo = logos['aviator'];

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
    <header className="flex items-center gap-2 px-3 py-2 bg-ink-900 border-b border-ink-700/60 relative z-10">
      {/* Logo — round shape, bigger, left aligned */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {aviatorLogo ? (
          <img
            src={aviatorLogo}
            alt="Aviator"
            className="w-12 h-12 rounded-full object-cover flex-shrink-0 ring-2 ring-red-500/40"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center flex-shrink-0 ring-2 ring-red-500/40">
            <Plane className="w-6 h-6 text-white" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-black text-white leading-none">Aviator</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Crash Game</p>
        </div>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => setHowToOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-ink-700 hover:bg-ink-650 border border-ink-500/70 px-2 py-1.5 text-xs font-semibold text-gray-200 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">How to Play</span>
        </button>

        {/* Balance */}
        <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-ink-700 border border-ink-500/70">
          <Wallet className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span className="text-white text-xs font-bold tabular-nums whitespace-nowrap">
            {formatMoney(balance)}
          </span>
        </div>

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="flex items-center justify-center rounded-lg bg-ink-700 hover:bg-ink-650 border border-ink-500/70 p-2 transition-colors"
            aria-label="Settings"
          >
            <Menu className="w-4 h-4 text-gray-300" />
          </button>

          {settingsOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-ink-800 border border-ink-600 rounded-xl shadow-2xl z-50 p-3 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-bold text-white">Settings</p>
                <button onClick={() => setSettingsOpen(false)} className="text-gray-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <SettingRow
                icon={<Volume2 className="w-4 h-4" />}
                label="Sound Effects"
                checked={soundOn}
                onChange={onToggleSound}
              />
              <SettingRow
                icon={<Music className="w-4 h-4" />}
                label="Background Music"
                checked={musicOn}
                onChange={onToggleMusic}
              />
              <SettingRow
                icon={<Plane className="w-4 h-4" />}
                label="Animation"
                checked={animationOn}
                onChange={onToggleAnimation}
              />
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
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-gray-300">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-ink-800 border border-ink-600 rounded-2xl p-6 max-w-sm w-full space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plane className="w-5 h-5 text-red-400" />
            <h2 className="font-bold text-white">How to Play</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3">
          <Step n={1} title="Place Your Bet">
            During the countdown, press BET on either panel before the plane takes off.
          </Step>
          <Step n={2} title="Watch the Multiplier">
            Once the plane launches, the multiplier rises from 1.00x. The longer it flies, the bigger your potential win.
          </Step>
          <Step n={3} title="Cash Out in Time">
            Hit CASH OUT before the plane flies away. Your win = bet × multiplier at cash-out.
          </Step>
          <Step n={4} title="Don't Wait Too Long">
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
      <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-red-400 text-xs font-bold">{n}</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{children}</p>
      </div>
    </div>
  );
}
