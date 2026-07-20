import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, TrendingUp, TrendingDown, Clock, CheckCircle2,
  Activity, RefreshCw, Gamepad2, BarChart3, Wifi, ShieldAlert,
  Bell, ArrowRight, Banknote,
} from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { cms } from '../../lib/cms';
import { supabaseGetTransactions, supabaseGetUsers, type SupabaseTransaction, type SupabaseProfile } from '../../lib/supabaseIntegration';

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
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [profiles, setProfiles] = useState<SupabaseProfile[]>([]);

  const canSeeRequests = cms.hasPermission('requests');
  const canSeeFinance  = cms.hasPermission('finance');
  const canSeeUsers    = cms.hasPermission('users');
  const canSeeTickets  = cms.hasPermission('tickets');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tasks: Promise<unknown>[] = [supabase.rpc('admin_get_dashboard_stats')];
      if (canSeeRequests) tasks.push(supabaseGetTransactions(), supabaseGetUsers());
      const results = await Promise.all(tasks);
      const { data, error } = results[0] as { data: DashStats; error: Error | null };
      if (error) throw error;
      setStats(data);
      if (canSeeRequests) {
        setTransactions((results[1] as SupabaseTransaction[]) ?? []);
        setProfiles((results[2] as SupabaseProfile[]) ?? []);
      }
      setLastRefresh(new Date());
    } catch (e) {
      console.error('DashboardOverviewTab load error:', e);
    } finally {
      setLoading(false);
    }
  }, [canSeeRequests]);

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

  const accountIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of profiles) if (p.id && p.account_id) map[p.id] = p.account_id;
    return map;
  }, [profiles]);

  const recentPending = useMemo(() => {
    return transactions
      .filter((t) => (t.type === 'deposit' || t.type === 'withdrawal') && (t.status === 'pending' || t.status === 'processing'))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);
  }, [transactions]);

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

          {/* New Requests — notification only; visible only to staff with Requests access */}
          {canSeeRequests && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-amber-400" /> New Requests
                  {(stats.pending_deposits + stats.pending_withdrawals) > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
                      {stats.pending_deposits + stats.pending_withdrawals}
                    </span>
                  )}
                </h3>
                <button onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'requests' }))}
                  className="flex items-center gap-1 text-[11px] font-semibold text-violet-300 hover:text-violet-200">
                  Go to Requests tab <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              {recentPending.length === 0 ? (
                <div className="panel p-4 text-xs text-slate-500 text-center">No pending deposit/withdrawal requests right now.</div>
              ) : (
                <div className="space-y-2">
                  {recentPending.map((t) => (
                    <div key={t.id} className="panel p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {t.type === 'deposit'
                          ? <Banknote className="w-4 h-4 text-emeraldwin-400 flex-shrink-0" />
                          : <TrendingDown className="w-4 h-4 text-coral-400 flex-shrink-0" />}
                        <div className="min-w-0">
                          <div className="text-xs text-white font-semibold truncate">
                            {t.type === 'deposit' ? 'Deposit' : 'Withdrawal'} · ID: {t.user_id ? (accountIdMap[t.user_id] ?? '—') : '—'}
                          </div>
                          <div className="text-[10px] text-slate-500">{new Date(t.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-white tabular flex-shrink-0">{fmt(t.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick links */}
          <div className="panel p-4">
            <h3 className="text-sm font-display font-bold text-white mb-3 flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-neon-300" /> Quick Actions
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {canSeeFinance && (
                <QuickAction label="Finance Overview"  icon={TrendingUp}   onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'finance' }))} />
              )}
              {canSeeRequests && (
                <QuickAction label="Pending Requests"  icon={Clock}        badge={stats.pending_deposits + stats.pending_withdrawals} onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'requests' }))} />
              )}
              {canSeeUsers && (
                <QuickAction label="All Users"         icon={Users}        onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'users' }))} />
              )}
              {canSeeTickets && (
                <QuickAction label="Support Tickets"   icon={CheckCircle2} onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'tickets' }))} />
              )}
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
