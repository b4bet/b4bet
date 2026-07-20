import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Clock, Loader2, RefreshCw, Calendar,
  Gamepad2, Gift, Plus, Minus, Banknote, Wifi, Bell, ArrowRight,
} from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { supabaseGetTransactions, supabaseGetBets, type SupabaseTransaction, type SupabaseBet } from '../../lib/supabaseIntegration';

function fmt(n: number) {
  return '\u20B9' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s: string) {
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function statusChip(status: string) {
  switch (status) {
    case 'completed': case 'approved': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'processing': return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    case 'failed': case 'cancelled': case 'rejected': return 'bg-red-500/15 text-red-300 border-red-500/30';
    default: return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  }
}

type Period = 'day' | 'week' | 'month' | 'year' | 'custom';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: '24H' }, { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' }, { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
];
const MS: Record<string, number> = { day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 };

export default function FinanceTab() {
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [bets, setBets]                 = useState<SupabaseBet[]>([]);
  const [loading, setLoading]           = useState(true);
  const [period, setPeriod]             = useState<Period>('day');
  const [fromDate, setFromDate]         = useState('');
  const [toDate, setToDate]             = useState('');
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [txns, betsData] = await Promise.all([supabaseGetTransactions(), supabaseGetBets()]);
      setTransactions(txns);
      setBets(betsData);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Supabase Realtime — auto-refresh finance data
  useEffect(() => {
    const channel = supabase
      .channel('finance_tab_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        void load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => {
        void load();
      })
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const { cutoff, endCutoff } = useMemo(() => {
    if (period === 'custom') {
      return { cutoff: fromDate ? new Date(fromDate).getTime() : 0, endCutoff: toDate ? new Date(toDate).getTime() + 86400000 : Date.now() + 86400000 };
    }
    return { cutoff: Date.now() - (MS[period] ?? MS.day), endCutoff: Date.now() + 86400000 };
  }, [period, fromDate, toDate]);

  const inRange = (iso: string) => { const ts = new Date(iso).getTime(); return ts >= cutoff && ts <= endCutoff; };
  const filteredTxns = transactions.filter((t) => inRange(t.created_at));
  const filteredBets = bets.filter((b) => b.placed_at && inRange(b.placed_at));

  const totalDeposits    = filteredTxns.filter((t) => t.type === 'deposit'    && (t.status === 'completed' || t.status === 'approved')).reduce((s, t) => s + t.amount, 0);
  const totalWithdrawals = filteredTxns.filter((t) => t.type === 'withdrawal' && (t.status === 'completed' || t.status === 'approved')).reduce((s, t) => s + t.amount, 0);
  const pendingCount     = filteredTxns.filter((t) => t.status === 'pending' || t.status === 'processing').length;
  const gameProfit       = filteredBets.reduce((s, b) => s + (b.bet_amount - (b.win_amount ?? 0)), 0);
  const bonusTotal       = filteredTxns.filter((t) => t.type === 'bonus').reduce((s, t) => s + t.amount, 0);
  const adjPositive      = filteredTxns.filter((t) => t.type === 'adjustment' && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const adjNegative      = filteredTxns.filter((t) => t.type === 'adjustment' && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const liveProfit       = totalDeposits - totalWithdrawals + gameProfit - bonusTotal;

  const pendingTxns  = filteredTxns.filter((t) => t.status === 'pending' || t.status === 'processing');
  const recentPending = [...pendingTxns].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white">Finance Dashboard</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-slate-500">Read-only overview — approve/reject from the Requests tab.</p>
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
        <button onClick={() => void load()} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-xs font-semibold disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Period filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
              period === p.key ? 'bg-violet-500/20 border-violet-400/50 text-violet-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}>
            {p.label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-transparent text-xs text-white outline-none" />
          </div>
          <span className="text-slate-500 text-xs">to</span>
          <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-transparent text-xs text-white outline-none" />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Deposits"    value={fmt(totalDeposits)}    icon={TrendingUp}  accent="text-emerald-400" />
        <StatCard label="Withdrawals" value={fmt(totalWithdrawals)} icon={TrendingDown} accent="text-red-400" />
        <StatCard label="Net Profit"  value={fmt(liveProfit)}       icon={DollarSign}  accent={liveProfit >= 0 ? 'text-violet-300' : 'text-red-400'} />
        <StatCard label="Pending"     value={String(pendingCount)}  icon={Clock}       accent="text-amber-400" />
      </div>

      {/* Breakdown */}
      <div>
        <h3 className="font-bold text-white text-sm mb-2">Financial Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Signup Bonuses"  value={fmt(bonusTotal)}  icon={Gift}     accent="text-amber-300" />
          <StatCard label="Manual Adjust +" value={fmt(adjPositive)} icon={Plus}     accent="text-emerald-300" />
          <StatCard label="Manual Adjust -" value={fmt(adjNegative)} icon={Minus}    accent="text-red-300" />
          <StatCard label="Game Profit"     value={fmt(gameProfit)}  icon={Gamepad2} accent={gameProfit >= 0 ? 'text-violet-300' : 'text-red-400'} />
        </div>
      </div>

      {/* New Requests — notification only, action happens in Requests tab */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" /> New Requests
            {pendingCount > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">{pendingCount}</span>}
          </h3>
          <a href="#requests" className="flex items-center gap-1 text-[11px] font-semibold text-violet-300 hover:text-violet-200">
            Go to Requests tab <ArrowRight className="w-3 h-3" />
          </a>
        </div>
        {loading ? (
          <div className="flex items-center justify-center p-8 text-slate-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
        ) : recentPending.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-500 text-center">No pending deposit/withdrawal requests right now.</div>
        ) : (
          <div className="space-y-2">
            {recentPending.map((t) => (
              <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {t.type === 'deposit'
                    ? <Banknote className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    : <TrendingDown className="w-4 h-4 text-red-400 flex-shrink-0" />}
                  <div className="min-w-0">
                    <div className="text-xs text-white font-semibold truncate">{t.type === 'deposit' ? 'Deposit' : 'Withdrawal'} request</div>
                    <div className="text-[10px] text-slate-500 truncate">{fmtDate(t.created_at)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusChip(t.status)}`}>
                    {t.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                    {t.status}
                  </span>
                  <span className="text-sm font-bold text-white tabular">{fmt(t.amount)}</span>
                </div>
              </div>
            ))}
            {pendingTxns.length > recentPending.length && (
              <p className="text-[11px] text-slate-600 text-center">+{pendingTxns.length - recentPending.length} more waiting — see Requests tab</p>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-600 text-center">Showing {filteredTxns.length} of {transactions.length} transactions</p>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: typeof TrendingUp; accent: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-hidden">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold truncate">{label}</span>
        <Icon className={`w-4 h-4 flex-shrink-0 ${accent}`} />
      </div>
      <p className={`text-xl font-bold tabular truncate ${accent}`} title={value}>{value}</p>
    </div>
  );
}
