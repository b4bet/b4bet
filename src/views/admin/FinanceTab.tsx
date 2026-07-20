import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Clock, Loader2, RefreshCw, Calendar,
  Gamepad2, Gift, Plus, Minus, Wifi,
} from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { supabaseGetTransactions, supabaseGetBets, type SupabaseTransaction, type SupabaseBet } from '../../lib/supabaseIntegration';

function fmt(n: number) {
  return '\u20B9' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const betVolume        = filteredBets.reduce((s, b) => s + b.bet_amount, 0);

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

      {/* Bet volume */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Bet Volume" value={fmt(betVolume)} icon={Plus} accent="text-blue-300" />
      </div>

      {/* Net Profit Formula */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h3 className="text-xs font-display font-bold text-white mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-violet-300" /> Net Profit Formula
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-mono font-bold">{fmt(totalDeposits)}</span>
          <Minus className="w-3 h-3 text-slate-500" />
          <span className="px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 font-mono font-bold">{fmt(totalWithdrawals)}</span>
          <Plus className="w-3 h-3 text-slate-500" />
          <span className="px-2 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 font-mono font-bold">{fmt(gameProfit)}</span>
          <Minus className="w-3 h-3 text-slate-500" />
          <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono font-bold">{fmt(bonusTotal)}</span>
          <span className="text-slate-500 text-xs">=</span>
          <span className={`px-3 py-1 rounded-lg border font-display font-extrabold text-base ${liveProfit >= 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>{fmt(liveProfit)}</span>
        </div>
        <p className="text-[10px] text-slate-600 mt-2">Deposits − Withdrawals + Game Profit − Bonuses = Net Profit</p>
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
