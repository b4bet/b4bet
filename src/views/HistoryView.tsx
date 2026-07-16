import { useMemo } from 'react';
import { X, ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { Route } from '../components/BottomNav';
import { useAuth } from '../lib/hooks';
import { useFinance } from '../lib/cmsHooks';
import { store } from '../lib/store';

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

export default function HistoryView({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const session = useAuth();
  const { deposits, withdrawals } = useFinance();
  const user = session?.username ?? 'guest';

  const items = useMemo(() => {
    const d = deposits
      .filter((t) => t.user === user)
      .map((t) => ({ ...t, type: 'deposit' as const, sign: '+' as const }));
    const w = withdrawals
      .filter((t) => t.user === user)
      .map((t) => ({ ...t, type: 'withdrawal' as const, sign: '-' as const }));
    return [...d, ...w].sort((a, b) => b.ts - a.ts);
  }, [deposits, withdrawals, user]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display font-extrabold text-xl text-white">History</h1>
          <p className="text-xs text-slate-500">Deposits & withdrawals</p>
        </div>
        <button onClick={() => onNavigate('home')} className="md:hidden w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center">
          <X className="w-5 h-5 text-slate-300" />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="panel p-6 text-center text-sm text-slate-500">No transactions yet.</div>
      ) : (
        <div className="panel p-4 space-y-3">
          {items.map((t) => {
            const cfg = statusConfig(t.status);
            const Icon = cfg.icon;
            return (
              <div key={`${t.type}-${t.id}`} className="rounded-xl bg-midnight-850 border border-borderline-900 p-3 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${cfg.bg} ${cfg.border} border grid place-items-center flex-shrink-0`}>
                  {t.type === 'deposit' ? (
                    <ArrowDownLeft className="w-5 h-5 text-emeraldwin-400" />
                  ) : (
                    <ArrowUpRight className="w-5 h-5 text-coral-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white capitalize">{t.type}</span>
                    <span className={`tabular font-bold text-sm ${t.type === 'deposit' ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                      {t.sign}{fmt(t.amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                    <span>{fmtDate(t.ts)}</span>
                    <span className={`chip text-[10px] flex items-center gap-1 ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                      <Icon className={`w-3 h-3 ${t.status === 'processing' ? 'animate-spin' : ''}`} /> {cfg.label}
                    </span>
                  </div>
                  {(t.reason || t.utr) && (
                    <div className="text-[11px] text-slate-500 mt-1">
                      {t.utr && <span className="block">UTR: {t.utr}</span>}
                      {t.reason && <span className="block">{t.reason}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
