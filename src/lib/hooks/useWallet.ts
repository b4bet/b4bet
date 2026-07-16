import { useEffect, useState } from 'react';
import { getUserWallet, updateWalletBalance } from '../supabaseIntegration';

export function useWallet(userId: string | null) {
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setWallet(null);
      setLoading(false);
      return;
    }

    const fetchWallet = async () => {
      try {
        setLoading(true);
        const walletData = await getUserWallet(userId);
        setWallet(walletData);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchWallet();

    // Refresh wallet every 30 seconds
    const interval = setInterval(fetchWallet, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const updateBalance = async (amount: number, type: 'deposit' | 'withdrawal' | 'bet_placed' | 'bet_won') => {
    if (!userId) return { success: false, error: 'No user' };

    const result = await updateWalletBalance(userId, amount, type);
    if (result.success) {
      setWallet((prev: any) => ({ ...prev, balance: result.newBalance }));
    }
    return result;
  };

  return {
    wallet,
    loading,
    error,
    balance: wallet?.balance || 0,
    bonusBalance: wallet?.bonus_balance || 0,
    lockedBalance: wallet?.locked_balance || 0,
    updateBalance,
  };
}
