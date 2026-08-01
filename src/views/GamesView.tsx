import type { Route } from '../components/BottomNav';
import { useGameLogos } from '../lib/hooks';
import type { GameKey } from '../lib/gameLogos';
import { startAviatorBackgroundMusic } from '../components/aviator/game/useGameAudio';
import React from 'react';

interface Props { onNavigate: (r: Route) => void; }

const ALL_GAMES = [
  { route: 'crash' as Route,     label: 'Crash',      tag: 'Real-time', color: '#b15eff', gameKey: 'crash' as GameKey },
  { route: 'mines' as Route,     label: 'Mines',      tag: 'Strategy',  color: '#ff4d70', gameKey: 'mines' as GameKey },
  { route: 'aviator' as Route,   label: 'Aviator',    tag: 'Crash',     color: '#38bdf8', gameKey: 'aviator' as GameKey },
  { route: 'sunvsmoon' as Route, label: 'Sun & Moon', tag: 'Live',      color: '#FFB627', gameKey: 'sunvsmoon' as GameKey },
  { route: 'trading' as Route,   label: 'Trading',    tag: 'Binary',    color: '#22c55e', gameKey: 'trading' as GameKey },
];

export default function GamesView({ onNavigate }: Props) {
  const logos = useGameLogos();

  return (
    <div className="px-3 pt-3 pb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base font-bold text-slate-100">All Games</span>
        <span className="text-xs font-semibold text-slate-500 bg-slatepanel-800 rounded-full px-2 py-0.5">{ALL_GAMES.length}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {ALL_GAMES.map((g) => {
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
                <div className="w-full h-full flex flex-col items-center justify-center p-2">
                  <span className="text-white text-sm font-bold text-center leading-tight">{g.label}</span>
                  <span className="text-slate-400 text-[10px] mt-1">{g.tag}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
