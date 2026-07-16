import { useState, useMemo } from 'react';
import { store, type AdminHistoryRecord, type AdminHistoryGame } from '../../lib/store';
import { useBus } from '../../lib/hooks';
import { Topics } from '../../lib/bus';
import { Search, History, Filter, Calendar } from 'lucide-react';
import SelectModal from '../../components/SelectModal';

const GAMES: { key: AdminHistoryGame | 'all'; label: string }[] = [
  { key: 'all', label: 'All Games' },
  { key: 'crash', label: 'Crash' },
  { key: 'mines', label: 'Mines' },
  { key: 'wingo', label: 'Wingo' },
  { key: 'k3', label: 'K3' },
  { key: 'fived', label: '5D' },
  { key: 'sunvsmoon', label: 'Sun vs Moon' },
  { key: 'trading', label: 'Trading' },
];

const PERIODS: { key: 'all' | 'day' | 'week' | 'month' | 'year'; label: string }[] = [
  { key: 'all', label: 'All Time' },
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
];

const gameLabel = (g: AdminHistoryGame) => GAMES.find((x) => x.key === g)?.label ?? g;

export default function HistoryTab() {
  const [game, setGame] = useState<AdminHistoryGame | 'all'>('all');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<'all' | 'day' | 'week' | 'month' | 'year'>('all');
  const history = useBus<AdminHistoryRecord[]>(Topics.AdminHistory, store.adminHistory);

  const rows = useMemo(
    () => store.getAdminHistory({ game, search, period }),
    [history, game, search, period]
  );

  const totals = useMemo(() => {
    const totalBet = rows.reduce((sum, r) => sum + r.amount, 0);
    const totalWin = rows.reduce((sum, r) => sum + r.win, 0);
    return { totalBet, totalWin, count: rows.length };
  }, [rows]);

  const fmtDate = (ts: number) => new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
          <History className="w-5 h-5 text-neon-300" /> Bet History
        </h2>
        <p className="text-xs text-slate-500">Game-wise records across all users with date filters.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="panel p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Records</div>
          <div className="font-display font-extrabold text-lg tabular text-white">{totals.count}</div>
        </div>
        <div className="panel p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total Bet</div>
          <div className="font-display font-extrabold text-lg tabular text-slate-300">₹{totals.totalBet.toLocaleString('en-IN')}</div>
        </div>
        <div className="panel p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total Win</div>
          <div className="font-display font-extrabold text-lg tabular text-emeraldwin-400">₹{totals.totalWin.toLocaleString('en-IN')}</div>
        </div>
        <div className="panel p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Net</div>
          <div className={`font-display font-extrabold text-lg tabular ${totals.totalWin - totals.totalBet >= 0 ? 'text-neon-300' : 'text-coral-400'}`}>
            ₹{(totals.totalWin - totals.totalBet).toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by User ID or username…"
            className="input pl-10 w-full"
          />
        </div>
        <div className="flex items-center gap-2 bg-slatepanel-800 border border-borderline-900 rounded-xl px-3 py-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <SelectModal
            value={game}
            options={GAMES.map((g) => ({ value: g.key, label: g.label }))}
            onChange={(v) => setGame(v as AdminHistoryGame | 'all')}
            placeholder="All Games"
            className="bg-transparent text-sm text-white outline-none border-0"
          />
        </div>
        <div className="flex items-center gap-2 bg-slatepanel-800 border border-borderline-900 rounded-xl px-3 py-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <SelectModal
            value={period}
            options={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
            onChange={(v) => setPeriod(v as typeof period)}
            placeholder="All Time"
            className="bg-transparent text-sm text-white outline-none border-0"
          />
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-midnight-850 border-b border-borderline-900">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="p-3">Time</th>
                <th className="p-3">User</th>
                <th className="p-3">User ID</th>
                <th className="p-3">Game</th>
                <th className="p-3">Result</th>
                <th className="p-3 text-right">Bet</th>
                <th className="p-3 text-right">Win</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline-900">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500 text-sm">
                    No history matches the current filters.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slatepanel-800/50">
                    <td className="p-3 text-slate-400 text-xs whitespace-nowrap">{fmtDate(r.ts)}</td>
                    <td className="p-3 font-semibold text-white">{r.username}</td>
                    <td className="p-3 font-mono text-[11px] text-neon-200 tabular">#{r.userId}</td>
                    <td className="p-3"><span className="chip bg-slatepanel-800 text-slate-300 text-[10px]">{gameLabel(r.game)}</span></td>
                    <td className="p-3 text-slate-300 text-xs">{r.result}</td>
                    <td className="p-3 text-right tabular font-semibold text-slate-300">₹{r.amount.toLocaleString('en-IN')}</td>
                    <td className={`p-3 text-right tabular font-semibold ${r.win > 0 ? 'text-emeraldwin-400' : 'text-coral-400'}`}>₹{r.win.toLocaleString('en-IN')}</td>
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
