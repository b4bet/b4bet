import { useState } from 'react';
import { store } from '../../lib/store';
import { Search } from 'lucide-react';

export default function BalanceHistoryTab({ filterUserId }: { filterUserId?: string }) {
  const [q, setQ] = useState('');
  let history = store.getBalanceHistory({ search: q });
  if (filterUserId) {
    history = history.filter(h => h.userId === filterUserId);
  }

  return (
    <div className="space-y-4">
      <div><h2 className="font-display font-bold text-lg text-white">Balance Adjustment History</h2><p className="text-xs text-slate-500">All admin credits and debits with reasons.</p></div>
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by username…" className="input pl-10" /></div>
      <div className="panel overflow-hidden"><div className="overflow-x-auto scrollbar-thin max-h-96 overflow-y-auto">
        <table className="w-full text-sm"><thead className="bg-midnight-850 border-b border-borderline-900 sticky top-0">
          <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold"><th className="p-3">Date</th><th className="p-3">User</th><th className="p-3">Type</th><th className="p-3 text-right">Amount</th><th className="p-3">Reason</th></tr></thead>
          <tbody className="divide-y divide-borderline-900">
            {history.length === 0 ? (<tr><td colSpan={5} className="p-8 text-center text-slate-500 text-sm">No balance adjustments yet.</td></tr>) : (
              history.map((h) => (<tr key={h.id} className="hover:bg-slatepanel-800/50">
                <td className="p-3 text-[11px] text-slate-400 whitespace-nowrap">{new Date(h.ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="p-3 font-semibold text-white">{h.username}</td>
                <td className="p-3"><span className={`chip text-[10px] ${h.type === 'credit' ? 'bg-emeraldwin-500/15 border-emeraldwin-500/40 text-emeraldwin-400' : 'bg-coral-500/15 border-coral-500/40 text-coral-400'}`}>{h.type === 'credit' ? '+' : '−'} {store.currency}{h.amount.toFixed(2)}</span></td>
                <td className="p-3 text-right font-mono font-bold tabular text-sm text-slate-200">{store.currency}{h.amount.toFixed(2)}</td>
                <td className="p-3 text-[11px] text-slate-400 max-w-[200px] truncate">{h.reason}</td>
              </tr>))
            )}</tbody></table></div></div>
    </div>
  );
}
