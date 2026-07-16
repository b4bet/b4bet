/**
 * BottomNav — spec §6
 * - Shows Home and Games tabs.
 * - Active tab shows neon accent colour; inactive tabs are slate-500.
 * - Deposit is now accessed via the header; all other menu items via the header hamburger.
 */
import { Home, Gamepad2 } from 'lucide-react';
import { useBus } from '../lib/hooks';
import { Topics } from '../lib/bus';
import type { MinesState } from '../lib/minesEngine';
import { minesEngine } from '../lib/minesEngine';

export type Route = 'home' | 'crash' | 'mines' | 'aviator' | 'ludo' | 'games' | 'deposit' | 'wallet' | 'profile' | 'referral' | 'admin' | 'wingo' | 'k3' | 'fived' | 'sunvsmoon' | 'trading' | 'history' | 'withdraw';

interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
}

interface Props {
  route: Route;
  onNavigate: (r: Route) => void;
}

export default function BottomNav({ route, onNavigate }: Props) {
  const minesState = useBus<MinesState>(Topics.MinesState, minesEngine.getState());
  const minesActive = minesState.active;

  const items: NavItem[] = [
    { id: 'home',  icon: <Home className="w-5 h-5" />,     label: 'Home'  },
    { id: 'games', icon: <Gamepad2 className="w-5 h-5" />, label: 'Games' },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-slatepanel-900/95 border-t border-borderline-900 backdrop-blur-xl safe-bottom"
      aria-label="Main navigation"
    >
      <div className="max-w-xl mx-auto flex items-end justify-around px-1 h-14">
        {items.map((item) => {
          const active = route === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as Route)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full px-1 group transition-colors"
            >
              <span
                className={[
                  'transition-colors duration-150',
                  active ? 'text-neon-400' : 'text-slate-500 group-hover:text-slate-300',
                ].join(' ')}
              >
                {item.icon}
              </span>
              <span
                className={[
                  'text-[9px] font-bold uppercase tracking-wider transition-colors duration-150',
                  active ? 'text-neon-400' : 'text-slate-500 group-hover:text-slate-400',
                ].join(' ')}
              >
                {item.label}
              </span>
              {/* active underline dot */}
              {active && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-neon-400" />
              )}
              {/* Mines active indicator */}
              {item.id === 'games' && minesActive && (
                <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-coral-400 border border-slatepanel-900" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
