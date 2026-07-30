import { useMemo, useEffect } from 'react';
import { X, ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/hooks';
import { useFinance } from '../lib/cmsHooks';

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusConfig(status: string) {
  switch (status) {
    case 'approved':
      return { label: 'Success', icon: CheckCircle2, color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' };
    case 'processing':
      return { label: 'Processing', icon: Loader2, color: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-500/30' };
    case 'cancelled':
      return { label: 'Cancelled', icon: XCircle, color: 'text-orange-300', bg: 'bg-orange-500/15', border: 'border-orange-500/30' };
    case 'rejected':
      return { label: 'Failed', icon: XCircle, color: 'text-red-300', bg: 'bg-red-500/15', border: 'border-red-500/30' };
    default:
      return { label: 'Pending', icon: Clock, color: 'text-slate-300', bg: 'bg-slate-800', border: 'border-slate-700' };
  }
}

export default function HistoryView({ onClose }: { onClose: () => void }) {
  const session = useAuth();
  const { deposits, withdrawals } = useFinance();
  const user = session?.username ?? 'guest';

  // Mobile back button support — go back to menu (ProfileDrawer)
  useEffect(() => {
    window.history.pushState({ historyView: true }, '');
    const handlePopstate = () => { onClose(); };
    window.addEventListener('popstate', handlePopstate);
    return () => { window.removeEventListener('popstate', handlePopstate); };
  }, [onClose]);

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
    <div className="min-h-screen bg-slatebg-950 text-white">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <h2 className="font-display font-bold text-lg text-white">History</h2>
        <button onClick={onClose} className="md:hidden w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center">
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-10">No transactions yet.</p>
      ) : (
        <div className="px-4 pb-6 space-y-3">
          {items.map((t) => {
            const cfg = statusConfig(t.status);
            const Icon = cfg.icon;
            return (
              <div key={t.id} className="bg-slatepanel-800 border border-borderline-900 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${
                      t.type === 'deposit' ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-red-500/15 border border-red-500/30'
                    }`}>
                      {t.type === 'deposit' ? (
                        <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white capitalize">{t.type}</p>
                      <p className="text-[10px] text-slate-500">{fmtDate(t.ts)}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${
                    t.type === 'deposit' ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {t.sign}{fmt(t.amount)}
                  </span>
                </div>

                {/* Status badge */}
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                    <Icon className={`w-3 h-3 ${t.status === 'processing' ? 'animate-spin' : ''}`} />
                    {cfg.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
