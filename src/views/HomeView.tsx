import React from 'react';
import SliderBanner from '../components/SliderBanner';
import GameGrid from '../components/GameGrid';
import type { Route } from '../components/BottomNav';
import { ShieldCheck, Zap, TrendingUp } from 'lucide-react';
import { supabaseGetStats } from '../lib/supabaseIntegration';

interface Props { onNavigate: (r: Route) => void; }

export default function HomeView({ onNavigate }: Props) {
  const [stats, setStats] = React.useState({ onlineUsers: 0, topWin: 0, paidOut: 0 });

  React.useEffect(() => {
    supabaseGetStats().then(s => setStats(s || { onlineUsers: 0, topWin: 0, paidOut: 0 }));
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Banner with top gap so it doesn't touch the header */}
      <div className="mt-2 px-3">
        <SliderBanner onSlideClick={(i) => {
          if (i === 1) onNavigate('crash');
          else if (i === 2) onNavigate('mines');
          else onNavigate('deposit');
        }} />
      </div>

      {/* Game grid */}
      <div className="px-3 mt-3">
        <GameGrid onNavigate={onNavigate} />
      </div>

      {/* Live stats strip */}
      <div className="mx-3 mt-4 flex items-center justify-around rounded-xl bg-slatepanel-900 border border-borderline-900 py-3">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide">Online</span>
          <span className="text-sm font-bold text-emerald-400">{stats.onlineUsers.toLocaleString()}</span>
        </div>
        <div className="w-px h-8 bg-borderline-900" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide">Top Win</span>
          <span className="text-sm font-bold text-neon-400">{stats.topWin.toFixed(1)}x</span>
        </div>
        <div className="w-px h-8 bg-borderline-900" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide">Paid Out</span>
          <span className="text-sm font-bold text-amber-400">₹{(stats.paidOut / 100000).toFixed(1)}M</span>
        </div>
      </div>

      {/* Trust strip */}
      <div className="mx-3 mt-3 mb-4 flex items-center justify-around rounded-xl bg-slatepanel-900 border border-borderline-900 py-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Provably Fair
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          Instant Payout
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <TrendingUp className="w-3.5 h-3.5 text-neon-400" />
          Secure Wallet
        </div>
      </div>
    </div>
  );
}
