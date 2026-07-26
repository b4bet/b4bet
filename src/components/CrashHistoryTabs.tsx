/**
 * CrashHistoryTabs — All Bets shows real crash bets from Supabase (live + historical).
 * Crash bets are identified by having `bustPoint` in bet_details and NO `game` key.
 * Strategy: fetch 500 rows, deduplicate to ONE latest bet per user, so all active
 * players always appear regardless of how many bets one user has placed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCrashMyBets, useCrashState } from '../lib/hooks';
import { store } from '../lib/store';
import { supabase } from '../integrations/supabase/client';

type Tab = 'all' | 'mine' | 'top';
type Range = 'day' | 'week' | 'month' | 'year';

const RANGE_MS: Record<Range, number> = {
  day:   86_400_000,
  week:  7 * 86_400_000,
  month: 30 * 86_400_000,
  year:  365 * 86_400_000,
};

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface RealBet {
  id: string;
  user: string;
  stake: number;
  multiplier: number | null;
  cashOutAt: number | null;
  win: number;
  ts: number;
  status: string;
}

type BetRow = {
  id: string;
  user_id: string;
  bet_amount: number;
  win_amount: number | null;
  multiplier: number | null;
  placed_at: string | null;
  status: string;
  bet_details: { bustPoint?: number; cashOutAt?: number | null; game?: string } | null;
  profiles: { username: string | null; display_name: string | null } | null;
};

export default function CrashHistoryTabs() {
  const [tab, setTab] = useState<Tab>('all');
  const [range, setRange] = useState<Range>('day');
  const mine = useCrashMyBets();
  const crashState = useCrashState();

  const [allBets, setAllBets] = useState<RealBet[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchBets = async () => {
    setLoadingAll(true);
    try {
      // Fetch 500 rows then deduplicate to ONE latest bet per user.
      // This ensures all players who have ever bet appear — even if one
      // active user has hundreds of bets that would otherwise push others out.
      const { data, error } = await supabase
        .from('bets')
        .select('id, user_id, bet_amount, win_amount, multiplier, placed_at, status, bet_details, profiles(username, display_name)')
        .not('bet_details->bustPoint', 'is', null)
        .is('bet_details->game', null)
        .order('placed_at', { ascending: false })
        .limit(500);

      if (error) {
        console.error('CrashHistoryTabs fetchBets error:', error.message);
        setLoadingAll(false);
        return;
      }

      // Keep only the latest bet per user (data is already newest-first)
      const seenUsers = new Set<string>();
      const deduped: BetRow[] = [];
      for (const row of ((data ?? []) as BetRow[])) {
        if (!seenUsers.has(row.user_id)) {
          seenUsers.add(row.user_id);
          deduped.push(row);
        }
      }

      const rows: RealBet[] = deduped.map((b) => ({
        id: b.id,
        user: b.profiles?.display_name ?? b.profiles?.username ?? (b.user_id.slice(0, 6) + '…'),
        stake: Number(b.bet_amount),
        multiplier: b.multiplier != null ? Number(b.multiplier) : null,
        cashOutAt: b.bet_details?.cashOutAt != null ? Number(b.bet_details.cashOutAt) : null,
        win: Number(b.win_amount ?? 0),
        ts: b.placed_at ? new Date(b.placed_at).getTime() : Date.now(),
        status: b.status ?? 'unknown',
      }));

      setAllBets(rows);
    } catch (e) {
      console.error('CrashHistoryTabs unexpected error:', e);
    }
    setLoadingAll(false);
  };

  useEffect(() => {
    if (tab !== 'all') return;

    void fetchBets();

    // Realtime — refresh on any bet change
    const ch = supabase
      .channel('crash_bets_live_v3')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bets' },
        () => { void fetchBets(); },
      )
      .subscribe();

    channelRef.current = ch;

    return () => {
      void supabase.removeChannel(ch);
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Refresh when crash round changes
  const prevRoundId = useRef(crashState.roundId);
  useEffect(() => {
    if (crashState.roundId !== prevRoundId.current) {
      prevRoundId.current = crashState.roundId;
      if (tab === 'all') void fetchBets();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crashState.roundId, tab]);

  const topRows = useMemo(() => {
    const cutoff = Date.now() - RANGE_MS[range];
    const data = store.crashLeaderboard || [];
    return data
      .filter((r) => r.ts >= cutoff)
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, 10);
  }, [range, tab]);

  return (
    <div className="panel p-3 space-y-2">
      {/* Primary tabs */}
      <div className="grid grid-cols-3 gap-1.5">
        {(['all', 'mine', 'top'] as Tab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={[
              'py-1.5 rounded-lg text-xs font-bold capitalize transition-all border',
              tab === k
                ? 'bg-slatepanel-700 border-slate-500 text-white'
                : 'bg-slatepanel-800 border-borderline-900 text-slate-400',
            ].join(' ')}
          >
            {k === 'all' ? 'All Bets' : k === 'mine' ? 'My Bets' : 'Top'}
          </button>
        ))}
      </div>

      {/* Time-range chips — only for Top tab */}
      {tab === 'top' && (
        <div className="grid grid-cols-4 gap-1.5">
          {(['day', 'week', 'month', 'year'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={[
                'py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all',
                range === r
                  ? 'bg-neon-500/20 border border-neon-400/50 text-neon-300'
                  : 'bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white',
              ].join(' ')}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="max-h-72 overflow-y-auto scrollbar-thin overflow-x-auto">

        {/* ── ALL BETS — one latest bet per user ── */}
        {tab === 'all' && (
          <table className="w-full text-[11px]">
            <thead className="text-slate-500 uppercase tracking-wider sticky top-0 bg-slatepanel-900">
              <tr>
                <th className="text-left  py-1.5 px-1" style={{ minWidth: '5rem' }}>Player</th>
                <th className="text-right py-1.5 px-1" style={{ minWidth: '3.5rem' }}>Stake</th>
                <th className="text-right py-1.5 px-1" style={{ minWidth: '2.5rem' }}>×</th>
                <th className="text-right py-1.5 px-1" style={{ minWidth: '3.5rem' }}>Win</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {loadingAll && (
                <tr><td colSpan={4} className="py-4 text-center text-slate-500">Loading…</td></tr>
              )}
              {!loadingAll && allBets.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-slate-500">No bets yet.</td></tr>
              )}
              {allBets.map((b) => (
                <tr key={b.id} className="border-t border-borderline-900/60">
                  <td className="py-1.5 px-1 text-slate-200 font-semibold truncate max-w-[5rem]">{b.user}</td>
                  <td className="px-1 text-right text-slate-300">{store.currency}{b.stake}</td>
                  <td className={`px-1 text-right font-bold ${
                    b.status === 'pending'
                      ? 'text-yellow-400'
                      : b.cashOutAt != null
                        ? 'text-emeraldwin-400'
                        : 'text-coral-400'
                  }`}>
                    {b.status === 'pending'
                      ? <span className="animate-pulse">Live</span>
                      : b.cashOutAt != null
                        ? `${b.cashOutAt.toFixed(2)}×`
                        : b.multiplier != null
                          ? `${b.multiplier.toFixed(2)}×`
                          : '—'
                    }
                  </td>
                  <td className="px-1 text-right text-white font-semibold">
                    {b.win > 0 ? `${store.currency}${b.win.toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── MY BETS ── */}
        {tab === 'mine' && (
          <table className="w-full text-[11px]">
            <thead className="text-slate-500 uppercase tracking-wider sticky top-0 bg-slatepanel-900">
              <tr>
                <th className="text-left  py-1.5 px-1" style={{ minWidth: '3rem'  }}>Time</th>
                <th className="text-right py-1.5 px-1" style={{ minWidth: '3.5rem' }}>Stake</th>
                <th className="text-right py-1.5 px-1" style={{ minWidth: '2.5rem' }}>×</th>
                <th className="text-right py-1.5 px-1" style={{ minWidth: '3.5rem' }}>Win</th>
                <th className="text-right py-1.5 px-1 whitespace-nowrap" style={{ minWidth: '4rem' }}>Net P/L</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {mine.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-slate-500">No bets yet.</td></tr>
              )}
              {mine.map((b) => {
                const netpl = (b.win ?? 0) - (b.amount ?? 0);
                return (
                  <tr key={b.id} className="border-t border-borderline-900/60">
                    <td className="py-1.5 px-1 text-slate-500">{fmtTime(b.ts)}</td>
                    <td className="px-1 text-right text-slate-300">{store.currency}{b.amount}</td>
                    <td className={`px-1 text-right font-bold ${b.win > 0 ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                      {b.cashOutAt ? `${b.cashOutAt.toFixed(2)}×` : '—'}
                    </td>
                    <td className={`px-1 text-right font-semibold ${b.win > 0 ? 'text-emeraldwin-300' : 'text-slate-500'}`}>
                      {b.win > 0 ? `${store.currency}${b.win.toFixed(2)}` : '—'}
                    </td>
                    <td
                      className={`px-1 text-right font-bold whitespace-nowrap ${netpl >= 0 ? 'text-emeraldwin-400' : 'text-coral-400'}`}
                    >
                      {netpl >= 0 ? '+' : ''}{store.currency}{netpl.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* ── TOP PLAYERS ── */}
        {tab === 'top' && (
          <table className="w-full text-[11px]">
            <thead className="text-slate-500 uppercase tracking-wider sticky top-0 bg-slatepanel-900">
              <tr>
                <th className="text-left  py-1.5 px-1" style={{ minWidth: '1.5rem' }}>#</th>
                <th className="text-left  py-1.5 px-1" style={{ minWidth: '5rem'  }}>Player</th>
                <th className="text-right py-1.5 px-1" style={{ minWidth: '4rem'  }}>Earnings</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {topRows.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-slate-500">No data in range.</td></tr>
              )}
              {topRows.map((r, i) => (
                <tr key={i} className="border-t border-borderline-900/60">
                  <td className="py-1.5 px-1 text-slate-500">{i + 1}</td>
                  <td className="px-1 text-slate-200 font-semibold">{r.user}</td>
                  <td className="px-1 text-right text-emeraldwin-300 font-bold">{store.currency}{r.earnings.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
