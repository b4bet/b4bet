import { useState, useMemo } from 'react';
import { Banknote, TrendingDown, CheckCircle2, XCircle, Clock, Loader2, FileText, Search, Calendar } from 'lucide-react';
import { cms, type DepositRequest, type WithdrawalRequest } from '../../lib/cms';
import { store } from '../../lib/store';
import { useFinance } from '../../lib/cmsHooks';

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function statusConfig(status: string) {
  switch (status) {
    case 'approved':   return { label: 'Accepted', icon: CheckCircle2, color: 'text-emeraldwin-300', bg: 'bg-emeraldwin-500/15', border: 'border-emeraldwin-500/30' };
    case 'processing': return { label: 'Processing', icon: Loader2, color: 'text-amberx-300', bg: 'bg-amberx-500/15', border: 'border-amberx-500/30' };
    case 'cancelled':
    case 'rejected':   return { label: 'Rejected', icon: XCircle, color: 'text-coral-300', bg: 'bg-coral-500/15', border: 'border-coral-500/30' };
    default:           return { label: 'Pending', icon: Clock, color: 'text-slate-300', bg: 'bg-slatepanel-800', border: 'border-borderline-900' };
  }
}

/**
 * Dedicated Deposit/Withdrawal Requests tab.
 *   • Accept  → requires UTR / Transaction ID (marks request approved).
 *   • Reject  → optional reason (marks request rejected).
 * All submitted requests appear here AND are visible in the Finance tab.
 */
export default function RequestsTab() {
  const { deposits, withdrawals } = useFinance();
  const [view, setView] = useState<'deposit' | 'withdrawal'>('deposit');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<'all' | 'day' | 'week' | 'month' | 'year' | 'custom'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [acting, setActing] = useState<{ id: string; kind: 'deposit' | 'withdrawal'; mode: 'accept' | 'reject' } | null>(null);
  const [input, setInput] = useState('');

  const clear = () => { setActing(null); setInput(''); };

  const submit = () => {
    if (!acting) return;
    const { id, kind, mode } = acting;
    if (mode === 'accept') {
      const utr = input.trim();
      if (!utr) { cms.toast({ title: 'UTR required', body: 'Enter UTR / Transaction ID to accept.', kind: 'alert' }); return; }
      if (kind === 'deposit') {
        cms.setDepositStatus(id, 'approved', utr);
        const d = deposits.find((x) => x.id === id);
        if (d) store.pushBalanceHistory({ userId: d.user, username: d.user, type: 'credit', amount: d.amount, reason: `UTR: ${utr}` });
      } else {
        cms.setWithdrawalStatus(id, 'approved', utr);
        const w = withdrawals.find((x) => x.id === id);
        if (w) store.pushBalanceHistory({ userId: w.user, username: w.user, type: 'debit', amount: w.amount, reason: `UTR: ${utr}` });
      }
      cms.toast({ title: 'Request accepted', body: `UTR: ${utr}`, kind: 'success' });
    } else {
      const reason = input.trim() || undefined;
      if (kind === 'deposit') cms.setDepositStatus(id, 'rejected', undefined, reason);
      else cms.setWithdrawalStatus(id, 'rejected', undefined, reason);
      cms.toast({ title: 'Request rejected', body: reason ? `Reason: ${reason}` : 'Rejected.', kind: 'warn' });
    }
    clear();
  };

  const msMap: Record<string, number> = { day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 };
  const { cutoff, endCutoff } = useMemo(() => {
    if (period === 'custom') {
      return {
        cutoff: fromDate ? new Date(fromDate).getTime() : 0,
        endCutoff: toDate ? new Date(toDate).getTime() + 86400000 : Date.now() + 86400000,
      };
    }
    if (period === 'all') return { cutoff: 0, endCutoff: Date.now() + 86400000 };
    return { cutoff: Date.now() - (msMap[period] || 0), endCutoff: Date.now() + 86400000 };
  }, [period, fromDate, toDate]);

  const list = view === 'deposit' ? deposits : withdrawals;
  const filtered = list.filter((r) => {
    if (r.ts < cutoff || r.ts > endCutoff) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return r.user.toLowerCase().includes(q) || String(r.amount).includes(q) ||
      (view === 'deposit' ? (r as DepositRequest).method : (r as WithdrawalRequest).destination).toLowerCase().includes(q);
  });

  const PERIODS: { key: typeof period; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
    { key: 'custom', label: 'Custom' },
  ];

  const pendingDep = deposits.filter((d) => d.status === 'pending' || d.status === 'processing').length;
  const pendingWd  = withdrawals.filter((w) => w.status === 'pending' || w.status === 'processing').length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-white">Deposit / Withdrawal Requests</h2>
        <p className="text-xs text-slate-500">Accept with UTR or reject with optional reason. Also visible in Finance.</p>
      </div>

      {/* Date/Period filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              period === p.key
                ? 'bg-neon-500/20 border border-neon-400/50 text-neon-300'
                : 'bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slatepanel-800 border border-borderline-900 rounded-lg px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-transparent text-xs text-white outline-none" />
          </div>
          <span className="text-slate-500 text-xs">to</span>
          <div className="flex items-center gap-1.5 bg-slatepanel-800 border border-borderline-900 rounded-lg px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-transparent text-xs text-white outline-none" />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setView('deposit')}
          className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 ${view === 'deposit' ? 'bg-emeraldwin-500/15 border-emeraldwin-500/40 text-emeraldwin-300' : 'bg-slatepanel-800 border-borderline-900 text-slate-400'}`}
        >
          <Banknote className="w-4 h-4" /> Deposits
          {pendingDep > 0 && <span className="chip text-[10px] bg-coral-500/20 text-coral-300">{pendingDep}</span>}
        </button>
        <button
          onClick={() => setView('withdrawal')}
          className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 ${view === 'withdrawal' ? 'bg-coral-500/15 border-coral-500/40 text-coral-300' : 'bg-slatepanel-800 border-borderline-900 text-slate-400'}`}
        >
          <TrendingDown className="w-4 h-4" /> Withdrawals
          {pendingWd > 0 && <span className="chip text-[10px] bg-coral-500/20 text-coral-300">{pendingWd}</span>}
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search user, amount, method..."
          className="input w-full py-2 pl-9 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-6 text-sm text-slate-500 text-center">No {view} requests.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const kind = view;
            const cfg = statusConfig(r.status);
            const Icon = cfg.icon;
            const isActing = acting?.id === r.id && acting?.kind === kind;
            const isTerminal = r.status === 'approved' || r.status === 'cancelled' || r.status === 'rejected';
            const dest = kind === 'deposit' ? (r as DepositRequest).method : (r as WithdrawalRequest).destination;
            return (
              <div key={r.id} className="panel p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm text-white font-semibold truncate">{r.user}</div>
                    <div className="text-[10px] text-slate-500 truncate">{dest} · {fmtDate(r.ts)}</div>
                  </div>
                  <div className="text-sm tabular font-bold text-white">{fmt(r.amount)}</div>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`chip text-[10px] flex items-center gap-1 ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                    <Icon className={`w-3 h-3 ${r.status === 'processing' ? 'animate-spin' : ''}`} /> {cfg.label}
                  </span>
                  {!isTerminal && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { setActing({ id: r.id, kind, mode: 'accept' }); setInput(''); }}
                        className="btn-emerald px-3 py-1.5 text-xs"
                      >Accept</button>
                      <button
                        onClick={() => { setActing({ id: r.id, kind, mode: 'reject' }); setInput(''); }}
                        className="btn-coral px-3 py-1.5 text-xs"
                      >Reject</button>
                    </div>
                  )}
                </div>

                {isActing && (
                  <div className="flex items-center gap-2 animate-fade-in">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={acting?.mode === 'accept' ? 'UTR / Transaction ID (required)' : 'Reason (optional)'}
                      className="input flex-1 text-xs py-2"
                      autoFocus
                    />
                    <button onClick={submit} className="btn-emerald px-3 py-2 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Save</button>
                    <button onClick={clear} className="btn-ghost px-2 py-2 text-xs"><XCircle className="w-3.5 h-3.5" /></button>
                  </div>
                )}

                {(r.utr || r.reason) && (
                  <div className="text-[11px] space-y-1">
                    {r.utr && (
                      <div className="text-emeraldwin-300 bg-emeraldwin-500/10 border border-emeraldwin-500/30 rounded-lg px-2 py-1 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> UTR: <span className="font-mono">{r.utr}</span>
                      </div>
                    )}
                    {r.reason && (
                      <div className="text-coral-300 bg-coral-500/10 border border-coral-500/30 rounded-lg px-2 py-1 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> {r.reason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
