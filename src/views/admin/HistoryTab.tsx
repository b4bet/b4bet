import { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { Search, History, Filter, Calendar, RefreshCw, Wifi } from 'lucide-react';
import SelectModal from '../../components/SelectModal';

const GAMES = [
  { key: 'all', label: 'All Games' },
  { key: 'crash', label: 'Crash' },
  { key: 'mines', label: 'Mines' },
  { key: 'wingo', label: 'Wingo' },
  { key: 'k3', label: 'K3' },
  { key: 'fived', label: '5D' },
  { key: 'sunvsmoon', label: 'Sun vs Moon' },
  { key: 'trading', label: 'Trading' },
] as const;

type GameKey = typeof GAMES[number]['key'];

const PERIODS = [
  { key: 'all', label: 'All Time' },
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
] as const;

type PeriodKey = typeof PERIODS[number]['key'];

interface BetRecord {
  id: string;
  user_id: string;
  username: string;
  game_name: string;
  bet_amount: number;
  win_amount: number;
  multiplier: number;
  status: string;
  placed_at: string;
  bet_details: Record<string, unknown>;
}

const gameLabel = (g: string) => GAMES.find((x) => x.key === g)?.label ?? g;

export default function HistoryTab() {
  const [game, setGame] = useState<GameKey>('all');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [rows, setRows] = useState<BetRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_bet_history', { p_limit: 500 });
      if (error) throw error;
      setRows((data ?? []) as BetRecord[]);
    } catch (e) {
      console.error('[HistoryTab] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Supabase Realtime — refresh on new bets
  useEffect(() => {
    const channel = supabase
      .channel('history_tab_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => {
        void load();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const filtered = useMemo(() => {
    let data = [...rows];
    if (game !== 'all') data = data.filter(r => r.game_name === game);
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(r => r.username.toLowerCase().includes(s) || r.user_id.includes(s));
    }
    if (period !== 'all') {
      const now = Date.now();
      const ms: Record<string, number> = { day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 };
      if (period === 'day') {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        data = data.filter(r => new Date(r.placed_at).getTime() >= start.getTime());
      } else {
        data = data.filter(r => now - new Date(r.placed_at).getTime() <= ms[period]);
      }
    }
    return data;
  }, [rows, game, search, period]);

  const totals = useMemo(() => ({
    totalBet: filtered.reduce((s, r) => s + r.bet_amount, 0),
    totalWin: filtered.reduce((s, r) => s + r.win_amount, 0),
    count: filtered.length,
  }), [filtered]);

  const fmtDate = (ts: string) => new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
            <History className="w-5 h-5 text-neon-300" /> Bet History
          </h2>
          <p className="text-xs text-slate-500">Live from Supabase — all user bets across all games.</p>
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
          <div className={`font-display font-extrabold text-lg tabular ${totals.totalBet - totals.totalWin >= 0 ? 'text-neon-300' : 'text-coral-400'}`}>
            ₹{(totals.totalBet - totals.totalWin).toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by username or User ID…"
            className="input pl-10 w-full"
          />
        </div>
        <div className="flex items-center gap-2 bg-slatepanel-800 border border-borderline-900 rounded-xl px-3 py-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <SelectModal
            value={game}
            options={GAMES.map((g) => ({ value: g.key, label: g.label }))}
            onChange={(v) => setGame(v as GameKey)}
            placeholder="All Games"
            className="bg-transparent text-sm text-white outline-none border-0"
          />
        </div>
        <div className="flex items-center gap-2 bg-slatepanel-800 border border-borderline-900 rounded-xl px-3 py-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <SelectModal
            value={period}
            options={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
            onChange={(v) => setPeriod(v as PeriodKey)}
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
                <th className="p-3">Game</th>
                <th className="p-3">Result</th>
                <th className="p-3 text-right">Bet</th>
                <th className="p-3 text-right">Win</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline-900">
              {loading ? (
                <tr><td colSpan={6} className="p-6 text-center text-slate-500 text-sm">
                  <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />Loading from Supabase…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-slate-500 text-sm">
                  No history matches the current filters.
                </td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slatepanel-800/50">
                    <td className="p-3 text-slate-400 text-xs whitespace-nowrap">{fmtDate(r.placed_at)}</td>
                    <td className="p-3 font-semibold text-white">{r.username}</td>
                    <td className="p-3"><span className="chip bg-slatepanel-800 text-slate-300 text-[10px]">{gameLabel(r.game_name)}</span></td>
                    <td className="p-3 text-slate-300 text-xs">{r.status} {r.multiplier > 1 ? `· ${r.multiplier.toFixed(2)}x` : ''}</td>
                    <td className="p-3 text-right tabular font-semibold text-slate-300">₹{r.bet_amount.toLocaleString('en-IN')}</td>
                    <td className={`p-3 text-right tabular font-semibold ${r.win_amount > 0 ? 'text-emeraldwin-400' : 'text-coral-400'}`}>₹{r.win_amount.toLocaleString('en-IN')}</td>
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
