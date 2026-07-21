/**
 * CrashHistoryTabs — All Bets shows real bets from Supabase (no fake players).
 * My Bets shows the current user's own crash bets.
 * Top shows the leaderboard seeded from the store.
 */
import { useEffect, useMemo, useState } from 'react';
import { useCrashMyBets } from '../lib/hooks';
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
  win: number;
  ts: number;
}

const CRASH_GAME_ID = 'ee8ae2ab-d62c-4378-a377-55b3f7be4b3e';

export default function CrashHistoryTabs() {
  const [tab, setTab] = useState<Tab>('all');
  const [range, setRange] = useState<Range>('day');
  const mine = useCrashMyBets();

  // Real bets from Supabase
  const [allBets, setAllBets] = useState<RealBet[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  useEffect(() => {
    if (tab !== 'all') return;
    setLoadingAll(true);
    supabase
      .from('bets')
      .select('id, user_id, bet_amount, win_amount, multiplier, placed_at, profiles(username)')
      .eq('game_id', CRASH_GAME_ID)
      .order('placed_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (data) {
          const rows: RealBet[] = (data as Array<{
            id: string;
            user_id: string;
            bet_amount: number;
            win_amount: number | null;
            multiplier: number | null;
            placed_at: string | null;
            profiles: { username: string } | null;
          }>).map((b) => ({
            id: b.id,
            user: b.profiles?.username ?? b.user_id.slice(0, 8) + '…',
            stake: Number(b.bet_amount),
            multiplier: b.multiplier != null ? Number(b.multiplier) : null,
            win: Number(b.win_amount ?? 0),
            ts: b.placed_at ? new Date(b.placed_at).getTime() : Date.now(),
          }));
          setAllBets(rows);
        }
        setLoadingAll(false);
      });
  }, [tab]);

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

        {/* ── ALL BETS — real Supabase data, no fake players ─── */}
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
                  <td className="py-1.5 px-1 text-slate-200 font-semibold">{b.user}</td>
                  <td className="px-1 text-right text-slate-300">{store.currency}{b.stake}</td>
                  <td className={`px-1 text-right font-bold ${b.multiplier != null && b.multiplier >= 2 ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                    {b.multiplier != null ? `${b.multiplier.toFixed(2)}×` : '—'}
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

        {/* ── TOP PLAYERS ──────────────────────────────────────── */}
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
