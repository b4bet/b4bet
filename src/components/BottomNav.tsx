import { Home, Gamepad2 } from 'lucide-react';
import { useBus } from '../lib/hooks';
import { Topics } from '../lib/bus';
import type { MinesState } from '../lib/minesEngine';
import { minesEngine } from '../lib/minesEngine';

export type Route = 'home' | 'crash' | 'mines' | 'aviator' | 'games' | 'deposit' | 'wallet' | 'profile' | 'referral' | 'admin' | 'sunvsmoon' | 'trading' | 'history' | 'withdraw' | 'affiliate' | 'landing' | 'ludo';

interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
}

interface Props {
  current: Route;
  onNavigate: (r: Route) => void;
}

// Game routes — treated as "Games" tab being active
const GAME_ROUTES: Route[] = ['crash', 'mines', 'aviator', 'sunvsmoon', 'trading', 'ludo'];

export default function BottomNav({ current, onNavigate }: Props) {
  const minesState = useBus<MinesState>(Topics.MinesState, minesEngine.getState());
  const minesActive = minesState.active;

  const items: NavItem[] = [
    { id: 'home',  icon: <Home className="w-[18px] h-[18px]" />,     label: 'Home' },
    { id: 'games', icon: <Gamepad2 className="w-[18px] h-[18px]" />, label: 'Games' },
  ];

  // Determine which tab is "active" — game routes highlight Games tab
  const activeTab = GAME_ROUTES.includes(current) ? 'games' : current;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 h-[52px] bg-slatepanel-900/95 backdrop-blur border-t border-borderline-900 will-change-transform">
      <div className="flex h-full">
        {items.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as Route)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full px-1 transition-colors"
            >
              {/* Active indicator line at top */}
              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-neon-400 rounded-full" />
              )}

              <div className={`p-1.5 rounded-lg transition-colors ${active ? 'bg-neon-500/15' : ''}`}>
                <div className={active ? 'text-neon-400' : 'text-slate-500'}>
                  {item.icon}
                </div>
              </div>

              <span className={`text-[9px] font-semibold leading-none ${active ? 'text-neon-400' : 'text-slate-500'}`}>
                {item.label}
              </span>

              {item.id === 'games' && minesActive && (
                <div className="absolute top-1.5 right-6 w-1.5 h-1.5 bg-emeraldwin-400 rounded-full animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
