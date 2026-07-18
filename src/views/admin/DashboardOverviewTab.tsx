import { useState, useEffect, useCallback } from 'react';
import {
  Users, TrendingUp, TrendingDown, Clock, CheckCircle2, DollarSign,
  Activity, RefreshCw, Gamepad2, BarChart3, Wifi, Gift, ShieldAlert,
  Plus, Minus,
} from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface DashStats {
  total_users: number;
  active_users: number;
  banned_users: number;
  total_deposits: number;
  total_withdrawals: number;
  pending_deposits: number;
  pending_withdrawals: number;
  total_bonus_credited: number;
  total_bet_volume: number;
  total_win_paid: number;
  game_profit: number;
  total_transactions: number;
}

export default function DashboardOverviewTab() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_dashboard_stats');
      if (error) throw error;
      setStats(data as DashStats);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('DashboardOverviewTab load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('dashboard_overview_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => { void load(); })
      .subscribe((status) => { setRealtimeConnected(status === 'SUBSCRIBED'); });
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const netProfit = stats ? stats.total_deposits - stats.total_withdrawals + stats.game_profit - stats.total_bonus_credited : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-xl text-white">Dashboard Overview</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-slate-500">
              {lastRefresh ? `Updated: ${lastRefresh.toLocaleTimeString('en-IN')}` : 'Loading…'}
            </p>
            <span className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
              realtimeConnected
                ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                : 'text-amber-400 border-amber-500/40 bg-amber-500/10'
            }`}>
              <Wifi className="w-2.5 h-2.5" />
              {realtimeConnected ? 'Live' : 'Connecting…'}
            </span>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && !stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="panel p-4 h-24 animate-pulse bg-slatepanel-800" />
          ))}
        </div>
      ) : stats ? (
        <>
          {/* Users row */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Users</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total Users"   value={stats.total_users.toString()}  icon={Users}       color="text-neon-300"        sub="Registered profiles" />
              <StatCard label="Active Users"  value={stats.active_users.toString()} icon={Activity}    color="text-emeraldwin-300" sub="Not banned" />
              <StatCard label="Banned Users"  value={stats.banned_users.toString()} icon={ShieldAlert} color="text-coral-300"       sub="Restricted accounts" highlight={stats.banned_users > 0} />
              <StatCard label="Total Txns"    value={stats.total_transactions.toString()} icon={BarChart3} color="text-blue-300"   sub="All transactions" />
            </div>
          </div>

          {/* Finance row */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Finance</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total Deposits"     value={fmt(stats.total_deposits)}     icon={TrendingUp}   color="text-emeraldwin-300" sub="Completed only" />
              <StatCard label="Total Withdrawals"  value={fmt(stats.total_withdrawals)}  icon={TrendingDown} color="text-coral-300"       sub="Completed only" />
              <StatCard label="Pending Deposits"   value={stats.pending_deposits.toString()} icon={Clock}   color="text-amber-300"      sub="Awaiting approval" highlight={stats.pending_deposits > 0} />
              <StatCard label="Pending Withdrawals" value={stats.pending_withdrawals.toString()} icon={Clock} color="text-amber-300"  sub="Awaiting approval" highlight={stats.pending_withdrawals > 0} />
            </div>
          </div>

          {/* Profit breakdown */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Profit Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Game Profit"     value={fmt(stats.game_profit)}           icon={Gamepad2}     color={stats.game_profit >= 0 ? 'text-neon-300' : 'text-coral-300'}     sub="Bets − Wins" />
              <StatCard label="Bonus Credited"  value={fmt(stats.total_bonus_credited)}  icon={Gift}         color="text-amber-300"    sub="Signup + Manual" />
              <StatCard label="Bet Volume"      value={fmt(stats.total_bet_volume)}      icon={Plus}         color="text-blue-300"     sub="Total wagered" />
              <StatCard label="Net Platform Profit" value={fmt(netProfit)}               icon={DollarSign}   color={netProfit >= 0 ? 'text-emeraldwin-300' : 'text-coral-300'} sub="Deposits − Withdrawals + Game − Bonus" />
            </div>
          </div>

          {/* Profit formula */}
          <div className="panel p-4 border border-borderline-900">
            <h3 className="text-xs font-display font-bold text-white mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-neon-300" /> Net Profit Formula
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="px-2 py-1 rounded-lg bg-emeraldwin-500/10 border border-emeraldwin-500/20 text-emeraldwin-300 font-mono font-bold">{fmt(stats.total_deposits)}</span>
              <Minus className="w-3 h-3 text-slate-500" />
              <span className="px-2 py-1 rounded-lg bg-coral-500/10 border border-coral-500/20 text-coral-300 font-mono font-bold">{fmt(stats.total_withdrawals)}</span>
              <Plus className="w-3 h-3 text-slate-500" />
              <span className="px-2 py-1 rounded-lg bg-neon-500/10 border border-neon-500/20 text-neon-300 font-mono font-bold">{fmt(stats.game_profit)}</span>
              <Minus className="w-3 h-3 text-slate-500" />
              <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono font-bold">{fmt(stats.total_bonus_credited)}</span>
              <span className="text-slate-500 text-xs">=</span>
              <span className={`px-3 py-1 rounded-lg border font-display font-extrabold text-base ${netProfit >= 0 ? 'bg-emeraldwin-500/10 border-emeraldwin-500/30 text-emeraldwin-300' : 'bg-coral-500/10 border-coral-500/30 text-coral-300'}`}>{fmt(netProfit)}</span>
            </div>
            <p className="text-[10px] text-slate-600 mt-2">Deposits − Withdrawals + Game Profit − Bonuses = Net Profit</p>
          </div>

          {/* Quick links */}
          <div className="panel p-4">
            <h3 className="text-sm font-display font-bold text-white mb-3 flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-neon-300" /> Quick Actions
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <QuickAction label="Finance Overview"  icon={TrendingUp}   onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'finance' }))} />
              <QuickAction label="Pending Requests"  icon={Clock}        badge={stats.pending_deposits + stats.pending_withdrawals} onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'requests' }))} />
              <QuickAction label="All Users"         icon={Users}        onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'users' }))} />
              <QuickAction label="Support Tickets"   icon={CheckCircle2} onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'tickets' }))} />
            </div>
          </div>
        </>
      ) : (
        <div className="panel p-8 text-center text-slate-500">
          Failed to load dashboard data. Please refresh.
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, sub, highlight }: {
  label: string; value: string; icon: typeof Users;
  color: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div className={`panel p-4 transition-all ${highlight ? 'ring-1 ring-amber-500/50 bg-amber-500/5' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide truncate pr-1">{label}</span>
        <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
      </div>
      <p className={`text-xl font-display font-extrabold tabular ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function QuickAction({ label, icon: Icon, badge, onClick }: { label: string; icon: typeof Users; badge?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 p-3 rounded-xl bg-slatepanel-800 border border-borderline-900 hover:border-neon-500/30 hover:bg-neon-500/5 transition-all group text-left"
    >
      <Icon className="w-4 h-4 text-slate-500 group-hover:text-neon-300 transition-colors" />
      <span className="text-xs font-semibold text-slate-400 group-hover:text-white transition-colors">{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-coral-500 text-white text-[10px] font-bold grid place-items-center">
          {badge}
        </span>
      )}
    </button>
  );
}
