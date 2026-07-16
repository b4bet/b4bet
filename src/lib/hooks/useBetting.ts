import { useEffect, useState } from 'react';
import { getUserBets, placeBet, getEvents, getEventDetails } from '../supabaseIntegration';

export function useBetting(userId: string | null) {
  const [bets, setBets] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch user bets
        if (userId) {
          const userBets = await getUserBets(userId);
          setBets(userBets);
        }

        // Fetch events
        const eventsList = await getEvents();
        setEvents(eventsList);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Refresh every minute
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [userId]);

  const createBet = async (betData: {
    eventId: string;
    marketId: string;
    selectionId: string;
    stake: number;
    odds: number;
    betType: 'back' | 'lay';
  }) => {
    if (!userId) return { success: false, error: 'User not authenticated' };

    const result = await placeBet({
      userId,
      ...betData,
    });

    if (result.success) {
      // Refresh bets list
      const updatedBets = await getUserBets(userId);
      setBets(updatedBets);
    }

    return result;
  };

  const getEventMarkets = async (eventId: string) => {
    try {
      const eventData = await getEventDetails(eventId);
      return eventData?.markets || [];
    } catch (err: any) {
      return [];
    }
  };

  const getActiveBets = () => bets.filter((b) => b.bet_status === 'active');
  const getSettledBets = () => bets.filter((b) => b.bet_status === 'settled');

  return {
    bets,
    events,
    loading,
    error,
    createBet,
    getEventMarkets,
    getActiveBets,
    getSettledBets,
    totalWins: bets.filter((b) => b.result === 'won').reduce((sum, b) => sum + (b.win_amount || 0), 0),
    totalLosses: bets.filter((b) => b.result === 'lost').reduce((sum, b) => sum + (b.loss_amount || 0), 0),
  };
}
