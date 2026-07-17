import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Clock, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { supabaseGetTransactions, supabaseUpdateTransactionStatus, type SupabaseTransaction } from '../../lib/supabaseIntegration';

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  processing: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  completed: 'bg-emeraldwin-500/15 text-emeraldwin-300 border-emeraldwin-500/40',
  failed: 'bg-coral-500/15 text-coral-300 border-coral-500/40',
  cancelled: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
};

export default function FinanceTab() {
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'deposit' | 'withdrawal'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'failed'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supabaseGetTransactions();
      setTransactions(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = transactions.filter((t) => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    return true;
  });

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      await supabaseUpdateTransactionStatus(id, status);
      setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
    } catch (e) {
      console.error('updateStatus error:', e);
    } finally {
      setUpdatingId(null);
    }
  };

  // Stats
  const totalDeposits = transactions.filter((t) => t.type === 'deposit' && t.status === 'completed').reduce((s, t) => s + t.amount, 0);
  const totalWithdrawals = transactions.filter((t) => t.type === 'withdrawal' && t.status === 'completed').reduce((s, t) => s + t.amount, 0);
  const pendingDeposits = transactions.filter((t) => t.type === 'deposit' && t.status === 'pending').length;
  const pendingWithdrawals = transactions.filter((t) => t.type === 'withdrawal' && t.status === 'pending').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white">Finance Overview</h2>
          <p className="text-xs text-slate-500">Live transactions from Supabase.</p>
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

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Deposits" value={fmt(totalDeposits)} icon={TrendingUp} color="text-emeraldwin-300" />
        <StatCard label="Total Withdrawals" value={fmt(totalWithdrawals)} icon={TrendingDown} color="text-coral-300" />
        <StatCard label="Pending Deposits" value={String(pendingDeposits)} icon={Clock} color="text-amber-300" />
        <StatCard label="Pending Withdrawals" value={String(pendingWithdrawals)} icon={Clock} color="text-amber-300" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'deposit', 'withdrawal'] as const).map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              typeFilter === t
                ? 'bg-neon-500/20 border-neon-500/40 text-neon-300'
                : 'bg-slatepanel-800 border-borderline-900 text-slate-400 hover:text-white'
            }`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <span className="text-slate-600 text-xs self-center">│</span>
        {(['all', 'pending', 'completed', 'failed'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              statusFilter === s
                ? 'bg-neon-500/20 border-neon-500/40 text-neon-300'
                : 'bg-slatepanel-800 border-borderline-900 text-slate-400 hover:text-white'
            }`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-midnight-850 border-b border-borderline-900">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="p-3">ID</th>
                <th className="p-3">User</th>
                <th className="p-3">Type</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline-900">
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading from Supabase…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">No transactions found.</td></tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-slatepanel-800/50">
                    <td className="p-3 font-mono text-[11px] text-slate-400">{t.id.slice(0, 8)}…</td>
                    <td className="p-3 font-mono text-[11px] text-neon-200">{(t.user_id ?? '—').slice(0, 8)}…</td>
                    <td className="p-3">
                      <span className={`chip text-[10px] ${
                        t.type === 'deposit'
                          ? 'bg-emeraldwin-500/15 text-emeraldwin-300 border-emeraldwin-500/40'
                          : 'bg-coral-500/15 text-coral-300 border-coral-500/40'
                      }`}>
                        {t.type === 'deposit' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {t.type}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-white tabular">{fmt(t.amount)}</td>
                    <td className="p-3">
                      <span className={`chip text-[10px] border ${STATUS_COLORS[t.status] ?? STATUS_COLORS.pending}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="p-3 text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(t.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 text-right">
                      {updatingId === t.id ? (
                        <Loader2 className="w-4 h-4 animate-spin ml-auto text-slate-400" />
                      ) : t.status === 'pending' ? (
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => void updateStatus(t.id, 'completed')}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emeraldwin-500/20 border border-emeraldwin-500/40 text-emeraldwin-300 hover:text-emeraldwin-200 text-[10px] font-semibold"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Approve
                          </button>
                          <button
                            onClick={() => void updateStatus(t.id, 'failed')}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-coral-500/20 border border-coral-500/40 text-coral-300 hover:text-coral-200 text-[10px] font-semibold"
                          >
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500 capitalize">{t.status}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-600 text-center">Showing {filtered.length} of {transactions.length} transactions</p>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof TrendingUp; color: string }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-slate-500">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className={`text-xl font-display font-extrabold ${color}`}>{value}</p>
    </div>
  );
}
