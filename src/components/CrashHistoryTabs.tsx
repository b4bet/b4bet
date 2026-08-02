/**
 * CrashHistoryTabs
 *
 * All Bets — current live round ki bets from crash_pending_bets (realtime)
 * My Bets — logged-in user ki settled bets from Supabase
 * Top — top earners in time range
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth, useCrashBets, useCrashState } from '../lib/hooks';
import { store } from '../lib/store';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Tab = 'all' | 'mine' | 'top';
type Range = 'day' | 'week' | 'month' | 'year';

const RANGE_MS: Record<Range, number> = {
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
};

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface PendingBetRow {
  id: string;
  username: string;
  bet_amount: number;
  win_amount: number;
  cash_out_at: number | null;
  status: string;
  placed_at: string;
}

interface MyBetRow {
  id: string;
  bet_amount: number;
  win_amount: number;
  status: string;
  placed_at: string;
  cash_out_at: number | null;
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
  const engineBets = useCrashBets();
  const crashState = useCrashState();

  // ── All Bets: realtime from crash_pending_bets, filtered to current round ──
  const [pendingBets, setPendingBets] = useState<PendingBetRow[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Fetch current round's bets
  const fetchCurrentRoundBets = (roundId: string) => {
    if (!roundId) return;
    void supabase
      .from('crash_pending_bets')
      .select('*')
      .eq('round_uuid', roundId)
      .order('placed_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setPendingBets(data as PendingBetRow[]);
      });
  };

  useEffect(() => {
    if (tab !== 'all') return;

    // Clear stale bets when round changes
    setPendingBets([]);

    // Fetch for current round
    fetchCurrentRoundBets(crashState.roundId);

    // Subscribe to realtime changes — refetch on any change, filtered by round
    const ch = supabase
      .channel('crash_pending_bets_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crash_pending_bets' }, () => {
        fetchCurrentRoundBets(crashState.roundId);
      })
      .subscribe();

    channelRef.current = ch;
    return () => {
      void supabase.removeChannel(ch);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, crashState.roundId]);

  const myUsername = (session?.username ?? '').toLowerCase();

  // Current user's local bets (from engine) — always show in All Bets
  const engineRows = Object.values(engineBets)
    .filter((slot) => slot.placed)
    .map((slot) => ({
      id: `local-${slot.id}`,
      username: session?.username ?? 'You',
      bet_amount: slot.amount,
      win_amount: slot.win ?? 0,
      cash_out_at: slot.cashedOutAt,
      status: slot.cashedOut
        ? 'won'
        : crashState.phase === 'busted' && !slot.cashedOut
        ? 'lost'
        : 'active',
      placed_at: new Date().toISOString(),
    } satisfies PendingBetRow));

  // Other users' bets from DB (exclude current user to avoid duplicate)
  const otherRows = pendingBets.filter((r) => r.username.toLowerCase() !== myUsername);
  const allBetsDisplay = [...engineRows, ...otherRows];

  // ── My Bets ─────────────────────────────────────────────────────────────
  const [myBets, setMyBets] = useState<MyBetRow[]>([]);
  const [myLoading, setMyLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'mine') return;
    if (!session?.userId) { setMyLoading(false); return; }
    setMyLoading(true);
    void supabase
      .rpc('get_crash_my_bets', { p_user_id: session.userId, p_limit: 50 })
      .then(({ data, error }) => {
        if (error) console.error('[CrashHistoryTabs] my bets error:', error);
        if (!error && data) {
          setMyBets(
            (data as MyBetRow[]).map((r) => ({
              ...r,
              bet_amount: Number(r.bet_amount),
              win_amount: Number(r.win_amount),
              cash_out_at: r.cash_out_at != null ? Number(r.cash_out_at) : null,
            }))
          );
        }
        setMyLoading(false);
      });
  }, [tab, session?.userId]);

  // ── Top Players ─────────────────────────────────────────────────────────
  const [topRows, setTopRows] = useState<TopRow[]>([]);
  const [topLoading, setTopLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'top') return;
    setTopLoading(true);
    const since = new Date(Date.now() - RANGE_MS[range]).toISOString();
    void supabase
      .rpc('get_crash_top_players', { p_since: since, p_limit: 10 })
      .then(({ data, error }) => {
        if (error) console.error('[CrashHistoryTabs] top error:', error);
        if (!error && data) {
          setTopRows((data as TopRow[]).map((r) => ({ ...r, earnings: Number(r.earnings) })));
        }
        setTopLoading(false);
      });
  }, [tab, range]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2 mt-3">
      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1.5">
        {(['all', 'mine', 'top'] as Tab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={[
              'py-1.5 rounded-lg text-xs font-bold transition-all border',
              tab === k
                ? 'bg-slatepanel-700 border-slate-500 text-white'
                : 'bg-slatepanel-800 border-borderline-900 text-slate-400',
            ].join(' ')}
          >
            {k === 'all' ? 'All Bets' : k === 'mine' ? 'My Bets' : 'Top'}
          </button>
        ))}
      </div>

      {/* Range chips — Top only */}
      {tab === 'top' && (
        <div className="flex gap-1.5 flex-wrap">
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

      {/* Table container — fixed height with scroll */}
      <div className="overflow-y-auto max-h-48 rounded-xl bg-slatepanel-900 border border-borderline-900">

        {/* ── ALL BETS ── */}
        {tab === 'all' && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slatepanel-800 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">Player</th>
                <th className="text-right px-3 py-2">Stake</th>
                <th className="text-right px-3 py-2">×</th>
                <th className="text-right px-3 py-2">Win</th>
              </tr>
            </thead>
            <tbody>
              {allBetsDisplay.length === 0 && (
                <tr><td colSpan={4} className="text-center text-slate-500 py-4">Waiting for bets…</td></tr>
              )}
              {allBetsDisplay.map((b) => (
                <tr key={b.id} className="border-t border-borderline-900/50">
                  <td className="px-3 py-1.5 text-slate-200 font-medium">{b.username}</td>
                  <td className="px-3 py-1.5 text-right text-slate-300">{store.currency}{Number(b.bet_amount)}</td>
                  <td className={`px-3 py-1.5 text-right font-bold ${b.status === 'won' ? 'text-emeraldwin-400' : b.status === 'lost' ? 'text-coral-400' : 'text-slate-300'}`}>
                    {b.status === 'won' && b.cash_out_at != null
                      ? `${Number(b.cash_out_at).toFixed(2)}×`
                      : b.status === 'active'
                      ? `${crashState.multiplier.toFixed(2)}×`
                      : '—'}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-semibold ${b.status === 'won' ? 'text-emeraldwin-400' : 'text-slate-500'}`}>
                    {b.status === 'won' ? `${store.currency}${Number(b.win_amount)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── MY BETS ── */}
        {tab === 'mine' && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slatepanel-800 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">Time</th>
                <th className="text-right px-3 py-2">Stake</th>
                <th className="text-right px-3 py-2">×</th>
                <th className="text-right px-3 py-2">Win</th>
                <th className="text-right px-3 py-2">Net P/L</th>
              </tr>
            </thead>
            <tbody>
              {myLoading && (
                <tr><td colSpan={5} className="text-center text-slate-500 py-4">Loading…</td></tr>
              )}
              {!myLoading && !session?.userId && (
                <tr><td colSpan={5} className="text-center text-slate-500 py-4">Login to see your bets.</td></tr>
              )}
              {!myLoading && session?.userId && myBets.length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-500 py-4">No bets yet.</td></tr>
              )}
              {myBets.map((b) => {
                const netpl = b.win_amount - b.bet_amount;
                return (
                  <tr key={b.id} className="border-t border-borderline-900/50">
                    <td className="px-3 py-1.5 text-slate-400">{fmtTime(b.placed_at)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-300">{store.currency}{b.bet_amount}</td>
                    <td className="px-3 py-1.5 text-right text-slate-300">
                      {b.cash_out_at != null ? `${b.cash_out_at.toFixed(2)}×` : '—'}
                    </td>
                    <td className={`px-3 py-1.5 text-right ${b.status === 'won' ? 'text-emeraldwin-400' : 'text-slate-500'}`}>
                      {b.status === 'won' ? `${store.currency}${b.win_amount}` : '—'}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-semibold ${
                      netpl >= 0 ? 'text-emeraldwin-400' : 'text-coral-400'
                    }`}>
                      {netpl >= 0 ? '+' : ''}{store.currency}{netpl}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* ── TOP PLAYERS ── */}
        {tab === 'top' && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slatepanel-800 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Player</th>
                <th className="text-right px-3 py-2">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {topLoading && (
                <tr><td colSpan={3} className="text-center text-slate-500 py-4">Loading…</td></tr>
              )}
              {!topLoading && topRows.length === 0 && (
                <tr><td colSpan={3} className="text-center text-slate-500 py-4">No data in range.</td></tr>
              )}
              {topRows.map((r, i) => (
                <tr key={r.user_id} className="border-t border-borderline-900/50">
                  <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-1.5 text-slate-200">{r.username}</td>
                  <td className="px-3 py-1.5 text-right text-emeraldwin-400 font-semibold">{store.currency}{r.earnings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
