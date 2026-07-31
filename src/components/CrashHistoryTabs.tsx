/**
 * CrashHistoryTabs
 *
 * All Bets  — current live round bets from crash_pending_bets (realtime)
 * My Bets   — logged-in user's settled bets from Supabase
 * Top       — top 10 highest winning bets (all-time)
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth, useCrashBets, useCrashState } from '../lib/hooks';
import { store } from '../lib/store';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Tab = 'all' | 'mine' | 'top';

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dedup<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
}

interface PendingBetRow {
  id: string; username: string; bet_amount: number; win_amount: number;
  cash_out_at: number | null; status: string; placed_at: string;
}
interface MyBetRow {
  id: string; bet_amount: number; win_amount: number;
  status: string; placed_at: string; cash_out_at: number | null;
}
interface TopWinRow {
  id: string;
  username: string;
  bet_amount: number;
  win_amount: number;
  cash_out_at: number | null;
}

export default function CrashHistoryTabs() {
  const [tab, setTab] = useState<Tab>('all');
  const session = useAuth();
  const engineBets = useCrashBets();
  const crashState = useCrashState();

  // ── All Bets ──────────────────────────────────────────────────────────
  const [pendingBets, setPendingBets] = useState<PendingBetRow[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (tab !== 'all') return;
    const fetchBets = () => {
      void supabase.from('crash_pending_bets').select('*')
        .order('placed_at', { ascending: false }).limit(50)
        .then(({ data }) => { if (data) setPendingBets(data as PendingBetRow[]); });
    };
    fetchBets();
    const ch = supabase.channel('crash_pending_bets_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crash_pending_bets' }, fetchBets)
      .subscribe();
    channelRef.current = ch;
    return () => { void supabase.removeChannel(ch); channelRef.current = null; };
  }, [tab]);

  const myUsername = (session?.username ?? '').toLowerCase();
  const engineRows = Object.values(engineBets).filter((s) => s.placed).map((slot) => ({
    id: `local-${slot.id}`,
    username: session?.username ?? 'You',
    bet_amount: slot.amount,
    win_amount: slot.win ?? 0,
    cash_out_at: slot.cashedOutAt,
    status: slot.cashedOut ? 'won' : crashState.phase === 'busted' ? 'lost' : 'active',
    placed_at: new Date().toISOString(),
  } satisfies PendingBetRow));
  const otherRows = pendingBets.filter((r) => r.username.toLowerCase() !== myUsername);
  const allBetsDisplay = [...engineRows, ...otherRows];

  // ── My Bets ───────────────────────────────────────────────────────────
  const [myBets, setMyBets] = useState<MyBetRow[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const myFetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (tab !== 'mine') return;
    const uid = session?.userId ?? null;
    if (!uid) { setMyLoading(false); setMyBets([]); return; }
    if (myFetchedForRef.current === uid) return;

    let cancelled = false;
    myFetchedForRef.current = uid;
    setMyLoading(true);

    void (async () => {
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_crash_my_bets', { p_user_id: uid, p_limit: 50 });

      if (cancelled) return;

      if (!rpcError && Array.isArray(rpcData)) {
        setMyBets(dedup((rpcData as MyBetRow[]).map((r) => ({
          ...r,
          bet_amount: Number(r.bet_amount),
          win_amount: Number(r.win_amount),
          cash_out_at: r.cash_out_at != null ? Number(r.cash_out_at) : null,
        }))));
        setMyLoading(false);
        return;
      }

      console.warn('[CrashHistoryTabs] RPC failed, fallback:', rpcError?.message);
      const { data: fbData } = await supabase
        .from('bets')
        .select('id, bet_amount, win_amount, status, placed_at, bet_details')
        .eq('user_id', uid)
        .or('bet_details->>game.eq.crash,game_id.eq.crash')
        .order('placed_at', { ascending: false })
        .limit(50);

      if (cancelled) return;
      if (fbData) {
        setMyBets(dedup((fbData as { id: string; bet_amount: unknown; win_amount: unknown; status: string; placed_at: string; bet_details: Record<string, unknown> | null }[]).map((r) => ({
          id: r.id,
          bet_amount: Number(r.bet_amount),
          win_amount: Number(r.win_amount ?? 0),
          status: r.status,
          placed_at: r.placed_at,
          cash_out_at: r.bet_details?.cashOutAt != null ? Number(r.bet_details.cashOutAt) : null,
        }))));
      }
      setMyLoading(false);
    })();

    return () => { cancelled = true; };
  }, [tab, session?.userId]);

  useEffect(() => {
    if (tab !== 'mine') {
      myFetchedForRef.current = null;
      setMyBets([]);
    }
  }, [tab]);

  // ── Top Wins ──────────────────────────────────────────────────────────
  const [topWins, setTopWins] = useState<TopWinRow[]>([]);
  const [topLoading, setTopLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'top') return;
    let cancelled = false;
    setTopLoading(true);

    void (async () => {
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_crash_top_wins', { p_limit: 10 });

      if (cancelled) return;

      if (!rpcError && Array.isArray(rpcData)) {
        setTopWins((rpcData as TopWinRow[]).map((r) => ({
          id: String(r.id),
          username: r.username ?? 'Unknown',
          bet_amount: Number(r.bet_amount),
          win_amount: Number(r.win_amount),
          cash_out_at: r.cash_out_at != null ? Number(r.cash_out_at) : null,
        })));
        setTopLoading(false);
        return;
      }

      const { data: fbData } = await supabase
        .from('bets')
        .select('id, user_id, bet_amount, win_amount, multiplier, bet_details')
        .eq('status', 'won')
        .or('bet_details->>game.eq.crash,game_id.eq.crash')
        .order('win_amount', { ascending: false })
        .limit(10);

      if (cancelled) return;

      if (fbData) {
        const userIds = [...new Set((fbData as { user_id: string }[]).map((r) => r.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', userIds);

        if (cancelled) return;

        const usernameMap: Record<string, string> = {};
        ((profiles ?? []) as { id: string; username: string }[]).forEach((p) => {
          usernameMap[p.id] = p.username;
        });

        setTopWins((fbData as { id: string; user_id: string; bet_amount: unknown; win_amount: unknown; multiplier: unknown; bet_details: Record<string, unknown> | null }[]).map((r) => ({
          id: r.id,
          username: usernameMap[r.user_id] ?? 'Unknown',
          bet_amount: Number(r.bet_amount),
          win_amount: Number(r.win_amount),
          cash_out_at: r.bet_details?.cashOutAt != null
            ? Number(r.bet_details.cashOutAt)
            : r.multiplier != null ? Number(r.multiplier) : null,
        })));
      }
      setTopLoading(false);
    })();

    return () => { cancelled = true; };
  }, [tab]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-borderline-900 bg-slatepanel-900">
      {/* Tab bar */}
      <div className="bg-slatepanel-900 rounded-t-xl px-2 pt-2 pb-1.5 border-b border-borderline-900"
        style={{ position: 'sticky', top: 0, zIndex: 5 }}>
        <div className="grid grid-cols-3 gap-1.5">
          {(['all', 'mine', 'top'] as Tab[]).map((k) => (
            <button key={k} onClick={() => setTab(k)}
              className={['py-1.5 rounded-lg text-xs font-bold transition-all border',
                tab === k ? 'bg-slatepanel-700 border-slate-500 text-white'
                  : 'bg-slatepanel-800 border-borderline-900 text-slate-400'].join(' ')}>
              {k === 'all' ? 'All Bets' : k === 'mine' ? 'My Bets' : 'Top'}
            </button>
          ))}
        </div>
      </div>

      {/* ALL BETS */}
      {tab === 'all' && (
        <table className="w-full text-xs text-left">
          <thead className="bg-slatepanel-800 text-slate-400">
            <tr>
              <th className="py-2 px-2 font-semibold" style={{ minWidth: 80 }}>Player</th>
              <th className="py-2 px-2 font-semibold" style={{ minWidth: 70 }}>Stake</th>
              <th className="py-2 px-2 font-semibold" style={{ minWidth: 55 }}>×</th>
              <th className="py-2 px-2 font-semibold" style={{ minWidth: 70 }}>Win</th>
            </tr>
          </thead>
          <tbody>
            {allBetsDisplay.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-slate-500">Waiting for bets…</td></tr>}
            {allBetsDisplay.map((b) => (
              <tr key={b.id} className="border-t border-borderline-900/50 hover:bg-slatepanel-700/40">
                <td className="py-1.5 px-2 text-slate-200 truncate max-w-[80px]">{b.username}</td>
                <td className="py-1.5 px-2 text-slate-300">{store.currency}{Number(b.bet_amount)}</td>
                <td className={`py-1.5 px-2 font-bold ${b.status === 'won' ? 'text-emeraldwin-400' : b.status === 'lost' ? 'text-coral-400' : 'text-slate-300 animate-pulse'}`}>
                  {b.status === 'won' && b.cash_out_at != null ? `${Number(b.cash_out_at).toFixed(2)}×` : b.status === 'active' ? `${crashState.multiplier.toFixed(2)}×` : '—'}
                </td>
                <td className={`py-1.5 px-2 ${b.status === 'won' ? 'text-emeraldwin-300' : 'text-slate-500'}`}>
                  {b.status === 'won' ? `${store.currency}${Number(b.win_amount)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* MY BETS */}
      {tab === 'mine' && (
        <table className="w-full text-xs text-left">
          <thead className="bg-slatepanel-800 text-slate-400">
            <tr>
              <th className="py-2 px-2 font-semibold" style={{ minWidth: 60 }}>Time</th>
              <th className="py-2 px-2 font-semibold" style={{ minWidth: 65 }}>Stake</th>
              <th className="py-2 px-2 font-semibold" style={{ minWidth: 55 }}>×</th>
              <th className="py-2 px-2 font-semibold" style={{ minWidth: 65 }}>Win</th>
              <th className="py-2 px-2 font-semibold whitespace-nowrap" style={{ minWidth: 70 }}>Net P/L</th>
            </tr>
          </thead>
          <tbody>
            {myLoading && <tr><td colSpan={5} className="py-4 text-center text-slate-500">Loading…</td></tr>}
            {!myLoading && !session?.userId && <tr><td colSpan={5} className="py-4 text-center text-slate-500">Login to see your bets.</td></tr>}
            {!myLoading && session?.userId && myBets.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-500">No bets yet.</td></tr>}
            {myBets.map((b) => {
              const netpl = b.win_amount - b.bet_amount;
              return (
                <tr key={b.id} className="border-t border-borderline-900/50 hover:bg-slatepanel-700/40">
                  <td className="py-1.5 px-2 text-slate-400">{fmtTime(b.placed_at)}</td>
                  <td className="py-1.5 px-2 text-slate-300">{store.currency}{b.bet_amount}</td>
                  <td className={`py-1.5 px-2 font-bold ${b.status === 'won' ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                    {b.cash_out_at != null ? `${b.cash_out_at.toFixed(2)}×` : '—'}
                  </td>
                  <td className={`py-1.5 px-2 ${b.status === 'won' ? 'text-emeraldwin-300' : 'text-slate-500'}`}>
                    {b.status === 'won' ? `${store.currency}${b.win_amount}` : '—'}
                  </td>
                  <td className={`py-1.5 px-2 font-semibold ${netpl >= 0 ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                    {netpl >= 0 ? '+' : ''}{store.currency}{netpl}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* TOP WINS */}
      {tab === 'top' && (
        <table className="w-full text-xs text-left">
          <thead className="bg-slatepanel-800 text-slate-400">
            <tr>
              <th className="py-2 px-2 font-semibold" style={{ minWidth: 28 }}>#</th>
              <th className="py-2 px-2 font-semibold" style={{ minWidth: 75 }}>Player</th>
              <th className="py-2 px-2 font-semibold" style={{ minWidth: 60 }}>Stake</th>
              <th className="py-2 px-2 font-semibold" style={{ minWidth: 50 }}>×</th>
              <th className="py-2 px-2 font-semibold" style={{ minWidth: 70 }}>Win</th>
            </tr>
          </thead>
          <tbody>
            {topLoading && <tr><td colSpan={5} className="py-4 text-center text-slate-500">Loading…</td></tr>}
            {!topLoading && topWins.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-500">No data yet.</td></tr>}
            {topWins.map((r, i) => (
              <tr key={r.id} className="border-t border-borderline-900/50 hover:bg-slatepanel-700/40">
                <td className="py-1.5 px-2 text-slate-400 font-bold">{i + 1}</td>
                <td className="py-1.5 px-2 text-slate-200 truncate max-w-[75px]">{r.username}</td>
                <td className="py-1.5 px-2 text-slate-300">{store.currency}{r.bet_amount}</td>
                <td className="py-1.5 px-2 font-bold text-emeraldwin-400">
                  {r.cash_out_at != null ? `${Number(r.cash_out_at).toFixed(2)}×` : '—'}
                </td>
                <td className="py-1.5 px-2 font-bold text-emeraldwin-300">{store.currency}{r.win_amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
