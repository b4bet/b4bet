/**
 * CrashHistoryTabs — All Bets, My Bets, Top Players connected to real Supabase data.
 * - All Bets: live feed from `bets` table (crash game)
 * - My Bets: real bets for logged-in user from `bets` table
 * - Top Players: leaderboard from `bets` table (top earners in time range)
 */
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../lib/hooks';
import { store } from '../lib/store';

type Tab = 'all' | 'mine' | 'top';
type Range = 'day' | 'week' | 'month' | 'year';

const CRASH_GAME_ID = 'ee8ae2ab-d62c-4378-a377-55b3f7be4b3e';

const RANGE_MS: Record<Range, number> = {
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
};

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface AllBetRow {
  id: string;
  username: string;
  bet_amount: number;
  win_amount: number;
  multiplier: number;
  status: string;
  placed_at: string;
  bet_details: { cashOutAt?: number | null; bustPoint?: number } | null;
}

interface MyBetRow {
  id: string;
  bet_amount: number;
  win_amount: number;
  multiplier: number;
  status: string;
  placed_at: string;
  bet_details: { cashOutAt?: number | null; bustPoint?: number } | null;
}

interface TopRow {
  user_id: string;
  username: string;
  earnings: number;
}

export default function CrashHistoryTabs() {
  const [tab, setTab] = useState<Tab>('all');
  const [range, setRange] = useState<Range>('day');
  const session = useAuth();

  // All Bets
  const [allBets, setAllBets] = useState<AllBetRow[]>([]);
  const [allLoading, setAllLoading] = useState(false);

  // My Bets
  const [myBets, setMyBets] = useState<MyBetRow[]>([]);
  const [myLoading, setMyLoading] = useState(false);

  // Top Players
  const [topRows, setTopRows] = useState<TopRow[]>([]);
  const [topLoading, setTopLoading] = useState(false);

  // Load All Bets
  useEffect(() => {
    if (tab !== 'all') return;
    setAllLoading(true);
    supabase
      .from('bets')
      .select('id, bet_amount, win_amount, multiplier, status, placed_at, bet_details, profiles!bets_user_id_fkey(username)')
      .eq('game_id', CRASH_GAME_ID)
      .in('status', ['won', 'lost'])
      .order('placed_at', { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (!error && data) {
          const rows = data.map((r) => ({
            id: r.id as string,
            username: (r.profiles as { username?: string } | null)?.username ?? 'Player',
            bet_amount: Number(r.bet_amount),
            win_amount: Number(r.win_amount ?? 0),
            multiplier: Number(r.multiplier ?? 1),
            status: r.status as string,
            placed_at: r.placed_at as string,
            bet_details: r.bet_details as AllBetRow['bet_details'],
          }));
          setAllBets(rows);
        }
        setAllLoading(false);
      });
  }, [tab]);

  // Load My Bets
  useEffect(() => {
    if (tab !== 'mine' || !session?.userId) return;
    setMyLoading(true);
    supabase
      .from('bets')
      .select('id, bet_amount, win_amount, multiplier, status, placed_at, bet_details')
      .eq('game_id', CRASH_GAME_ID)
      .eq('user_id', session.userId)
      .order('placed_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!error && data) {
          const rows = data.map((r) => ({
            id: r.id as string,
            bet_amount: Number(r.bet_amount),
            win_amount: Number(r.win_amount ?? 0),
            multiplier: Number(r.multiplier ?? 1),
            status: r.status as string,
            placed_at: r.placed_at as string,
            bet_details: r.bet_details as MyBetRow['bet_details'],
          }));
          setMyBets(rows);
        }
        setMyLoading(false);
      });
  }, [tab, session?.userId]);

  // Load Top Players
  const cutoff = useMemo(() => {
    return new Date(Date.now() - RANGE_MS[range]).toISOString();
  }, [range]);

  useEffect(() => {
    if (tab !== 'top') return;
    setTopLoading(true);
    // Aggregate won bets grouped by user_id, join username from profiles
    supabase
      .from('bets')
      .select('user_id, win_amount, bet_amount, profiles!bets_user_id_fkey(username)')
      .eq('game_id', CRASH_GAME_ID)
      .eq('status', 'won')
      .gte('placed_at', cutoff)
      .then(({ data, error }) => {
        if (!error && data) {
          // Group by user_id and sum earnings (win_amount - bet_amount)
          const earningsByUser = new Map<string, { username: string; earnings: number }>();
          for (const r of data) {
            const uid = r.user_id as string;
            const uname = (r.profiles as { username?: string } | null)?.username ?? 'Player';
            const earning = Number(r.win_amount ?? 0) - Number(r.bet_amount ?? 0);
            const existing = earningsByUser.get(uid);
            if (existing) {
              existing.earnings += earning;
            } else {
              earningsByUser.set(uid, { username: uname, earnings: earning });
            }
          }
          const sorted = Array.from(earningsByUser.entries())
            .map(([uid, v]) => ({ user_id: uid, username: v.username, earnings: v.earnings }))
            .filter((r) => r.earnings > 0)
            .sort((a, b) => b.earnings - a.earnings)
            .slice(0, 10);
          setTopRows(sorted);
        }
        setTopLoading(false);
      });
  }, [tab, cutoff]);

  return (
    <div className="flex flex-col gap-2">
      {/* Primary tabs */}
      <div className="grid grid-cols-3 gap-1.5 px-1">
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
        <div className="flex gap-1.5 px-1 flex-wrap">
          {(['day', 'week', 'month', 'year'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={[
                'px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all',
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
      <div className="overflow-auto max-h-56 rounded-xl border border-borderline-900">

        {/* ── ALL BETS ─────────────────────────────────────────── */}
        {tab === 'all' && (
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 bg-slatepanel-800 text-slate-400">
              <tr>
                <th className="py-2 px-2 font-semibold" style={{ minWidth: 80 }}>Player</th>
                <th className="py-2 px-2 font-semibold" style={{ minWidth: 70 }}>Stake</th>
                <th className="py-2 px-2 font-semibold" style={{ minWidth: 55 }}>×</th>
                <th className="py-2 px-2 font-semibold" style={{ minWidth: 70 }}>Win</th>
              </tr>
            </thead>
            <tbody>
              {allLoading && (
                <tr><td colSpan={4} className="py-4 text-center text-slate-500">Loading…</td></tr>
              )}
              {!allLoading && allBets.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-slate-500">No bets yet.</td></tr>
              )}
              {allBets.map((b) => (
                <tr key={b.id} className="border-t border-borderline-900/50 hover:bg-slatepanel-700/40">
                  <td className="py-1.5 px-2 text-slate-200 truncate max-w-[80px]">{b.username}</td>
                  <td className="py-1.5 px-2 text-slate-300">{store.currency}{b.bet_amount}</td>
                  <td className={`py-1.5 px-2 font-bold ${b.status === 'won' ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                    {b.status === 'won' && b.multiplier > 1 ? `${b.multiplier.toFixed(2)}×` : '—'}
                  </td>
                  <td className={`py-1.5 px-2 ${b.status === 'won' ? 'text-emeraldwin-300' : 'text-slate-500'}`}>
                    {b.status === 'won' ? `${store.currency}${b.win_amount.toFixed(0)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── MY BETS ── */}
        {tab === 'mine' && (
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 bg-slatepanel-800 text-slate-400">
              <tr>
                <th className="py-2 px-2 font-semibold" style={{ minWidth: 60 }}>Time</th>
                <th className="py-2 px-2 font-semibold" style={{ minWidth: 65 }}>Stake</th>
                <th className="py-2 px-2 font-semibold" style={{ minWidth: 55 }}>×</th>
                <th className="py-2 px-2 font-semibold" style={{ minWidth: 65 }}>Win</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap" style={{ minWidth: 70 }}>Net P/L</th>
              </tr>
            </thead>
            <tbody>
              {myLoading && (
                <tr><td colSpan={5} className="py-4 text-center text-slate-500">Loading…</td></tr>
              )}
              {!myLoading && !session?.userId && (
                <tr><td colSpan={5} className="py-4 text-center text-slate-500">Login to see your bets.</td></tr>
              )}
              {!myLoading && session?.userId && myBets.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-slate-500">No bets yet.</td></tr>
              )}
              {myBets.map((b) => {
                const netpl = b.win_amount - b.bet_amount;
                const cashOutAt = b.bet_details?.cashOutAt;
                return (
                  <tr key={b.id} className="border-t border-borderline-900/50 hover:bg-slatepanel-700/40">
                    <td className="py-1.5 px-2 text-slate-400">{fmtTime(b.placed_at)}</td>
                    <td className="py-1.5 px-2 text-slate-300">{store.currency}{b.bet_amount}</td>
                    <td className={`py-1.5 px-2 font-bold ${b.status === 'won' ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                      {cashOutAt ? `${Number(cashOutAt).toFixed(2)}×` : '—'}
                    </td>
                    <td className={`py-1.5 px-2 ${b.status === 'won' ? 'text-emeraldwin-300' : 'text-slate-500'}`}>
                      {b.status === 'won' ? `${store.currency}${b.win_amount.toFixed(0)}` : '—'}
                    </td>
                    <td className={`py-1.5 px-2 font-semibold ${netpl >= 0 ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                      {netpl >= 0 ? '+' : ''}{store.currency}{netpl.toFixed(0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* ── TOP PLAYERS ──────────────────────────────────────── */}
        {tab === 'top' && (
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 bg-slatepanel-800 text-slate-400">
              <tr>
                <th className="py-2 px-2 font-semibold" style={{ minWidth: 30 }}>#</th>
                <th className="py-2 px-2 font-semibold" style={{ minWidth: 90 }}>Player</th>
                <th className="py-2 px-2 font-semibold" style={{ minWidth: 80 }}>Earnings</th>
              </tr>
            </thead>
            <tbody>
              {topLoading && (
                <tr><td colSpan={3} className="py-4 text-center text-slate-500">Loading…</td></tr>
              )}
              {!topLoading && topRows.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-slate-500">No data in range.</td></tr>
              )}
              {topRows.map((r, i) => (
                <tr key={r.user_id} className="border-t border-borderline-900/50 hover:bg-slatepanel-700/40">
                  <td className="py-1.5 px-2 text-slate-400">{i + 1}</td>
                  <td className="py-1.5 px-2 text-slate-200 truncate max-w-[90px]">{r.username}</td>
                  <td className="py-1.5 px-2 text-emeraldwin-400 font-semibold">{store.currency}{r.earnings.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
