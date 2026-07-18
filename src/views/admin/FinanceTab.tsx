import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Clock, CheckCircle2, XCircle,
  Loader2, RefreshCw, Calendar, FileText, Gamepad2, Gift, Plus, Minus, Banknote,
} from 'lucide-react';
import { cms } from '../../lib/cms';
import { supabaseGetTransactions, supabaseGetBets, type SupabaseTransaction, type SupabaseBet } from '../../lib/supabaseIntegration';

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s: string) {
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function statusChip(status: string) {
  switch (status) {
    case 'completed': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'processing': return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    case 'failed':
    case 'cancelled': return 'bg-red-500/15 text-red-300 border-red-500/30';
    default:          return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  }
}

type Period = 'day' | 'week' | 'month' | 'year' | 'custom';
type ActMode = 'approve' | 'cancel';
type ActState = { id: string; mode: ActMode } | null;

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
  const [acting, setActing]             = useState<ActState>(null);
  const [inputVal, setInputVal]         = useState('');
  const [updatingId, setUpdatingId]     = useState<string | null>(null);
  const [localMeta, setLocalMeta]       = useState<Record<string, { utr?: string; reason?: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [txns, betsData] = await Promise.all([supabaseGetTransactions(), supabaseGetBets()]);
      setTransactions(txns);
      setBets(betsData);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const { cutoff, endCutoff } = useMemo(() => {
    if (period === 'custom') {
      return { cutoff: fromDate ? new Date(fromDate).getTime() : 0, endCutoff: toDate ? new Date(toDate).getTime() + 86400000 : Date.now() + 86400000 };
    }
    return { cutoff: Date.now() - (MS[period] ?? MS.day), endCutoff: Date.now() + 86400000 };
  }, [period, fromDate, toDate]);

  const inRange = (iso: string) => { const ts = new Date(iso).getTime(); return ts >= cutoff && ts <= endCutoff; };
  const filteredTxns = transactions.filter((t) => inRange(t.created_at));
  const filteredBets = bets.filter((b) => b.placed_at && inRange(b.placed_at));

  const totalDeposits    = filteredTxns.filter((t) => t.type === 'deposit'    && t.status === 'completed').reduce((s, t) => s + t.amount, 0);
  const totalWithdrawals = filteredTxns.filter((t) => t.type === 'withdrawal' && t.status === 'completed').reduce((s, t) => s + t.amount, 0);
  const pendingCount     = filteredTxns.filter((t) => t.status === 'pending' || t.status === 'processing').length;
  const gameProfit       = filteredBets.reduce((s, b) => s + (b.bet_amount - (b.win_amount ?? 0)), 0);
  const bonusTotal       = filteredTxns.filter((t) => t.type === 'bonus').reduce((s, t) => s + t.amount, 0);
  const adjPositive      = filteredTxns.filter((t) => t.type === 'adjustment' && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const adjNegative      = filteredTxns.filter((t) => t.type === 'adjustment' && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const liveProfit       = totalDeposits - totalWithdrawals + gameProfit - bonusTotal;

  // ── Actions: go through cms so user gets notification + realtime bell update ──
  const handleAccept = async (id: string) => {
    const txn = transactions.find((t) => t.id === id);
    if (!txn) return;
    setUpdatingId(id);
    try {
      if (txn.type === 'deposit') await cms.setDepositStatus(id, 'processing');
      else await cms.setWithdrawalStatus(id, 'processing');
      setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, status: 'processing' } : t));
    } finally { setUpdatingId(null); }
  };

  const handleComplete = async () => {
    if (!acting) return;
    const { id, mode } = acting;
    const txn = transactions.find((t) => t.id === id);
    if (!txn) return;
    const isDeposit = txn.type === 'deposit';

    if (mode === 'approve') {
      const utr = inputVal.trim();
      if (!utr) { alert('UTR / Transaction ID is required to approve.'); return; }
      setUpdatingId(id);
      try {
        // cms.setDepositStatus sends user notification + triggers referral bonus + updates bell
        if (isDeposit) await cms.setDepositStatus(id, 'approved', utr);
        else           await cms.setWithdrawalStatus(id, 'approved', utr);
        setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, status: 'completed' } : t));
        setLocalMeta((prev) => ({ ...prev, [id]: { ...prev[id], utr } }));
      } finally { setUpdatingId(null); }
    } else {
      const reason = inputVal.trim() || undefined;
      setUpdatingId(id);
      try {
        if (isDeposit) await cms.setDepositStatus(id, 'rejected', undefined, reason);
        else           await cms.setWithdrawalStatus(id, 'rejected', undefined, reason);
        setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, status: 'failed' } : t));
        if (reason) setLocalMeta((prev) => ({ ...prev, [id]: { ...prev[id], reason } }));
      } finally { setUpdatingId(null); }
    }
    setActing(null);
    setInputVal('');
  };

  const clearAct = () => { setActing(null); setInputVal(''); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white">Finance Dashboard</h2>
          <p className="text-xs text-slate-500">Live data — actions trigger user notifications via Supabase.</p>
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

      {/* Deposits */}
      <div className="space-y-3">
        <h3 className="font-bold text-white flex items-center gap-2"><Banknote className="w-4 h-4 text-emerald-400" /> Deposit Requests</h3>
        {loading ? (
          <div className="flex items-center justify-center p-8 text-slate-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
        ) : filteredTxns.filter((t) => t.type === 'deposit').length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-500 text-center">No deposits in this period.</div>
        ) : (
          <div className="space-y-2">
            {filteredTxns.filter((t) => t.type === 'deposit').map((t) => (
              <TxnCard key={t.id} t={t} acting={acting} setActing={setActing} inputVal={inputVal} setInputVal={setInputVal} updatingId={updatingId} localMeta={localMeta} onAccept={handleAccept} onComplete={handleComplete} onClear={clearAct} />
            ))}
          </div>
        )}
      </div>

      {/* Withdrawals */}
      <div className="space-y-3">
        <h3 className="font-bold text-white flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-400" /> Withdrawal Requests</h3>
        {loading ? (
          <div className="flex items-center justify-center p-8 text-slate-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
        ) : filteredTxns.filter((t) => t.type === 'withdrawal').length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-500 text-center">No withdrawals in this period.</div>
        ) : (
          <div className="space-y-2">
            {filteredTxns.filter((t) => t.type === 'withdrawal').map((t) => (
              <TxnCard key={t.id} t={t} acting={acting} setActing={setActing} inputVal={inputVal} setInputVal={setInputVal} updatingId={updatingId} localMeta={localMeta} onAccept={handleAccept} onComplete={handleComplete} onClear={clearAct} />
            ))}
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

function TxnCard({ t, acting, setActing, inputVal, setInputVal, updatingId, localMeta, onAccept, onComplete, onClear }: {
  t: SupabaseTransaction; acting: ActState; setActing: (a: ActState) => void;
  inputVal: string; setInputVal: (s: string) => void; updatingId: string | null;
  localMeta: Record<string, { utr?: string; reason?: string }>;
  onAccept: (id: string) => Promise<void>; onComplete: () => Promise<void>; onClear: () => void;
}) {
  const isActing   = acting?.id === t.id;
  const isTerminal = t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled';
  const meta       = localMeta[t.id];
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-white font-semibold font-mono truncate">{(t.user_id ?? '—').slice(0, 12)}…</div>
          <div className="text-[10px] text-slate-500 truncate">{t.reference ?? t.id.slice(0, 10)} · {fmtDate(t.created_at)}</div>
        </div>
        <div className="text-sm font-bold text-white tabular flex-shrink-0">₹{t.amount.toLocaleString('en-IN')}</div>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusChip(t.status)}`}>
          {t.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
          {t.status}
        </span>
        {!isTerminal && !updatingId && (
          <div className="flex gap-1.5">
            {t.status === 'pending' && (
              <button onClick={() => void onAccept(t.id)} className="px-2 py-1 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[10px] font-semibold hover:text-blue-200">Accept</button>
            )}
            {t.status === 'processing' && (
              <button onClick={() => { setActing({ id: t.id, mode: 'approve' }); setInputVal(''); }} className="px-2 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold hover:text-emerald-200">Approve</button>
            )}
            {(t.status === 'pending' || t.status === 'processing') && (
              <button onClick={() => { setActing({ id: t.id, mode: 'cancel' }); setInputVal(''); }} className="px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-semibold hover:text-red-200">Reject</button>
            )}
          </div>
        )}
        {updatingId === t.id && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      </div>
      {isActing && (
        <div className="flex items-center gap-2">
          <input type="text" value={inputVal} onChange={(e) => setInputVal(e.target.value)}
            placeholder={acting?.mode === 'approve' ? 'UTR / Transaction ID (required)' : 'Reason (optional)'}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none" autoFocus />
          <button onClick={() => void onComplete()} className="px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Save
          </button>
          <button onClick={onClear} className="px-2 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white">
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {(meta?.utr || meta?.reason) && (
        <div className="text-[11px] space-y-1">
          {meta.utr && <div className="text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2 py-1 flex items-center gap-1"><FileText className="w-3 h-3" /> UTR: <span className="font-mono">{meta.utr}</span></div>}
          {meta.reason && <div className="text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-2 py-1 flex items-center gap-1"><XCircle className="w-3 h-3" /> {meta.reason}</div>}
        </div>
      )}
    </div>
  );
}
