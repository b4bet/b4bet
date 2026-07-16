import { useEffect, useRef, useState } from 'react';
import { X, Volume2, Music, Sparkles, BookOpen, Ruler } from 'lucide-react';
import { getSettings, setSettings, type CrashUiSettings } from '../lib/crashAudio';

export const getCrashSettings = getSettings;

const RULES_KEY = 'b4bet.crash.rules.v1';
const LIMITS_KEY = 'b4bet.crash.limits.v1';
const defaultRules =
`How to play Crash:
1. Place your bet during the countdown window.
2. Watch the multiplier climb after liftoff.
3. Tap CASH OUT before the rocket busts to lock your winnings.
4. If the rocket busts before you cash out, the stake is lost.

Auto Bet and Auto Cash Out will repeat your stake and exit at a preset multiplier automatically.

Provably fair: each round's bust point is generated from a server seed that is published after every round so you can verify the outcome.`;
const defaultLimits =
`Bet Limits:
• Minimum bet: ₹10
• Maximum bet: ₹50,000
• Maximum auto cash out: 1000.00x
• Maximum single-round win: ₹500,000

Session Limits:
• Auto Bet runs for up to 200 rounds per session.
• Daily wager cap: ₹10,00,000 (configurable per VIP tier).`;
export const getCrashRules = () => { try { return localStorage.getItem(RULES_KEY) || defaultRules; } catch { return defaultRules; } };
export const setCrashRules = (v: string) => { try { localStorage.setItem(RULES_KEY, v); } catch { /* */ } };
export const getCrashLimits = () => { try { return localStorage.getItem(LIMITS_KEY) || defaultLimits; } catch { return defaultLimits; } };
export const setCrashLimits = (v: string) => { try { localStorage.setItem(LIMITS_KEY, v); } catch { /* */ } };

interface Props { open: boolean; onClose: () => void; buttonRef?: React.RefObject<HTMLButtonElement | null>; }
type SubModal = null | 'rules' | 'limits';

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-neon-500' : 'bg-slatepanel-700'}`}>
      <span className={`absolute top-0.5 ${on ? 'left-5' : 'left-0.5'} w-5 h-5 rounded-full bg-white transition-all`} />
    </button>
  );
}

function multiplierColor(x: number) {
  if (x >= 10) return 'text-amberx-300 bg-amberx-500/10 border-amberx-400/50';
  if (x >= 3)  return 'text-neon-300 bg-neon-500/10 border-neon-500/30';
  if (x >= 2)  return 'text-emeraldwin-400 bg-emeraldwin-500/10 border-emeraldwin-500/40';
  if (x >= 1.5) return 'text-white bg-slatepanel-700 border-borderline-800';
  return 'text-coral-400 bg-coral-500/10 border-coral-500/40';
}

function MultiBubble({ x, size = 'sm' }: { x: number; size?: 'sm' | 'md' }) {
  const cls = multiplierColor(x);
  return (
    <span
      className={[
        'tabular font-extrabold rounded-md px-1.5 border leading-tight',
        size === 'md' ? 'text-xs py-0.5' : 'text-[10px] py-px',
        cls,
      ].join(' ')}
    >
      {x.toFixed(2)}×
    </span>
  );
}

export default function CrashSettingsModal({ open, onClose, buttonRef }: Props) {
  const [settings, setLocal] = useState<CrashUiSettings>(getSettings);
  const [sub, setSub] = useState<SubModal>(null);
  const subModalRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  let top = 0;
  let left = 0;
  const popupWidth = 300;

  if (buttonRef?.current) {
    const rect = buttonRef.current.getBoundingClientRect();
    top = rect.top - 20;
    left = Math.max(8, Math.min(rect.right - popupWidth - 20, window.innerWidth - popupWidth - 8));
  }

  useEffect(() => { setSettings(settings); }, [settings]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110]" onClick={onClose}>
      <div ref={modalRef} className="fixed bg-slatepanel-900 border border-borderline-900 rounded-2xl shadow-2xl animate-fade-in" 
        style={{
          top: `${top}px`,
          left: `${left}px`,
          width: `${popupWidth}px`,
          maxHeight: '500px',
          overflowY: 'auto',
          zIndex: 110
        }}
        onClick={(e) => e.stopPropagation()}>
        <div className="p-3 space-y-2 overflow-y-auto" style={{ maxHeight: '500px' }}>
          <Row icon={<Volume2 className="w-4 h-4 text-neon-300" />} label="Sound effects"
            right={<Toggle on={settings.sound} onChange={(v) => setLocal({ ...settings, sound: v })} />} />
          <Row icon={<Music className="w-4 h-4 text-neon-300" />} label="Background music"
            right={<Toggle on={settings.music} onChange={(v) => setLocal({ ...settings, music: v })} />} />
          <Row icon={<Sparkles className="w-4 h-4 text-neon-300" />} label="Animations"
            right={<Toggle on={settings.animation} onChange={(v) => setLocal({ ...settings, animation: v })} />} />

          <button onClick={() => setSub('rules')} className="w-full flex items-center gap-2 p-3 rounded-xl bg-midnight-850 border border-borderline-900 hover:border-neon-400/60 transition-colors">
            <BookOpen className="w-4 h-4 text-amberx-400" />
            <span className="flex-1 text-left text-sm font-semibold text-white">Rules of the Game</span>
          </button>
          <button onClick={() => setSub('limits')} className="w-full flex items-center gap-2 p-3 rounded-xl bg-midnight-850 border border-borderline-900 hover:border-neon-400/60 transition-colors">
            <Ruler className="w-4 h-4 text-emeraldwin-400" />
            <span className="flex-1 text-left text-sm font-semibold text-white">Game Limits</span>
          </button>
        </div>
      </div>

      {sub && (
        <div className="fixed inset-0 z-[120] pointer-events-none" onClick={() => setSub(null)}>
          <div 
            ref={subModalRef}
            className="fixed bg-slatepanel-900 border border-borderline-900 rounded-2xl shadow-2xl max-h-96 flex flex-col pointer-events-auto"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(90vw, 480px)',
              zIndex: 120
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <header className="flex items-center justify-between p-4 border-b border-borderline-900 flex-shrink-0">
              <h3 className="font-display font-bold text-white">
                {sub === 'rules' ? 'Rules of the Game' : 'Game Limits'}
              </h3>
              <button onClick={() => setSub(null)} className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center">
                <X className="w-4 h-4 text-slate-300" />
              </button>
            </header>

            {/* Content */}
            <div className="p-4 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed overflow-y-auto scrollbar-thin flex-1">
              {sub === 'rules' ? getCrashRules() : getCrashLimits()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, right }: { icon: React.ReactNode; label: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-midnight-850 border border-borderline-900">
      {icon}
      <span className="flex-1 text-sm font-semibold text-white">{label}</span>
      {right}
    </div>
  );
}
