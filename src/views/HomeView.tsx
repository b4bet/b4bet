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
    <div className="space-y-3 animate-fade-in">
      <SliderBanner onCta={(i) => {
        if (i === 1) onNavigate('crash');
        else if (i === 2) onNavigate('mines');
        else onNavigate('deposit');
      }} />
      <GameGrid onPlay={onNavigate} />

      {/* Lottery games section */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display font-bold text-sm text-white">Lottery</h2>
          <button onClick={() => onNavigate('games')} className="text-[11px] font-semibold text-neon-300 hover:text-neon-200">
            View all
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {([
            { route: 'wingo' as Route,     label: 'Win Go',    sub: '1 Min',  icon: Hash,     color: 'from-[#FB4E4E]/25 to-[#9831E9]/10',  border: 'group-hover:border-[#FB4E4E]',  gameKey: 'wingo' as GameKey },
            { route: 'k3' as Route,        label: 'K3',        sub: '2 Min',  icon: Dices,    color: 'from-[#9831E9]/25 to-[#5CBA47]/10',  border: 'group-hover:border-[#9831E9]',  gameKey: 'k3' as GameKey },
            { route: 'fived' as Route,     label: '5D',        sub: '1 Min',  icon: Grid3X3,  color: 'from-[#5CBA47]/25 to-[#FB4E4E]/10',  border: 'group-hover:border-[#5CBA47]',  gameKey: 'fived' as GameKey },
            { route: 'sunvsmoon' as Route, label: 'Sun & Moon',sub: 'Live',   icon: Sun,      color: 'from-[#FFB627]/25 to-[#FB4E4E]/10',  border: 'group-hover:border-[#FFB627]',  gameKey: 'sunvsmoon' as GameKey },
            { route: 'trading' as Route,   label: 'Trading',   sub: 'Binary', icon: BarChart2,color: 'from-[#22c55e]/25 to-[#16a34a]/10',  border: 'group-hover:border-[#22c55e]',  gameKey: 'trading' as GameKey },
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
                  <img src={logo} alt={g.label} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <>
                    <div className={`absolute inset-0 bg-gradient-to-br ${g.color} opacity-80`} />
                    <div className="absolute inset-0 grid-shimmer animate-shimmer opacity-30" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                      <Icon className="w-6 h-6 text-white drop-shadow-lg group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                      <span className="text-[9px] font-bold text-white leading-tight">{g.label}</span>
                      <span className="text-[7px] text-slate-400">{g.sub}</span>
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Live stats strip */}
      <section className="grid grid-cols-3 gap-2">
        <div className="panel-tight p-2 text-center">
          <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Online</p>
          <p className="tabular font-bold text-emeraldwin-400 text-sm">{stats.onlineUsers.toLocaleString()}</p>
        </div>
        <div className="panel-tight p-2 text-center">
          <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Top Win</p>
          <p className="tabular font-bold text-neon-300 text-sm flex items-center justify-center gap-1">
            <TrendingUp className="w-3 h-3" /> {stats.topWin.toFixed(1)}x
          </p>
        </div>
        <div className="panel-tight p-2 text-center">
          <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Paid Out</p>
          <p className="tabular font-bold text-amberx-400 text-sm">₹{(stats.paidOut / 100000).toFixed(1)}M</p>
        </div>
      </section>

      {/* Trust strip */}
      <section className="grid grid-cols-3 gap-2">
        <div className="panel-tight p-2 text-center">
          <ShieldCheck className="w-4 h-4 text-emeraldwin-400 mx-auto mb-0.5" />
          <p className="text-[9px] text-slate-400 font-semibold">Provably Fair</p>
        </div>
        <div className="panel-tight p-2 text-center">
          <Zap className="w-4 h-4 text-neon-300 mx-auto mb-0.5" />
          <p className="text-[9px] text-slate-400 font-semibold">Instant Payout</p>
        </div>
        <div className="panel-tight p-2 text-center">
          <ShieldCheck className="w-4 h-4 text-amberx-400 mx-auto mb-0.5" />
          <p className="text-[9px] text-slate-400 font-semibold">Secure Wallet</p>
        </div>
      </section>
    </div>
  );
}
