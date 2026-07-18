import { useState, useEffect, useCallback } from 'react';
import {
  Users, TrendingUp, TrendingDown, Clock, CheckCircle2, DollarSign,
  Activity, RefreshCw, Gamepad2, BarChart3, Wifi,
} from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { supabaseGetUsers, supabaseGetTransactions } from '../../lib/supabaseIntegration';

function fmt(n: number) {
  return '\u20B9' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface DashStats {
  totalUsers: number;
  totalDeposits: number;
  totalWithdrawals: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  profit: number;
  totalTxns: number;
}

export default function DashboardOverviewTab() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [users, txns] = await Promise.all([
        supabaseGetUsers(),
        supabaseGetTransactions(),
      ]);

      const totalDeposits = txns
        .filter((t) => t.type === 'deposit' && (t.status === 'completed' || t.status === 'approved'))
        .reduce((s, t) => s + t.amount, 0);
      const totalWithdrawals = txns
        .filter((t) => t.type === 'withdrawal' && (t.status === 'completed' || t.status === 'approved'))
        .reduce((s, t) => s + t.amount, 0);
      const pendingDeposits = txns.filter((t) => t.type === 'deposit' && (t.status === 'pending' || t.status === 'processing')).length;
      const pendingWithdrawals = txns.filter((t) => t.type === 'withdrawal' && (t.status === 'pending' || t.status === 'processing')).length;

      setStats({
        totalUsers: users.length,
        totalDeposits,
        totalWithdrawals,
        pendingDeposits,
        pendingWithdrawals,
        profit: totalDeposits - totalWithdrawals,
        totalTxns: txns.length,
      });
      setLastRefresh(new Date());
    } catch (e) {
      console.error('DashboardOverviewTab load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { void load(); }, [load]);

  // Supabase Realtime — auto-refresh on any transactions or profiles change
  useEffect(() => {
    const channel = supabase
      .channel('dashboard_overview_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        void load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        void load();
      })
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => { void supabase.removeChannel(channel); };
  }, [load]);

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
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="panel p-4 h-24 animate-pulse bg-slatepanel-800" />
          ))}
        </div>
      ) : stats ? (
        <>
          {/* Primary KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Users" value={stats.totalUsers.toString()} icon={Users} color="text-neon-300" sub="Registered profiles" />
            <StatCard label="Total Deposits" value={fmt(stats.totalDeposits)} icon={TrendingUp} color="text-emeraldwin-300" sub="Completed deposits" />
            <StatCard label="Total Withdrawals" value={fmt(stats.totalWithdrawals)} icon={TrendingDown} color="text-coral-300" sub="Completed withdrawals" />
            <StatCard label="Platform Profit" value={fmt(stats.profit)} icon={DollarSign} color={stats.profit >= 0 ? 'text-emeraldwin-300' : 'text-coral-300'} sub="Deposits \u2212 Withdrawals" />
          </div>

          {/* Secondary KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Pending Deposits" value={stats.pendingDeposits.toString()} icon={Clock} color="text-amber-300" sub="Awaiting approval" highlight={stats.pendingDeposits > 0} />
            <StatCard label="Pending Withdrawals" value={stats.pendingWithdrawals.toString()} icon={Clock} color="text-amber-300" sub="Awaiting approval" highlight={stats.pendingWithdrawals > 0} />
            <StatCard label="Total Transactions" value={stats.totalTxns.toString()} icon={BarChart3} color="text-blue-300" sub="All-time txn count" />
            <StatCard label="Status" value="Live" icon={Activity} color="text-emeraldwin-300" sub="Supabase Realtime" />
          </div>

          {/* Quick links */}
          <div className="panel p-4">
            <h3 className="text-sm font-display font-bold text-white mb-3 flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-neon-300" /> Quick Actions
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <QuickAction label="Finance Overview" icon={TrendingUp} onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'finance' }))} />
              <QuickAction label="Pending Requests" icon={Clock} badge={stats.pendingDeposits + stats.pendingWithdrawals} onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'requests' }))} />
              <QuickAction label="All Users" icon={Users} onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'users' }))} />
              <QuickAction label="Support Tickets" icon={CheckCircle2} onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'tickets' }))} />
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

function StatCard({
  label, value, icon: Icon, color, sub, highlight,
}: {
  label: string; value: string; icon: typeof Users;
  color: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div className={`panel p-4 transition-all ${
      highlight ? 'ring-1 ring-amber-500/50 bg-amber-500/5' : ''
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
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
