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

export type Route = 'home' | 'crash' | 'mines' | 'aviator' | 'games' | 'deposit' | 'wallet' | 'profile' | 'referral' | 'admin' | 'sunvsmoon' | 'trading' | 'history' | 'withdraw' | 'ludo' | 'affiliate' | 'landing';

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
    { id: 'home', icon: <Home className="w-5 h-5" />, label: 'Home' },
    { id: 'games', icon: <Gamepad2 className="w-5 h-5" />, label: 'Games' },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 will-change-transform">
      <div className="mx-auto max-w-lg bg-midnight-900/95 backdrop-blur-md border-t border-borderline-900 h-16 flex items-stretch">
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
              <div className={`relative p-1.5 rounded-xl transition-colors ${
                active ? 'bg-neon-400/15' : 'group-hover:bg-slatepanel-800'
              }`}>
                <span className={active ? 'text-neon-300' : 'text-slate-500 group-hover:text-slate-300'}>
                  {item.icon}
                </span>
                {active && (
                  <span className="absolute -top-0.5 -right-0.5">
                    <CheckCircle className="w-3 h-3 text-neon-400 fill-midnight-900" />
                  </span>
                )}
              </div>

              <span className={`text-[10px] font-semibold leading-none ${
                active ? 'text-neon-300' : 'text-slate-500 group-hover:text-slate-300'
              }`}>
                {item.label}
              </span>

              {active && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-neon-400" />
              )}

              {item.id === 'games' && minesActive && (
                <span className="absolute top-2 right-3 w-2 h-2 rounded-full bg-coral-400 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
