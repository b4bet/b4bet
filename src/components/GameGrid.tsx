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
  badge?: string;
}

// Only 5 featured games on home grid
const games: GameCardDef[] = [
  { key: 'crash',     title: 'Crash',      tag: 'Real-time', icon: Rocket,    gradient: 'from-neon-500/25 to-neon-700/5',           ring: 'group-hover:border-neon-400' },
  { key: 'mines',     title: 'Mines',      tag: 'Strategy',  icon: Bomb,      gradient: 'from-coral-500/25 to-coral-700/5',          ring: 'group-hover:border-coral-400' },
  { key: 'aviator',   title: 'Aviator',    tag: 'Crash',     icon: Plane,     gradient: 'from-aviator-blue-soft/25 to-aviator-blue/5', ring: 'group-hover:border-aviator-blue' },
  { key: 'sunvsmoon', title: 'Sun & Moon', tag: 'Live',      icon: Sun,       gradient: 'from-yellow-500/25 to-yellow-700/5',        ring: 'group-hover:border-yellow-400' },
  { key: 'trading',   title: 'Trading',    tag: 'Binary',    icon: BarChart2, gradient: 'from-green-600/25 to-green-800/5',          ring: 'group-hover:border-green-500' },
];

export default function GameGrid({ onPlay }: { onPlay: (r: Route) => void }) {
  const logos = useGameLogos();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-white">Games</span>
        <button onClick={() => onPlay('games')} className="text-[11px] font-semibold text-neon-300 hover:text-neon-200 flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      {/* 5-column compact grid */}
      <div className="grid grid-cols-5 gap-2">
        {games.map((g) => {
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
              className={`group relative aspect-square rounded-xl border border-borderline-900 bg-slatepanel-900 overflow-hidden transition-all duration-200 ${g.ring} hover:shadow-neon-glow active:scale-[0.97]`}
            >
              {logo ? (
                <img src={logo} alt={g.title} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <>
                  <div className={`absolute inset-0 bg-gradient-to-br ${g.gradient}`} />
                  <div className="relative flex flex-col items-center justify-center h-full gap-0.5 p-1">
                    <Icon className="w-5 h-5 text-white/80" />
                    <span className="text-[9px] font-bold text-white/90 text-center leading-tight">{g.title}</span>
                    <span className="text-[8px] text-white/50">{g.tag}</span>
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
