import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Clock, CheckCircle2, XCircle, Loader2, FileText, Banknote, Calendar, Gift, Plus, Minus, Gamepad2 } from 'lucide-react';
import { cms, type DepositRequest, type WithdrawalRequest } from '../../lib/cms';
import { store } from '../../lib/store';
import { useFinance } from '../../lib/cmsHooks';

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusConfig(status: string) {
  switch (status) {
    case 'approved':
      return { label: 'Success', icon: CheckCircle2, color: 'text-emeraldwin-300', bg: 'bg-emeraldwin-500/15', border: 'border-emeraldwin-500/30' };
    case 'processing':
      return { label: 'Processing', icon: Loader2, color: 'text-amberx-300', bg: 'bg-amberx-500/15', border: 'border-amberx-500/30' };
    case 'cancelled':
      return { label: 'Cancelled', icon: XCircle, color: 'text-coral-300', bg: 'bg-coral-500/15', border: 'border-coral-500/30' };
    case 'rejected':
      return { label: 'Failed', icon: XCircle, color: 'text-coral-300', bg: 'bg-coral-500/15', border: 'border-coral-500/30' };
    default:
      return { label: 'Pending', icon: Clock, color: 'text-slate-300', bg: 'bg-slatepanel-800', border: 'border-borderline-900' };
  }
}

export default function FinanceTab() {
  const { deposits, withdrawals } = useFinance();
  const t = cms.totals();
  const [acting, setActing] = useState<{ id: string; kind: 'deposit' | 'withdrawal'; mode: 'approve' | 'cancel' } | null>(null);
  const [input, setInput] = useState('');

  const clear = () => { setActing(null); setInput(''); };

  const accept = (id: string, kind: 'deposit' | 'withdrawal') => {
    if (kind === 'deposit') cms.setDepositStatus(id, 'processing');
    else cms.setWithdrawalStatus(id, 'processing');
    cms.toast({ title: 'Request accepted', body: 'Moved to processing.', kind: 'info' });
  };

  const complete = () => {
    if (!acting) return;
    const { id, kind, mode } = acting;
    if (mode === 'approve') {
      if (kind === 'deposit') {
        cms.setDepositStatus(id, 'approved', input.trim() || undefined);
        const d = deposits.find(x => x.id === id);
        if (d) store.pushBalanceHistory({ userId: d.user, username: d.user, type: 'credit', amount: d.amount, reason: input.trim() ? `UTR: ${input.trim()}` : 'Deposit approved' });
      } else {
        cms.setWithdrawalStatus(id, 'approved', input.trim() || undefined);
        const w = withdrawals.find(x => x.id === id);
        if (w) store.pushBalanceHistory({ userId: w.user, username: w.user, type: 'debit', amount: w.amount, reason: input.trim() ? `UTR: ${input.trim()}` : 'Withdrawal approved' });
      }
      cms.toast({ title: 'Request approved', body: input.trim() ? `UTR/ID: ${input}` : 'Approved without reference.', kind: 'success' });
    } else {
      if (kind === 'deposit') cms.setDepositStatus(id, 'cancelled', undefined, input.trim() || undefined);
      else cms.setWithdrawalStatus(id, 'cancelled', undefined, input.trim() || undefined);
      cms.toast({ title: 'Request cancelled', body: input.trim() ? `Reason: ${input}` : 'Cancelled.', kind: 'warn' });
    }
    clear();
  };

  const Card = ({ label, value, icon: Icon, accent }: { label: string; value: string; icon: typeof DollarSign; accent: string }) => (
    <div className="panel p-4 overflow-hidden min-w-0">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold truncate">{label}</span>
        <Icon className={`w-4 h-4 flex-shrink-0 ${accent}`} />
      </div>
      <div className={`mt-2 font-display font-extrabold text-xl sm:text-2xl tabular ${accent} truncate`} title={value}>{value}</div>
    </div>
  );

  // Time period filter: 'day' | 'week' | 'month' | 'year' | 'custom'
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'custom'>('day');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const msMap: Record<string, number> = { day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 };
  const cutoff = useMemo(() => {
    if (period === 'custom' && fromDate) {
      return new Date(fromDate).getTime();
    }
    return Date.now() - (msMap[period] || 86400000);
  }, [period, fromDate]);
  const endCutoff = useMemo(() => {
    if (period === 'custom' && toDate) {
      return new Date(toDate).getTime() + 86400000; // end of day
    }
    return Date.now() + 86400000;
  }, [period, toDate]);

  const filteredDeposits = deposits.filter(d => d.ts >= cutoff && d.ts <= endCutoff);
  const filteredWithdrawals = withdrawals.filter(w => w.ts >= cutoff && w.ts <= endCutoff);
  const liveTotalDeposits = filteredDeposits.filter(d => d.status === 'approved').reduce((s, d) => s + d.amount, 0);
  const liveTotalWithdrawals = filteredWithdrawals.filter(w => w.status === 'approved').reduce((s, w) => s + w.amount, 0);
  const livePending = filteredDeposits.filter(d => d.status === 'pending' || d.status === 'processing').length + filteredWithdrawals.filter(w => w.status === 'pending' || w.status === 'processing').length;

  // ── Financial breakdown data (signup bonuses, manual adjustments, game profit) ──
  const signupBonusInPeriod = useMemo(() => {
    return store.signupBonusHistory
      .filter((r) => r.ts >= cutoff && r.ts <= endCutoff)
      .reduce((s, r) => s + r.amount, 0);
  }, [cutoff, endCutoff]);

  const { manualAdjustPositive, manualAdjustNegative } = useMemo(() => {
    // Manual adjustments = balance history entries whose reason does NOT come
    // from an automatic finance flow (deposits, withdrawals, signup bonus,
    // referral rewards, redeem codes or gameplay wins/losses).
    const AUTO = /(deposit|withdraw|utr|signup bonus|referral|redeem|promo|win|loss|bet|round|crash|mines|aviator|wingo|k3|fived|sun|moon|trading|ludo)/i;
    let pos = 0;
    let neg = 0;
    for (const r of store.balanceHistory) {
      if (r.ts < cutoff || r.ts > endCutoff) continue;
      if (AUTO.test(r.reason)) continue;
      if (r.type === 'credit') pos += r.amount;
      else neg += r.amount;
    }
    return { manualAdjustPositive: pos, manualAdjustNegative: neg };
  }, [cutoff, endCutoff]);

  const gameProfit = useMemo(() => {
    // House game profit = total stakes wagered − total credited back to players.
    return store.adminHistory
      .filter((r) => r.ts >= cutoff && r.ts <= endCutoff)
      .reduce((s, r) => s + (r.amount - r.win), 0);
  }, [cutoff, endCutoff]);

  const liveProfit = liveTotalDeposits - liveTotalWithdrawals + gameProfit + manualAdjustPositive - manualAdjustNegative - signupBonusInPeriod;

  const PERIODS: { key: typeof period; label: string }[] = [
    { key: 'day', label: '24H' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-white">Finance Dashboard</h2>
        <p className="text-xs text-slate-500">Live deposit, withdrawal and profit metrics.</p>
      </div>

      {/* Time filter bar */}
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

      {/* Custom date range */}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Deposits" value={fmt(liveTotalDeposits)} icon={TrendingUp} accent="text-emeraldwin-400" />
        <Card label="Withdrawals" value={fmt(liveTotalWithdrawals)} icon={TrendingDown} accent="text-coral-400" />
        <Card label="Profit" value={fmt(liveProfit)} accent={liveProfit >= 0 ? 'text-neon-300' : 'text-coral-400'} icon={DollarSign} />
        <Card label="Pending" value={String(livePending)} icon={Clock} accent="text-amberx-400" />
      </div>

      {/* Detailed financial breakdown — all values contained in UI boxes */}
      <div>
        <h3 className="font-display font-bold text-white text-sm mb-2">Financial Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Signup Bonuses" value={fmt(signupBonusInPeriod)} icon={Gift} accent="text-amberx-300" />
          <Card label="Manual Adjust +" value={fmt(manualAdjustPositive)} icon={Plus} accent="text-emeraldwin-300" />
          <Card label="Manual Adjust -" value={fmt(manualAdjustNegative)} icon={Minus} accent="text-coral-300" />
          <Card label="Game Profit" value={fmt(gameProfit)} icon={Gamepad2} accent={gameProfit >= 0 ? 'text-neon-300' : 'text-coral-400'} />
        </div>
      </div>


      <div className="space-y-3">
        <h3 className="font-display font-bold text-white flex items-center gap-2">
          <Banknote className="w-4 h-4 text-emeraldwin-400" /> Deposit Requests
        </h3>
        {filteredDeposits.length === 0 ? (
          <div className="panel p-4 text-sm text-slate-500 text-center">No deposits yet.</div>
        ) : (
          <div className="space-y-2">
            {filteredDeposits.map((d) => (
              <TxnRow key={d.id} t={d} kind="deposit" acting={acting} setActing={setActing} input={input} setInput={setInput} onAccept={accept} onComplete={complete} onClear={clear} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-display font-bold text-white flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-coral-400" /> Withdrawal Requests
        </h3>
        {filteredWithdrawals.length === 0 ? (
          <div className="panel p-4 text-sm text-slate-500 text-center">No withdrawals yet.</div>
        ) : (
          <div className="space-y-2">
            {filteredWithdrawals.map((w) => (
              <TxnRow key={w.id} t={w} kind="withdrawal" acting={acting} setActing={setActing} input={input} setInput={setInput} onAccept={accept} onComplete={complete} onClear={clear} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TxnRow({ t, kind, acting, setActing, input, setInput, onAccept, onComplete, onClear }: {
  t: DepositRequest | WithdrawalRequest;
  kind: 'deposit' | 'withdrawal';
  acting: { id: string; kind: 'deposit' | 'withdrawal'; mode: 'approve' | 'cancel' } | null;
  setActing: (a: { id: string; kind: 'deposit' | 'withdrawal'; mode: 'approve' | 'cancel' } | null) => void;
  input: string;
  setInput: (s: string) => void;
  onAccept: (id: string, kind: 'deposit' | 'withdrawal') => void;
  onComplete: () => void;
  onClear: () => void;
}) {
  const cfg = statusConfig(t.status);
  const Icon = cfg.icon;
  const isActing = acting?.id === t.id && acting?.kind === kind;
  const isTerminal = t.status === 'approved' || t.status === 'cancelled' || t.status === 'rejected';

  return (
    <div className="panel p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-white font-semibold truncate">{t.user}</div>
          <div className="text-[10px] text-slate-500 truncate">
            {kind === 'deposit' ? (t as DepositRequest).method : (t as WithdrawalRequest).destination} · {fmtDate(t.ts)}
          </div>
        </div>
        <div className="text-sm tabular font-bold text-white">{fmt(t.amount)}</div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={`chip text-[10px] flex items-center gap-1 ${cfg.bg} ${cfg.color} ${cfg.border}`}>
          <Icon className={`w-3 h-3 ${t.status === 'processing' ? 'animate-spin' : ''}`} /> {cfg.label}
        </span>
        {!isTerminal && (
          <div className="flex gap-1.5">
            {t.status === 'pending' && (
              <button onClick={() => onAccept(t.id, kind)} className="btn-emerald px-2 py-1.5 text-xs" title="Accept & process">Accept</button>
            )}
            {t.status === 'processing' && (
              <button onClick={() => { setActing({ id: t.id, kind, mode: 'approve' }); setInput(''); }} className="btn-primary px-2 py-1.5 text-xs" title="Approve with optional UTR">Approve</button>
            )}
            <button onClick={() => { setActing({ id: t.id, kind, mode: 'cancel' }); setInput(''); }} className="btn-coral px-2 py-1.5 text-xs" title="Cancel with optional reason">Cancel</button>
          </div>
        )}
      </div>

      {isActing && (
        <div className="flex items-center gap-2 animate-fade-in">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={acting?.mode === 'approve' ? 'Optional UTR / Transaction ID' : 'Optional reason'}
            className="input flex-1 text-xs py-2"
          />
          <button onClick={onComplete} className="btn-emerald px-3 py-2 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Save</button>
          <button onClick={onClear} className="btn-ghost px-2 py-2 text-xs"><XCircle className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {(t.utr || t.reason) && (
        <div className="text-[11px] space-y-1">
          {t.utr && (
            <div className="text-emeraldwin-300 bg-emeraldwin-500/10 border border-emeraldwin-500/30 rounded-lg px-2 py-1 flex items-center gap-1">
              <FileText className="w-3 h-3" /> UTR: <span className="font-mono">{t.utr}</span>
            </div>
          )}
          {t.reason && (
            <div className="text-coral-300 bg-coral-500/10 border border-coral-500/30 rounded-lg px-2 py-1 flex items-center gap-1">
              <XCircle className="w-3 h-3" /> {t.reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
