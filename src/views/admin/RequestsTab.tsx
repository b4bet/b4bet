import { useState, useEffect, useCallback } from 'react';
import { Banknote, TrendingDown, CheckCircle2, XCircle, Clock, Loader2, Search, RefreshCw } from 'lucide-react';
import { supabaseGetTransactions, supabaseUpdateTransactionStatus, type SupabaseTransaction } from '../../lib/supabaseIntegration';

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RequestsTab() {
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [tab, setTab] = useState<'deposit' | 'withdrawal'>('deposit');
  const [search, setSearch] = useState('');

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

  const pending = transactions.filter(
    (t) => t.type === tab && (t.status === 'pending' || t.status === 'processing')
  ).filter((t) =>
    !search || (t.user_id ?? '').toLowerCase().includes(search.toLowerCase()) ||
    t.id.toLowerCase().includes(search.toLowerCase())
  );

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      await supabaseUpdateTransactionStatus(id, status);
      setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
    } finally {
      setUpdatingId(null);
    }
  };

  const pendingDeposits = transactions.filter((t) => t.type === 'deposit' && t.status === 'pending').length;
  const pendingWithdrawals = transactions.filter((t) => t.type === 'withdrawal' && t.status === 'pending').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white">Deposit / Withdraw Requests</h2>
          <p className="text-xs text-slate-500">Pending approvals — live from Supabase.</p>
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

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('deposit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
            tab === 'deposit'
              ? 'bg-emeraldwin-500/20 border-emeraldwin-500/40 text-emeraldwin-300'
              : 'bg-slatepanel-800 border-borderline-900 text-slate-400 hover:text-white'
          }`}
        >
          <Banknote className="w-4 h-4" />
          Deposits
          {pendingDeposits > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-coral-500 text-white text-[10px] font-bold grid place-items-center">
              {pendingDeposits}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('withdrawal')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
            tab === 'withdrawal'
              ? 'bg-coral-500/20 border-coral-500/40 text-coral-300'
              : 'bg-slatepanel-800 border-borderline-900 text-slate-400 hover:text-white'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          Withdrawals
          {pendingWithdrawals > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-coral-500 text-white text-[10px] font-bold grid place-items-center">
              {pendingWithdrawals}
            </span>
          )}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by user ID or transaction ID…"
          className="input pl-10"
        />
      </div>

      {/* Table */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-midnight-850 border-b border-borderline-900">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="p-3">Txn ID</th>
                <th className="p-3">User ID</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline-900">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
                </td></tr>
              ) : pending.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">
                  <Clock className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                  No pending {tab} requests.
                </td></tr>
              ) : (
                pending.map((t) => (
                  <tr key={t.id} className="hover:bg-slatepanel-800/50">
                    <td className="p-3 font-mono text-[11px] text-slate-400">{t.id.slice(0, 10)}…</td>
                    <td className="p-3 font-mono text-[11px] text-neon-200">{(t.user_id ?? '—').slice(0, 10)}…</td>
                    <td className="p-3 font-semibold text-white tabular">{fmt(t.amount)}</td>
                    <td className="p-3">
                      <span className="chip text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/40">
                        <Clock className="w-3 h-3" /> {t.status}
                      </span>
                    </td>
                    <td className="p-3 text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(t.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 text-right">
                      {updatingId === t.id ? (
                        <Loader2 className="w-4 h-4 animate-spin ml-auto" />
                      ) : (
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => void updateStatus(t.id, 'completed')}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emeraldwin-500/20 border border-emeraldwin-500/40 text-emeraldwin-300 text-[10px] font-semibold hover:text-emeraldwin-200"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Approve
                          </button>
                          <button
                            onClick={() => void updateStatus(t.id, 'failed')}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-coral-500/20 border border-coral-500/40 text-coral-300 text-[10px] font-semibold hover:text-coral-200"
                          >
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-slate-600 text-center">{pending.length} pending request{pending.length !== 1 ? 's' : ''}</p>
    </div>
  );
}
