import { ArrowRight } from 'lucide-react';
import type { Route } from './BottomNav';
import { useGameLogos } from '../lib/hooks';
import type { GameKey } from '../lib/gameLogos';
import { startAviatorBackgroundMusic } from './aviator/game/useGameAudio';

interface GameCardDef {
  key: Route;
  title: string;
  tag: string;
  gradient: string;
  ring: string;
  badge?: string;
}

const games: GameCardDef[] = [
  { key: 'crash',     title: 'Crash',     tag: 'Real-time', gradient: 'from-neon-500/25 to-neon-700/5',             ring: 'group-hover:border-neon-400' },
  { key: 'mines',     title: 'Mines',     tag: 'Strategy',  gradient: 'from-coral-500/25 to-coral-700/5',            ring: 'group-hover:border-coral-400' },
  { key: 'aviator',   title: 'Aviator',   tag: 'Crash',     gradient: 'from-aviator-blue-soft/25 to-aviator-blue/5', ring: 'group-hover:border-aviator-blue' },
  { key: 'sunvsmoon', title: 'Sun & Moon', tag: 'Live',     gradient: 'from-yellow-500/25 to-yellow-700/5',          ring: 'group-hover:border-yellow-400' },
  { key: 'trading',   title: 'Trading',   tag: 'Binary',    gradient: 'from-green-600/25 to-green-800/5',            ring: 'group-hover:border-green-500' },
];

export default function GameGrid({ onPlay }: { onPlay: (r: Route) => void }) {
  const logos = useGameLogos();

  return (
    <div className="px-3 pb-2">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-semibold text-slate-200">Games</span>
        <button onClick={() => onPlay('games')} className="text-[11px] font-semibold text-neon-300 hover:text-neon-200 flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      {/* 5-game grid */}
      <div className="grid grid-cols-4 gap-2">
        {games.map((g) => {
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
                <img src={logo} alt={g.title} className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br ${g.gradient} p-1`}>
                  <span className="text-white text-[11px] font-bold text-center leading-tight">{g.title}</span>
                  <span className="text-slate-400 text-[9px] mt-0.5">{g.tag}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
