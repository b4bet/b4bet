import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { Search, RefreshCw, Wifi } from 'lucide-react';

interface BalanceRecord {
  id: string;
  user_id: string;
  username: string;
  type: string;
  amount: number;
  reference: string;
  created_at: string;
}

export default function BalanceHistoryTab({ filterUserId }: { filterUserId?: string }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<BalanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_balance_history', { p_limit: 500 });
      if (error) throw error;
      setRows((data ?? []) as BalanceRecord[]);
    } catch (e) {
      console.error('[BalanceHistoryTab] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  let history = rows.filter(h => {
    if (filterUserId && h.user_id !== filterUserId) return false;
    if (q) {
      const s = q.toLowerCase();
      return h.username.toLowerCase().includes(s) || h.user_id.includes(s);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white">Balance Adjustment History</h2>
          <p className="text-xs text-slate-500">Live from Supabase — all admin credits, debits and bonuses.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emeraldwin-300 bg-emeraldwin-500/10 border border-emeraldwin-500/20 px-2 py-0.5 rounded-full">
            <Wifi className="w-2.5 h-2.5" /> Live
          </span>
          <button onClick={() => void load()} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white text-xs font-semibold disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by username…" className="input pl-10" />
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-midnight-850 border-b border-borderline-900 sticky top-0">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="p-3">Date</th>
                <th className="p-3">User</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline-900">
              {loading ? (
                <tr><td colSpan={5} className="p-6 text-center text-slate-500 text-sm">
                  <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />Loading from Supabase…
                </td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500 text-sm">
                  No balance adjustments found.
                </td></tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id} className="hover:bg-slatepanel-800/50">
                    <td className="p-3 text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(h.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 font-semibold text-white">{h.username}</td>
                    <td className="p-3">
                      <span className={`chip text-[10px] ${
                        h.type === 'credit' || h.type === 'bonus'
                          ? 'bg-emeraldwin-500/15 border-emeraldwin-500/40 text-emeraldwin-400'
                          : 'bg-coral-500/15 border-coral-500/40 text-coral-400'
                      }`}>
                        {h.type === 'credit' || h.type === 'bonus' ? '+' : '−'} {h.type}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold tabular text-sm text-slate-200">
                      ₹{h.amount.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-[11px] text-slate-400 max-w-[200px] truncate">{h.reference || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
