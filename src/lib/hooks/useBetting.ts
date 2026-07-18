import { useEffect, useState } from 'react';
import type { SupabaseBet } from '../supabaseIntegration';
import { getUserBets, placeBet, getEvents, getEventDetails } from '../supabaseIntegration';

type EventRecord = Awaited<ReturnType<typeof getEvents>>[number];

export function useBetting(userId: string | null) {
  const [bets, setBets] = useState<SupabaseBet[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        if (userId) setBets(await getUserBets(userId));
        setEvents(await getEvents());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally { setLoading(false); }
    };
    void fetchData();
    const interval = setInterval(() => { void fetchData(); }, 60000);
    return () => clearInterval(interval);
  }, [userId]);

  const createBet = async (betData: { eventId: string; marketId: string; selectionId: string; stake: number; odds: number; betType: 'back' | 'lay' }) => {
    if (!userId) return { success: false, error: 'User not authenticated' };
    const result = await placeBet({ userId, ...betData });
    if (result.success) setBets(await getUserBets(userId));
    return result;
  };

  const getEventMarkets = async (eventId: string) => {
    try { const d = await getEventDetails(eventId); return d?.markets ?? []; }
    catch { return []; }
  };

  return {
    bets, events, loading, error, createBet, getEventMarkets,
    getActiveBets: () => bets.filter((b) => b.status === 'active'),
    getSettledBets: () => bets.filter((b) => b.status === 'settled'),
    totalWins: bets.filter((b) => b.status === 'won').reduce((s, b) => s + b.win_amount, 0),
    totalLosses: bets.filter((b) => b.status === 'lost').reduce((s, b) => s + b.bet_amount, 0),
  };
}
