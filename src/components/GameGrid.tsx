import { Rocket, Bomb, Plane, ArrowRight, Sun, BarChart2 } from 'lucide-react';
import type { Route } from './BottomNav';
import { useGameLogos } from '../lib/hooks';
import type { GameKey } from '../lib/gameLogos';
import { startAviatorBackgroundMusic } from './aviator/game/useGameAudio';

interface GameCardDef {
  key: Route;
  title: string;
  tag: string;
  icon: typeof Rocket;
  gradient: string;
  ring: string;
}

const games: GameCardDef[] = [
  { key: 'crash',     title: 'Crash',      tag: 'Real-time', icon: Rocket,    gradient: 'from-neon-500/30 to-neon-700/5',            ring: 'group-hover:border-neon-400' },
  { key: 'mines',     title: 'Mines',      tag: 'Strategy',  icon: Bomb,      gradient: 'from-coral-500/30 to-coral-700/5',           ring: 'group-hover:border-coral-400' },
  { key: 'aviator',   title: 'Aviator',    tag: 'Crash',     icon: Plane,     gradient: 'from-aviator-blue-soft/30 to-aviator-blue/5', ring: 'group-hover:border-aviator-blue' },
  { key: 'sunvsmoon', title: 'Sun & Moon', tag: 'Live',      icon: Sun,       gradient: 'from-yellow-500/30 to-yellow-700/5',         ring: 'group-hover:border-yellow-400' },
  { key: 'trading',   title: 'Trading',    tag: 'Binary',    icon: BarChart2, gradient: 'from-green-600/30 to-green-800/5',           ring: 'group-hover:border-green-500' },
];

export default function GameGrid({ onPlay }: { onPlay: (r: Route) => void }) {
  const logos = useGameLogos();

  // Split: 3 on top row, 2 on bottom row
  const topRow = games.slice(0, 3);
  const bottomRow = games.slice(3);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-white">Games</span>
        <button onClick={() => onPlay('games')} className="text-[11px] font-semibold text-neon-300 hover:text-neon-200 flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      {/* Top row: 3 games */}
      <div className="grid grid-cols-3 gap-2">
        {topRow.map((g) => {
          const Icon = g.icon;
          const logo = logos[g.key as GameKey];
          return (
            <button
              key={g.key}
              onClick={() => {
                if (g.key === 'aviator') startAviatorBackgroundMusic();
                onPlay(g.key);
              }}
              aria-label={g.title}
              className={`group relative rounded-xl border border-borderline-900 bg-slatepanel-900 overflow-hidden transition-all duration-200 ${g.ring} hover:shadow-neon-glow active:scale-[0.97]`}
              style={{ height: '100px' }}
            >
              {logo ? (
                <img src={logo} alt={g.title} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <>
                  <div className={`absolute inset-0 bg-gradient-to-br ${g.gradient}`} />
                  <div className="relative flex flex-col items-center justify-center h-full gap-1.5 p-2">
                    <Icon className="w-10 h-10 text-white/90" />
                    <span className="text-[10px] font-bold text-white/90 text-center leading-tight">{g.title}</span>
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
      {/* Bottom row: 2 games (centered with wider cards) */}
      <div className="grid grid-cols-2 gap-2">
        {bottomRow.map((g) => {
          const Icon = g.icon;
          const logo = logos[g.key as GameKey];
          return (
            <button
              key={g.key}
              onClick={() => {
                if (g.key === 'aviator') startAviatorBackgroundMusic();
                onPlay(g.key);
              }}
              aria-label={g.title}
              className={`group relative rounded-xl border border-borderline-900 bg-slatepanel-900 overflow-hidden transition-all duration-200 ${g.ring} hover:shadow-neon-glow active:scale-[0.97]`}
              style={{ height: '100px' }}
            >
              {logo ? (
                <img src={logo} alt={g.title} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <>
                  <div className={`absolute inset-0 bg-gradient-to-br ${g.gradient}`} />
                  <div className="relative flex flex-col items-center justify-center h-full gap-1.5 p-2">
                    <Icon className="w-10 h-10 text-white/90" />
                    <span className="text-[10px] font-bold text-white/90 text-center leading-tight">{g.title}</span>
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
