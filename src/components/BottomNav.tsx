/**
 * BottomNav — spec §6
 * - Shows Home and Games tabs.
 * - Active tab shows neon accent colour + check badge; inactive tabs are slate-500.
 * - GPU-accelerated to prevent scroll flicker on mobile.
 */
import { Home, Gamepad2, CheckCircle } from 'lucide-react';
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
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex h-14 items-stretch border-t border-borderline-900 bg-slatepanel-900/95 backdrop-blur-sm"
      style={{
        // GPU layer prevents iOS scroll flicker
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        // Safe-area support for notched phones
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
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
              {/* Icon wrapper — highlighted background when active */}
              <span className={`relative transition-colors ${
                active
                  ? 'text-neon-400'
                  : 'text-slate-500 group-hover:text-slate-300'
              }`}>
                {item.icon}
                {/* Tick badge on active tab */}
                {active && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-slatepanel-900 flex items-center justify-center">
                    <CheckCircle className="w-3 h-3 text-neon-400" />
                  </span>
                )}
              </span>

              <span className={`text-[10px] font-semibold transition-colors ${
                active ? 'text-neon-400' : 'text-slate-500 group-hover:text-slate-300'
              }`}>
                {item.label}
              </span>

              {/* Active underline pill */}
              {active && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-neon-400" />
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
