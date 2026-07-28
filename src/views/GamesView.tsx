import type { Route } from '../components/BottomNav';
import { Rocket, Bomb, Plane, Sun, TrendingUp } from 'lucide-react';
import { useGameLogos } from '../lib/hooks';
import type { GameKey } from '../lib/gameLogos';
import { startAviatorBackgroundMusic } from '../components/aviator/game/useGameAudio';
import React from 'react';

interface Props { onNavigate: (r: Route) => void; }

const ALL_GAMES = [
  { route: 'crash' as Route, label: 'Crash', tag: 'Real-time', icon: Rocket, color: '#b15eff', gameKey: 'crash' as GameKey },
  { route: 'mines' as Route, label: 'Mines', tag: 'Strategy', icon: Bomb, color: '#ff4d70', gameKey: 'mines' as GameKey },
  { route: 'aviator' as Route, label: 'Aviator', tag: 'Crash', icon: Plane, color: '#38bdf8', gameKey: 'aviator' as GameKey },
  { route: 'sunvsmoon' as Route, label: 'Sun & Moon', tag: 'Live', icon: Sun, color: '#FFB627', gameKey: 'sunvsmoon' as GameKey },
  { route: 'trading' as Route, label: 'Trading', tag: 'Binary', icon: TrendingUp, color: '#22c55e', gameKey: 'trading' as GameKey },
];

export default function GamesView({ onNavigate }: Props) {
  const logos = useGameLogos();

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-extrabold text-lg text-white">All Games</h2>
        <span className="chip text-xs">{ALL_GAMES.length}</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {ALL_GAMES.map((g) => {
          const Icon = g.icon;
          const logo = logos[g.gameKey];
          return (
            <button
              key={g.route}
              onClick={() => {
                if (g.route === 'aviator') startAviatorBackgroundMusic();
                onNavigate(g.route);
              }}
              className="group relative aspect-square rounded-2xl border-2 border-borderline-900 bg-slatepanel-900 overflow-hidden transition-all duration-200 hover:shadow-lg active:scale-[0.97]"
              style={{ '--game-color': g.color } as React.CSSProperties}
            >
              {logo ? (
                <img src={logo} alt={g.label} className="w-full h-full object-cover" />
              ) : (
                <>
                  <div className="absolute inset-0 opacity-20" style={{ background: `radial-gradient(circle at 60% 40%, var(--game-color), transparent 70%)` }} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2">
                    <Icon className="w-8 h-8" style={{ color: g.color }} />
                    <span className="text-xs font-bold text-white leading-tight text-center">{g.label}</span>
                    <span className="text-[9px] text-slate-400 font-medium">{g.tag}</span>
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
