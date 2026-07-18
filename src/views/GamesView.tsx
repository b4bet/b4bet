import type { Route } from '../components/BottomNav';
import { Rocket, Bomb, Plane, Dices, Hash, Grid3X3, Sun, TrendingUp } from 'lucide-react';
import { useGameLogos } from '../lib/hooks';
import type { GameKey } from '../lib/gameLogos';
import { startAviatorBackgroundMusic } from '../components/aviator/game/useGameAudio';

interface Props { onNavigate: (r: Route) => void; }

const ALL_GAMES = [
  { route: 'crash'     as Route, label: 'Crash',      tag: 'Real-time', icon: Rocket,     color: '#b15eff', gameKey: 'crash' as GameKey },
  { route: 'mines'     as Route, label: 'Mines',      tag: 'Strategy',  icon: Bomb,       color: '#ff4d70', gameKey: 'mines' as GameKey },
  { route: 'aviator'   as Route, label: 'Aviator',    tag: 'Crash',     icon: Plane,      color: '#38bdf8', gameKey: 'aviator' as GameKey },
  { route: 'wingo'     as Route, label: 'Win Go',     tag: '1 Min',     icon: Hash,       color: '#FB4E4E', gameKey: 'wingo' as GameKey },
  { route: 'k3'        as Route, label: 'K3',         tag: '2 Min',     icon: Dices,      color: '#9831E9', gameKey: 'k3' as GameKey },
  { route: 'fived'     as Route, label: '5D',         tag: '1 Min',     icon: Grid3X3,    color: '#5CBA47', gameKey: 'fived' as GameKey },
  { route: 'sunvsmoon' as Route, label: 'Sun & Moon', tag: 'Live',      icon: Sun,        color: '#FFB627', gameKey: 'sunvsmoon' as GameKey },
  { route: 'trading'   as Route, label: 'Trading',    tag: 'Binary',    icon: TrendingUp, color: '#22c55e', gameKey: 'trading' as GameKey },
];

export default function GamesView({ onNavigate }: Props) {
  const logos = useGameLogos();

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="font-display font-bold text-sm text-white">All Games</h2>
        <span className="chip bg-neon-500\/20 text-neon-300 text-[10px] px-1.5 py-0.5">{ALL_GAMES.length}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
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
              className="group relative aspect-square rounded-xl border border-borderline-900 bg-slatepanel-900 overflow-hidden transition-all duration-200 hover:shadow-lg active:scale-[0.97]"
              style={{ '--game-color': g.color } as React.CSSProperties}
            >
              {logo ? (
                <img src={logo} alt={g.label} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <>
                  <div
                    className="absolute inset-0 opacity-20 transition-opacity group-hover:opacity-35"
                    style={{ background: `radial-gradient(circle at center, ${g.color}66, transparent 70%)` }}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                    <Icon className="w-6 h-6 drop-shadow-lg group-hover:scale-110 transition-transform" style={{ color: g.color }} strokeWidth={1.5} />
                    <span className="text-[9px] font-bold text-white leading-tight">{g.label}</span>
                    <span className="text-[7px] text-slate-400">{g.tag}</span>
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
