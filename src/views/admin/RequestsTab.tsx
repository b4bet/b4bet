import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Banknote, TrendingDown, CheckCircle2, XCircle, Clock, Loader2,
  FileText, Search, Calendar, RefreshCw,
} from 'lucide-react';
import {
  supabaseGetTransactions,
  supabaseUpdateTransactionStatus,
  type SupabaseTransaction,
} from '../../lib/supabaseIntegration';

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s: string) {
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function statusChip(status: string) {
  switch (status) {
    case 'completed': return { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', label: 'Accepted' };
    case 'processing': return { cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30', label: 'Processing' };
    case 'failed':
    case 'cancelled': return { cls: 'bg-red-500/15 text-red-300 border-red-500/30', label: 'Rejected' };
    default:          return { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Pending' };
  }
}

type Period = 'all' | 'day' | 'week' | 'month' | 'year' | 'custom';
type ActMode = 'accept' | 'reject';
type ActState = { id: string; mode: ActMode } | null;

const PERIODS: { key: Period; label: string }[] = [
  { key: 'all',    label: 'All' },
  { key: 'day',    label: 'Day' },
  { key: 'week',   label: 'Week' },
  { key: 'month',  label: 'Month' },
  { key: 'year',   label: 'Year' },
  { key: 'custom', label: 'Custom' },
];
const MS: Record<string, number> = { day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 };

export default function RequestsTab() {
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [view, setView]                 = useState<'deposit' | 'withdrawal'>('deposit');
  const [query, setQuery]               = useState('');
  const [period, setPeriod]             = useState<Period>('all');
  const [fromDate, setFromDate]         = useState('');
  const [toDate, setToDate]             = useState('');
  const [acting, setActing]             = useState<ActState>(null);
  const [inputVal, setInputVal]         = useState('');
  const [updatingId, setUpdatingId]     = useState<string | null>(null);
  // Local UTR/reason store (session only – no Supabase metadata update API)
  const [localMeta, setLocalMeta]       = useState<Record<string, { utr?: string; reason?: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTransactions(await supabaseGetTransactions());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Time range ──
  const { cutoff, endCutoff } = useMemo(() => {
    if (period === 'custom') {
      return {
        cutoff:    fromDate ? new Date(fromDate).getTime() : 0,
        endCutoff: toDate   ? new Date(toDate).getTime() + 86400000 : Date.now() + 86400000,
      };
    }
    if (period === 'all') return { cutoff: 0, endCutoff: Date.now() + 86400000 };
    return { cutoff: Date.now() - (MS[period] ?? 0), endCutoff: Date.now() + 86400000 };
  }, [period, fromDate, toDate]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (t.type !== view) return false;
      const ts = new Date(t.created_at).getTime();
      if (ts < cutoff || ts > endCutoff) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        (t.user_id ?? '').toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      );
    });
  }, [transactions, view, cutoff, endCutoff, query]);

  const pendingDep = transactions.filter((t) => t.type === 'deposit'    && (t.status === 'pending' || t.status === 'processing')).length;
  const pendingWd  = transactions.filter((t) => t.type === 'withdrawal' && (t.status === 'pending' || t.status === 'processing')).length;

  // ── Actions ──
  const handleAccept = async (id: string) => {
    setUpdatingId(id);
    try {
      await supabaseUpdateTransactionStatus(id, 'processing');
      setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, status: 'processing' } : t));
    } finally { setUpdatingId(null); }
  };

  const handleSubmit = async () => {
    if (!acting) return;
    const { id, mode } = acting;
    if (mode === 'accept') {
      const utr = inputVal.trim();
      if (!utr) { alert('UTR / Transaction ID is required to accept.'); return; }
      setUpdatingId(id);
      try {
        await supabaseUpdateTransactionStatus(id, 'completed');
        setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, status: 'completed' } : t));
        setLocalMeta((prev) => ({ ...prev, [id]: { ...prev[id], utr } }));
      } finally { setUpdatingId(null); }
    } else {
      const reason = inputVal.trim() || undefined;
      setUpdatingId(id);
      try {
        await supabaseUpdateTransactionStatus(id, 'failed');
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
          <h2 className="font-display font-bold text-lg text-white">Deposit / Withdraw Requests</h2>
          <p className="text-xs text-slate-500">Accept with UTR or reject with optional reason — Supabase.</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Period filter ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
              period === p.key
                ? 'bg-violet-500/20 border-violet-400/50 text-violet-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
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

      {/* ── View tabs (deposit / withdrawal) ── */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('deposit')}
          className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
            view === 'deposit'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          <Banknote className="w-4 h-4" /> Deposits
          {pendingDep > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
              {pendingDep}
            </span>
          )}
        </button>
        <button
          onClick={() => setView('withdrawal')}
          className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
            view === 'withdrawal'
              ? 'bg-red-500/15 border-red-500/40 text-red-300'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          <TrendingDown className="w-4 h-4" /> Withdrawals
          {pendingWd > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
              {pendingWd}
            </span>
          )}
        </button>
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search user, amount, ID..."
          className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white outline-none"
        />
      </div>

      {/* ── Cards ── */}
      {loading ? (
        <div className="flex items-center justify-center p-10 text-slate-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading from Supabase…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-sm text-slate-500 text-center">
          <Clock className="w-6 h-6 mx-auto mb-2 text-slate-600" />
          No {view} requests in this period.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const { cls, label } = statusChip(t.status);
            const isActing   = acting?.id === t.id;
            const isTerminal = t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled';
            const meta       = localMeta[t.id];

            return (
              <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                {/* Row 1: user + amount */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm text-white font-semibold font-mono truncate">
                      {(t.user_id ?? '—').slice(0, 14)}…
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {t.reference ?? t.id.slice(0, 10)} · {fmtDate(t.created_at)}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-white tabular flex-shrink-0">{fmt(t.amount)}</div>
                </div>

                {/* Row 2: status + actions */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
                    {t.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                    {label}
                  </span>
                  {!isTerminal && updatingId !== t.id && (
                    <div className="flex gap-1.5">
                      {t.status === 'pending' && (
                        <button
                          onClick={() => void handleAccept(t.id)}
                          className="px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[10px] font-semibold hover:text-blue-200"
                        >
                          Accept
                        </button>
                      )}
                      {t.status === 'processing' && (
                        <button
                          onClick={() => { setActing({ id: t.id, mode: 'accept' }); setInputVal(''); }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold hover:text-emerald-200"
                        >
                          Approve (UTR)
                        </button>
                      )}
                      <button
                        onClick={() => { setActing({ id: t.id, mode: 'reject' }); setInputVal(''); }}
                        className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-semibold hover:text-red-200"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {updatingId === t.id && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                </div>

                {/* Inline action input */}
                {isActing && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      placeholder={acting?.mode === 'accept' ? 'UTR / Transaction ID (required)' : 'Reason (optional)'}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => void handleSubmit()}
                      className="px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Save
                    </button>
                    <button
                      onClick={clearAct}
                      className="px-2 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* UTR / reason display */}
                {(meta?.utr || meta?.reason) && (
                  <div className="text-[11px] space-y-1">
                    {meta.utr && (
                      <div className="text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2 py-1 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> UTR: <span className="font-mono">{meta.utr}</span>
                      </div>
                    )}
                    {meta.reason && (
                      <div className="text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-2 py-1 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> {meta.reason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-600 text-center">
        {filtered.length} {view} request{filtered.length !== 1 ? 's' : ''} shown
      </p>
    </div>
  );
}
