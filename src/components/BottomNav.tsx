import { Home, Gamepad2, CheckCircle } from 'lucide-react';
import { useBus } from '../lib/hooks';
import { Topics } from '../lib/bus';
import type { MinesState } from '../lib/minesEngine';
import { minesEngine } from '../lib/minesEngine';

export type Route = 'home' | 'crash' | 'mines' | 'aviator' | 'games' | 'deposit' | 'wallet' | 'profile' | 'referral' | 'admin' | 'sunvsmoon' | 'trading' | 'history' | 'withdraw' | 'affiliate' | 'landing';

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
    <nav className="fixed bottom-0 left-0 right-0 z-40 h-[60px] bg-slatepanel-900 border-t border-borderline-900 will-change-transform">
      <div className="flex h-full">
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
              <div className={`relative p-1.5 rounded-xl transition-colors ${active ? 'bg-neon-500/15' : 'group-hover:bg-white/5'}`}>
                <div className={active ? 'text-neon-400' : 'text-slate-500 group-hover:text-slate-300'}>
                  {item.icon}
                </div>
                {active && (
                  <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-midnight-950 rounded-full grid place-items-center">
                    <CheckCircle className="w-2.5 h-2.5 text-neon-400" />
                  </div>
                )}
              </div>
              <span className={`text-[10px] font-medium ${active ? 'text-neon-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                {item.label}
              </span>
              {active && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-neon-400 rounded-full" />
              )}
              {item.id === 'games' && minesActive && (
                <div className="absolute top-2 right-3 w-2 h-2 bg-emeraldwin-400 rounded-full animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
