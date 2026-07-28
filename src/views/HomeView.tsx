import React from 'react';
import SliderBanner from '../components/SliderBanner';
import GameGrid from '../components/GameGrid';
import type { Route } from '../components/BottomNav';
import { Dices, Hash, Grid3X3, ShieldCheck, Zap, Sun, BarChart2, TrendingUp } from 'lucide-react';
import { useGameLogos } from '../lib/hooks';
import type { GameKey } from '../lib/gameLogos';
import { supabaseGetStats } from '../lib/supabaseIntegration';

interface Props { onNavigate: (r: Route) => void; }

export default function HomeView({ onNavigate }: Props) {
  const logos = useGameLogos();
  const [stats, setStats] = React.useState({ onlineUsers: 0, topWin: 0, paidOut: 0 });

  React.useEffect(() => {
    supabaseGetStats().then(s => setStats(s || { onlineUsers: 0, topWin: 0, paidOut: 0 }));
  }, []);

  return (
    // pt-[62px] = header height so content never hides behind fixed header
    <div className="pt-[62px] pb-24 space-y-4">
      <SliderBanner onSlideClick={(i) => {
        if (i === 1) onNavigate('crash');
        else if (i === 2) onNavigate('mines');
        else onNavigate('deposit');
      }} />

      <GameGrid onNavigate={onNavigate} />

      {/* Lottery games section */}
      <div className="px-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white tracking-wide">Lottery </span>
          <button onClick={() => onNavigate('games')} className="text-[11px] font-semibold text-neon-300 hover:text-neon-200">
            View all
          </button>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {([
            { route: 'wingo' as Route, label: 'Win Go', sub: '1 Min', icon: Hash, color: 'from-[#FB4E4E]/25 to-[#9831E9]/10', border: 'group-hover:border-[#FB4E4E]', gameKey: 'wingo' as GameKey },
            { route: 'k3' as Route, label: 'K3', sub: '2 Min', icon: Dices, color: 'from-[#9831E9]/25 to-[#5CBA47]/10', border: 'group-hover:border-[#9831E9]', gameKey: 'k3' as GameKey },
            { route: 'fived' as Route, label: '5D', sub: '1 Min', icon: Grid3X3, color: 'from-[#5CBA47]/25 to-[#FB4E4E]/10', border: 'group-hover:border-[#5CBA47]', gameKey: 'fived' as GameKey },
            { route: 'sunvsmoon' as Route, label: 'Sun & Moon', sub: 'Live', icon: Sun, color: 'from-[#FFB627]/25 to-[#FB4E4E]/10', border: 'group-hover:border-[#FFB627]', gameKey: 'sunvsmoon' as GameKey },
            { route: 'trading' as Route, label: 'Trading', sub: 'Binary', icon: BarChart2, color: 'from-[#22c55e]/25 to-[#16a34a]/10', border: 'group-hover:border-[#22c55e]', gameKey: 'trading' as GameKey },
          ] as const).map((g) => {
            const Icon = g.icon;
            const logo = logos[g.gameKey];
            return (
              <button
                key={g.route}
                onClick={() => onNavigate(g.route)}
                className={`group relative aspect-square rounded-xl border border-borderline-900 bg-slatepanel-900 overflow-hidden transition-all duration-200 ${g.border} hover:shadow-neon-glow active:scale-[0.97]`}
              >
                {logo ? (
                  <img src={logo} alt={g.label} className="w-full h-full object-cover" />
                ) : (
                  <>
                    <div className={`absolute inset-0 bg-gradient-to-br ${g.color}`} />
                    <div className="relative flex flex-col items-center justify-center h-full gap-0.5 p-1">
                      <Icon className="w-5 h-5 text-white/80" />
                      <span className="text-[9px] font-bold text-white leading-tight text-center">{g.label}</span>
                      <span className="text-[8px] text-white/50 leading-tight">{g.sub}</span>
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live stats strip */}
      <div className="mx-3 rounded-xl bg-slatepanel-900 border border-borderline-900 grid grid-cols-3 divide-x divide-borderline-900">
        <div className="flex flex-col items-center py-3 gap-0.5">
          <span className="text-[10px] text-slate-500 font-medium">Online </span>
          <span className="text-sm font-bold text-emeraldwin-400">{stats.onlineUsers.toLocaleString()}</span>
        </div>
        <div className="flex flex-col items-center py-3 gap-0.5">
          <span className="text-[10px] text-slate-500 font-medium">Top Win </span>
          <span className="text-sm font-bold text-neon-400">
            {stats.topWin.toFixed(1)}x
          </span>
        </div>
        <div className="flex flex-col items-center py-3 gap-0.5">
          <span className="text-[10px] text-slate-500 font-medium">Paid Out </span>
          <span className="text-sm font-bold text-violet-400">₹{(stats.paidOut / 100000).toFixed(1)}M</span>
        </div>
      </div>

      {/* Trust strip */}
      <div className="mx-3 rounded-xl bg-slatepanel-900 border border-borderline-900 grid grid-cols-3 divide-x divide-borderline-900">
        <div className="flex flex-col items-center py-3 gap-1">
          <ShieldCheck className="w-5 h-5 text-emeraldwin-400" />
          <span className="text-[10px] text-slate-400 font-medium">Provably Fair</span>
        </div>
        <div className="flex flex-col items-center py-3 gap-1">
          <Zap className="w-5 h-5 text-neon-400" />
          <span className="text-[10px] text-slate-400 font-medium">Instant Payout</span>
        </div>
        <div className="flex flex-col items-center py-3 gap-1">
          <TrendingUp className="w-5 h-5 text-violet-400" />
          <span className="text-[10px] text-slate-400 font-medium">Secure Wallet</span>
        </div>
      </div>
    </div>
  );
}
