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
        <span className="text-lg font-bold text-white">All Games</span>
        <span className="text-xs text-slate-400">{ALL_GAMES.length}</span>
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
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon size={32} style={{ color: g.color }} />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80">
                    <div className="text-white text-xs font-bold">{g.label}</div>
                    <div className="text-slate-400 text-[10px]">{g.tag}</div>
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
