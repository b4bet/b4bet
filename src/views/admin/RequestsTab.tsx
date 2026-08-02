import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Banknote, TrendingDown, CheckCircle2, XCircle, Clock, Loader2,
  FileText, Search, Calendar, RefreshCw, History,
} from 'lucide-react';
import { cms } from '../../lib/cms';
import { supabaseGetTransactions, supabaseGetUsers, type SupabaseTransaction, type SupabaseProfile } from '../../lib/supabaseIntegration';

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s: string) {
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function statusChip(status: string) {
  switch (status) {
    case 'completed':  return { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', label: 'Accepted' };
    case 'processing': return { cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30',         label: 'Processing' };
    case 'failed':     return { cls: 'bg-red-500/15 text-red-300 border-red-500/30',             label: 'Failed' };
    case 'cancelled':  return { cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30',   label: 'Cancelled' };
    default:           return { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',       label: 'Pending' };
  }
}

/**
 * Extract UPI ID from transaction metadata.
 * Handles multiple storage formats:
 * 1. txnMeta.destination  — set by UpiWithdrawalModal via cms.submitWithdrawal
 * 2. txnMeta.upi_id       — legacy field
 * 3. txnMeta.details      — JSON string or object with upiId/upi_id inside
 *    e.g. details = '{"amount":"506","upiId":"8564007777@fam"}'
 */
function extractUpiId(txnMeta: Record<string, unknown>): string {
  // Direct fields first
  const direct = (txnMeta.destination as string) || (txnMeta.upi_id as string) || (txnMeta.account as string);
  if (direct) return direct;

  // Parse details — may be a JSON string or an object
  const rawDetails = txnMeta.details;
  if (rawDetails) {
    try {
      const parsed: Record<string, unknown> =
        typeof rawDetails === 'string' ? (JSON.parse(rawDetails) as Record<string, unknown>) : (rawDetails as Record<string, unknown>);
      const fromDetails = (parsed.upiId as string) || (parsed.upi_id as string) || (parsed.destination as string);
      if (fromDetails) return fromDetails;
    } catch {
      // details is a plain string description, not JSON — ignore
    }
  }

  return '';
}

type Period = 'all' | 'day' | 'week' | 'month' | 'year' | 'custom';
// 'cancel' replaces 'reject' — cancels request and refunds withdrawal to user wallet
type ActMode = 'accept' | 'cancel';
type ActState = { id: string; mode: ActMode } | null;

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Today' }, { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' }, { key: 'year', label: 'Year' },
  { key: 'all', label: 'All' }, { key: 'custom', label: 'Custom' },
];
const MS: Record<string, number> = { day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 };

export default function RequestsTab() {
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [profiles, setProfiles]         = useState<SupabaseProfile[]>([]);
  const [loading, setLoading]           = useState(true);
  const [view, setView]                 = useState<'deposit' | 'withdrawal'>('deposit');
  const [query, setQuery]               = useState('');
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
      const [txns, users] = await Promise.all([supabaseGetTransactions(), supabaseGetUsers()]);
      setTransactions(txns);
      setProfiles(users);
    } finally { setLoading(false); }
  }, []);

  // user_id (uuid) -> 6-digit account_id lookup
  const accountIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of profiles) if (p.id && p.account_id) map[p.id] = p.account_id;
    return map;
  }, [profiles]);

  useEffect(() => { void load(); }, [load]);

  const { cutoff, endCutoff } = useMemo(() => {
    if (period === 'custom') {
      return { cutoff: fromDate ? new Date(fromDate).getTime() : 0, endCutoff: toDate ? new Date(toDate).getTime() + 86400000 : Date.now() + 86400000 };
    }
    if (period === 'all') return { cutoff: 0, endCutoff: Date.now() + 86400000 };
    return { cutoff: Date.now() - (MS[period] ?? 0), endCutoff: Date.now() + 86400000 };
  }, [period, fromDate, toDate]);

  const filtered = useMemo(() => transactions.filter((t) => {
    if (t.type !== view) return false;
    const ts = new Date(t.created_at).getTime();
    if (ts < cutoff || ts > endCutoff) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const acc = t.user_id ? (accountIdMap[t.user_id] ?? '') : '';
    return (t.user_id ?? '').toLowerCase().includes(q) || acc.toLowerCase().includes(q) || t.id.toLowerCase().includes(q) || t.status.toLowerCase().includes(q) || String(t.amount).includes(q);
  }), [transactions, view, cutoff, endCutoff, query, accountIdMap]);

  const pendingDep = transactions.filter((t) => t.type === 'deposit'    && (t.status === 'pending' || t.status === 'processing')).length;
  const pendingWd  = transactions.filter((t) => t.type === 'withdrawal' && (t.status === 'pending' || t.status === 'processing')).length;

  // Needs action vs finalized (read-only history)
  const queueItems   = useMemo(() => filtered.filter((t) => t.status === 'pending' || t.status === 'processing'), [filtered]);
  const historyItems = useMemo(() => filtered.filter((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'), [filtered]);

  // ── Actions ──
  const handleAccept = async (id: string) => {
    const txn = transactions.find((t) => t.id === id);
    if (!txn) { alert('Could not find this request in the loaded list. Try Refresh.'); return; }
    setUpdatingId(id);
    try {
      if (txn.type === 'deposit') await cms.setDepositStatus(id, 'processing');
      else await cms.setWithdrawalStatus(id, 'processing');
      setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, status: 'processing' } : t));
    } catch (e) {
      alert('Accept failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setUpdatingId(null); }
  };

  const handleSubmit = async () => {
    if (!acting) return;
    const { id, mode } = acting;
    const txn = transactions.find((t) => t.id === id);
    if (!txn) return;
    const isDeposit = txn.type === 'deposit';

    if (mode === 'accept') {
      const utr = inputVal.trim();
      if (!utr) { alert('UTR / Transaction ID is required to accept.'); return; }
      setUpdatingId(id);
      try {
        if (isDeposit) await cms.setDepositStatus(id, 'approved', utr);
        else await cms.setWithdrawalStatus(id, 'approved', utr);
        setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, status: 'completed' } : t));
        setLocalMeta((prev) => ({ ...prev, [id]: { ...prev[id], utr } }));
      } catch (e) {
        alert('Approve failed: ' + (e instanceof Error ? e.message : String(e)));
        return;
      } finally { setUpdatingId(null); }
    } else {
      // Cancel: refunds withdrawal amount to user wallet in Supabase
      const reason = inputVal.trim() || undefined;
      setUpdatingId(id);
      try {
        if (isDeposit) await cms.setDepositStatus(id, 'cancelled', undefined, reason);
        else await cms.setWithdrawalStatus(id, 'cancelled', undefined, reason);
        setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, status: 'cancelled' } : t));
        if (reason) setLocalMeta((prev) => ({ ...prev, [id]: { ...prev[id], reason } }));
      } catch (e) {
        alert('Cancel failed: ' + (e instanceof Error ? e.message : String(e)));
        return;
      } finally { setUpdatingId(null); }
    }
    setActing(null);
    setInputVal('');
  };

  const clearAct = () => { setActing(null); setInputVal(''); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-bold text-white">Deposit / Withdraw Requests</div>
          <div className="text-xs text-slate-500">Actions send user notifications via Supabase.</div>
        </div>
        <button onClick={() => void load()} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-xs font-semibold disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Deposit / Withdrawal tabs */}
      <div className="flex gap-2">
        <button onClick={() => setView('deposit')}
          className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
            view === 'deposit' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
          }`}>
          <Banknote className="w-4 h-4" />Deposits
          {pendingDep > 0 && <span className="bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingDep}</span>}
        </button>
        <button onClick={() => setView('withdrawal')}
          className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
            view === 'withdrawal' ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
          }`}>
          <TrendingDown className="w-4 h-4" />Withdrawals
          {pendingWd > 0 && <span className="bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingWd}</span>}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search user, amount, ID..."
          className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white outline-none" />
      </div>

      {/* Split: items needing action vs finalized history */}
      {loading ? (
        <div className="text-center text-slate-500 py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading from Supabase…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-slate-500 py-8">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No {view} requests in this period.
        </div>
      ) : (
        <>
          {/* Pending Actions — needs admin action */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />Pending Actions ({queueItems.length})
            </div>
            {queueItems.length === 0 ? (
              <div className="text-xs text-slate-500 italic px-1">Nothing waiting on you right now.</div>
            ) : (
              <div className="space-y-2">
                {queueItems.map((t) => renderCard(t, true))}
              </div>
            )}
          </div>

          {/* Period filter — placed directly above History */}
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap gap-1.5">
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
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <input type="date" value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)} className="bg-transparent text-xs text-white outline-none" />
                </div>
                <span className="text-slate-500 text-xs">to</span>
                <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <input type="date" value={toDate}
                    onChange={(e) => setToDate(e.target.value)} className="bg-transparent text-xs text-white outline-none" />
                </div>
              </div>
            )}
          </div>

          {/* History — finalized, read-only */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />History ({historyItems.length})
            </div>
            {historyItems.length === 0 ? (
              <div className="text-xs text-slate-500 italic px-1">No finalized {view} requests in this period.</div>
            ) : (
              <div className="space-y-2">
                {historyItems.map((t) => renderCard(t, false))}
              </div>
            )}
          </div>
        </>
      )}
      <div className="text-[10px] text-slate-600 text-right">{filtered.length} {view} request{filtered.length !== 1 ? 's' : ''} shown</div>
    </div>
  );

  function renderCard(t: SupabaseTransaction, showActions: boolean) {
    const { cls, label }  = statusChip(t.status);
    const isActing        = acting?.id === t.id;
    const isTerminal      = t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled';
    const meta            = localMeta[t.id];
    const txnMeta         = (t.metadata as Record<string, unknown>) ?? {};
    const accountId       = t.user_id ? (accountIdMap[t.user_id] ?? '—') : '—';
    const depositMethod   = (txnMeta.method as string) || 'Manual';

    // Extract UPI ID — checks destination, upi_id, and details JSON
    const upiId           = extractUpiId(txnMeta);
    const utr             = meta?.utr || (txnMeta.utr as string | undefined);
    const reason          = meta?.reason || (txnMeta.reason as string | undefined);

    return (
      <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
        {/* Row 1: account ID + amount + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm text-white font-semibold font-mono truncate">ID: {accountId}</div>
            <div className="text-[10px] text-slate-500 truncate">{fmtDate(t.created_at)}{t.type === 'deposit' ? ` · ${depositMethod}` : ''}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-sm font-bold text-white tabular">{fmt(t.amount)}</div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>
          </div>
        </div>

        {/* Row 2: UPI ID — withdrawal only, shown prominently */}
        {t.type === 'withdrawal' && (
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2">
            <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-0.5">UPI ID / Destination</div>
            <div className={`text-sm font-mono font-semibold break-all ${upiId ? 'text-amber-300' : 'text-red-400'}`}>
              {upiId || '⚠ Not provided'}
            </div>
          </div>
        )}

        {/* Row 3: UTR (if already approved) */}
        {utr && (
          <div className="text-[10px] text-slate-400">
            <span className="text-slate-500">UTR: </span>
            <span className="font-mono text-emerald-400">{utr}</span>
          </div>
        )}

        {/* Row 4: Cancellation reason */}
        {reason && (
          <div className="text-[10px] text-orange-400">
            <span className="text-slate-500">Reason: </span>{reason}
          </div>
        )}

        {/* Actions */}
        {showActions && !isTerminal && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {t.status === 'pending' && (
              <button onClick={() => void handleAccept(t.id)} disabled={updatingId === t.id}
                className="px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[10px] font-semibold hover:text-blue-200 disabled:opacity-50 flex items-center gap-1">
                {updatingId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                Mark Processing
              </button>
            )}
            {t.status === 'processing' && (
              <button onClick={() => { setActing({ id: t.id, mode: 'accept' }); setInputVal(''); }} className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold hover:text-emerald-200">Approve (UTR)</button>
            )}
            {!isActing && (
              <button onClick={() => { setActing({ id: t.id, mode: 'cancel' }); setInputVal(''); }} className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-semibold hover:text-red-300 flex items-center gap-1">
                <XCircle className="w-3 h-3" />Cancel
              </button>
            )}
          </div>
        )}

        {/* Inline input for UTR / cancel reason */}
        {showActions && isActing && (
          <div className="flex items-center gap-2">
            <input type="text" value={inputVal} onChange={(e) => setInputVal(e.target.value)}
              placeholder={acting?.mode === 'accept' ? 'UTR / Transaction ID (required)' : 'Reason for cancellation (optional)'}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none" autoFocus />
            <button onClick={() => void handleSubmit()} className="px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Save
            </button>
            <button onClick={clearAct} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-semibold flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        )}
      </div>
    );
  }
}
