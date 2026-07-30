import { useState, useEffect, useCallback } from 'react';
import { X, ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../lib/hooks';

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function mapStatus(status: string): 'approved' | 'processing' | 'cancelled' | 'rejected' | 'pending' {
  if (status === 'approved' || status === 'completed') return 'approved';
  if (status === 'processing') return 'processing';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'rejected' || status === 'failed') return 'rejected';
  return 'pending';
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

interface TxRow {
  id: string;
  type: 'deposit' | 'withdrawal';
  sign: '+' | '-';
  amount: number;
  status: string;
  ts: number;
  method?: string;
}

export default function HistoryView({ onClose }: { onClose: () => void }) {
  const session = useAuth();
  const [items, setItems] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_transactions', { p_limit: 200 });
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string;
        type: string;
        amount: number;
        status: string;
        metadata: Record<string, unknown>;
        created_at: string;
      }>;
      const mapped: TxRow[] = rows
        .filter(r => r.type === 'deposit' || r.type === 'withdrawal')
        .map(r => ({
          id: r.id,
          type: r.type as 'deposit' | 'withdrawal',
          sign: r.type === 'deposit' ? '+' as const : '-' as const,
          amount: r.amount,
          status: mapStatus(r.status),
          ts: new Date(r.created_at).getTime(),
          method: (r.metadata?.method as string) || (r.metadata?.destination as string) || undefined,
        }));
      setItems(mapped);
    } catch (e) {
      console.error('[HistoryView] load error:', e);
      // Fallback: try direct table query with user_id filter
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setItems([]); return; }
        const { data: fallback } = await supabase
          .from('transactions')
          .select('id, type, amount, status, metadata, created_at')
          .eq('user_id', user.id)
          .in('type', ['deposit', 'withdrawal'])
          .order('created_at', { ascending: false })
          .limit(200);
        const rows2 = (fallback ?? []) as Array<{
          id: string; type: string; amount: number; status: string;
          metadata: Record<string, unknown>; created_at: string;
        }>;
        setItems(rows2.map(r => ({
          id: r.id,
          type: r.type as 'deposit' | 'withdrawal',
          sign: r.type === 'deposit' ? '+' as const : '-' as const,
          amount: r.amount,
          status: mapStatus(r.status),
          ts: new Date(r.created_at).getTime(),
          method: (r.metadata?.method as string) || (r.metadata?.destination as string) || undefined,
        })));
      } catch {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Realtime updates — refresh on transaction changes
  useEffect(() => {
    const channel = supabase
      .channel('history_view_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        void load();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  // Mobile back button support — go back to menu (ProfileDrawer)
  useEffect(() => {
    window.history.pushState({ historyView: true }, '');
    const handlePopstate = () => { onClose(); };
    window.addEventListener('popstate', handlePopstate);
    return () => { window.removeEventListener('popstate', handlePopstate); };
  }, [onClose]);

  // Suppress unused warning – session is kept for potential future use
  void session;

  return (
    <div className="min-h-screen bg-slatebg-950 text-white">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <h2 className="font-display font-bold text-lg text-white">History</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="w-8 h-8 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onClose} className="md:hidden w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-neon-400 animate-spin" />
        </div>
      ) : items.length === 0 ? (
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
                      <p className="text-xs font-semibold text-white capitalize">
                        {t.type}{t.method ? ` · ${t.method}` : ''}
                      </p>
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
