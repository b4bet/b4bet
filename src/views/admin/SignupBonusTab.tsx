import { useMemo, useState } from 'react';
import { Gift, Save, Search, Calendar } from 'lucide-react';
import { store, type SignupBonusRecord } from '../../lib/store';
import { useBus } from '../../lib/hooks';
import { Topics } from '../../lib/bus';
import SelectModal from '../../components/SelectModal';

type Period = 'today' | 'day' | 'week' | 'month' | 'year' | 'all';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'day', label: 'Last 24h' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
];

export default function SignupBonusTab() {
  useBus<{ amount: number; history: SignupBonusRecord[] }>(Topics.SignupBonus, {
    amount: store.signupBonus,
    history: store.signupBonusHistory,
  });

  const [amount, setAmount] = useState<string>(String(store.signupBonus));
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('all');

  const rows = useMemo(
    () => store.getSignupBonusHistory({ search, period }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, period, store.signupBonusHistory.length]
  );

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return { total, count: rows.length };
  }, [rows]);

  const save = () => {
    const n = Math.max(0, Number(amount) || 0);
    store.setSignupBonus(n);
    setAmount(String(n));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
          <Gift className="w-5 h-5 text-emeraldwin-400" /> Signup Bonus
        </h2>
        <p className="text-xs text-slate-500">
          Every new user gets this amount credited instantly on registration. Set 0 to disable.
        </p>
      </div>

      {/* Config */}
      <div className="panel p-4 space-y-3">
        <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
          Bonus amount ({store.currency})
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input flex-1"
            placeholder="e.g. 100"
          />
          <button onClick={save} className="btn-emerald px-4 flex items-center gap-2 font-bold">
            <Save className="w-4 h-4" /> Save
          </button>
        </div>
        {saved && <p className="text-xs text-emeraldwin-400">Saved. New signups will receive {store.currency}{store.signupBonus}.</p>}
        <p className="text-[11px] text-slate-500">
          Current active bonus: <span className="text-white font-bold">{store.currency}{store.signupBonus}</span>
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="panel p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Bonuses granted</div>
          <div className="font-display font-extrabold text-lg tabular text-white">{totals.count}</div>
        </div>
        <div className="panel p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total credited</div>
          <div className="font-display font-extrabold text-lg tabular text-emeraldwin-400">
            {store.currency}{totals.total.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by username or user ID…"
            className="input pl-10 w-full"
          />
        </div>
        <div className="flex items-center gap-2 bg-slatepanel-800 border border-borderline-900 rounded-xl px-3 py-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <SelectModal
            value={period}
            options={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
            onChange={(v) => setPeriod(v as Period)}
            placeholder="Period"
            className="bg-transparent text-sm text-white outline-none border-0"
          />
        </div>
      </div>

      {/* History table */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-midnight-850 border-b border-borderline-900 sticky top-0">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="p-3">Date</th>
                <th className="p-3">User</th>
                <th className="p-3">User ID</th>
                <th className="p-3 text-right">Bonus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline-900">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-500 text-sm">
                    No signup bonuses granted in this range.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slatepanel-800/50">
                    <td className="p-3 text-slate-400 text-xs whitespace-nowrap">{fmtDate(r.ts)}</td>
                    <td className="p-3 font-semibold text-white">{r.username}</td>
                    <td className="p-3 font-mono text-[11px] text-neon-200 tabular">#{r.userId}</td>
                    <td className="p-3 text-right tabular font-bold text-emeraldwin-400">
                      +{store.currency}{r.amount.toLocaleString('en-IN')}
                    </td>
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
