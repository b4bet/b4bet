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

export type Route = 'home' | 'crash' | 'mines' | 'aviator' | 'games' | 'deposit' | 'wallet' | 'profile' | 'referral' | 'admin' | 'wingo' | 'k3' | 'fived' | 'sunvsmoon' | 'trading' | 'history' | 'withdraw';

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
    { id: 'home',  icon: <Home className="w-5 h-5" />,     label: 'Home' },
    { id: 'games', icon: <Gamepad2 className="w-5 h-5" />, label: 'Games' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-14 items-stretch border-t border-borderline-900 bg-slatepanel-900/95 backdrop-blur-sm safe-area-inset-bottom">
      <div className="flex w-full max-w-md mx-auto">
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
              <span className={`transition-colors ${active ? 'text-neon-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                {item.icon}
              </span>
              <span className={`text-[10px] font-semibold transition-colors ${active ? 'text-neon-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                {item.label}
              </span>
              {/* active underline dot */}
              {active && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-neon-400" />
              )}
              {/* Mines active indicator */}
              {item.id === 'games' && minesActive && (
                <span className="absolute top-2 right-4 w-2 h-2 rounded-full bg-coral-500 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
