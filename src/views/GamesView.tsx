import type { Route } from '../components/BottomNav';
import { Rocket, Bomb, Plane, Dices, Hash, Grid3X3, Sun, TrendingUp } from 'lucide-react';
import { useGameLogos } from '../lib/hooks';
import type { GameKey } from '../lib/gameLogos';
import { startAviatorBackgroundMusic } from '../components/aviator/game/useGameAudio';
import React from 'react';

interface Props { onNavigate: (r: Route) => void; }

const ALL_GAMES = [
  { route: 'crash' as Route, label: 'Crash', tag: 'Real-time', icon: Rocket, color: '#b15eff', gameKey: 'crash' as GameKey },
  { route: 'mines' as Route, label: 'Mines', tag: 'Strategy', icon: Bomb, color: '#ff4d70', gameKey: 'mines' as GameKey },
  { route: 'aviator' as Route, label: 'Aviator', tag: 'Crash', icon: Plane, color: '#38bdf8', gameKey: 'aviator' as GameKey },
  { route: 'wingo' as Route, label: 'Win Go', tag: '1 Min', icon: Hash, color: '#FB4E4E', gameKey: 'wingo' as GameKey },
  { route: 'k3' as Route, label: 'K3', tag: '2 Min', icon: Dices, color: '#9831E9', gameKey: 'k3' as GameKey },
  { route: 'fived' as Route, label: '5D', tag: '1 Min', icon: Grid3X3, color: '#5CBA47', gameKey: 'fived' as GameKey },
  { route: 'sunvsmoon' as Route, label: 'Sun & Moon', tag: 'Live', icon: Sun, color: '#FFB627', gameKey: 'sunvsmoon' as GameKey },
  { route: 'trading' as Route, label: 'Trading', tag: 'Binary', icon: TrendingUp, color: '#22c55e', gameKey: 'trading' as GameKey },
];

export default function GamesView({ onNavigate }: Props) {
  const logos = useGameLogos();

  return (
    <div className="px-3 pt-3 pb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-white">All Games</span>
        <span className="text-xs text-slate-500">{ALL_GAMES.length}</span>
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
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--game-color)]/20 to-transparent" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <Icon className="w-7 h-7" style={{ color: g.color }} />
                    <span className="text-[11px] font-bold text-white">{g.label}</span>
                    <span className="text-[9px] text-slate-400">{g.tag}</span>
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
