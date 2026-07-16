import { Rocket, Bomb, Plane, ArrowRight, Dices, Hash, Grid3X3, Sun, BarChart2 } from 'lucide-react';
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

const games: GameCardDef[] = [
  {
    key: 'crash',
    title: 'Crash',
    tag: 'Real-time',
    icon: Rocket,
    gradient: 'from-neon-500/25 to-neon-700/5',
    ring: 'group-hover:border-neon-400',
  },
  {
    key: 'mines',
    title: 'Mines',
    tag: 'Strategy',
    icon: Bomb,
    gradient: 'from-coral-500/25 to-coral-700/5',
    ring: 'group-hover:border-coral-400',
  },
  {
    key: 'aviator',
    title: 'Aviator',
    tag: 'Crash',
    icon: Plane,
    gradient: 'from-aviator-blue-soft/25 to-aviator-blue/5',
    ring: 'group-hover:border-aviator-blue',
  },
  {
    key: 'wingo',
    title: 'Win Go',
    tag: '1 Min',
    icon: Hash,
    gradient: 'from-red-500/25 to-red-700/5',
    ring: 'group-hover:border-red-400',
  },
  {
    key: 'k3',
    title: 'K3',
    tag: '2 Min',
    icon: Dices,
    gradient: 'from-purple-500/25 to-purple-700/5',
    ring: 'group-hover:border-purple-400',
  },
  {
    key: 'fived',
    title: '5D',
    tag: '1 Min',
    icon: Grid3X3,
    gradient: 'from-green-500/25 to-green-700/5',
    ring: 'group-hover:border-green-400',
  },
  {
    key: 'sunvsmoon',
    title: 'Sun & Moon',
    tag: 'Live',
    icon: Sun,
    gradient: 'from-yellow-500/25 to-yellow-700/5',
    ring: 'group-hover:border-yellow-400',
  },
  {
    key: 'trading',
    title: 'Trading',
    tag: 'Binary',
    icon: BarChart2,
    gradient: 'from-green-600/25 to-green-800/5',
    ring: 'group-hover:border-green-500',
  },
];

export default function GameGrid({ onPlay }: { onPlay: (r: Route) => void }) {
  const logos = useGameLogos();

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-bold text-lg text-white">Games</h2>
        <button onClick={() => onPlay('games')} className="text-xs font-semibold text-neon-300 hover:text-neon-200 flex items-center gap-1">
          View all <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* 4-column square grid — all 8 games */}
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-3">
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
              className={`group relative aspect-square rounded-2xl border-2 border-borderline-900 bg-slatepanel-900 overflow-hidden transition-all duration-200 ${g.ring} hover:shadow-neon-glow active:scale-[0.97]`}
            >
              {logo ? (
                <img
                  src={logo}
                  alt={g.title}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <>
                  <div className={`absolute inset-0 bg-gradient-to-br ${g.gradient} opacity-80`} />
                  <div className="absolute inset-0 grid-shimmer animate-shimmer opacity-30" />
                  <div className="absolute inset-0 grid place-items-center">
                    <Icon className="w-10 h-10 sm:w-12 sm:h-12 text-white drop-shadow-lg group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </section>

  );
}
