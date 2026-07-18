import { useEffect, useState } from 'react';
import type { WalletRecord } from '../supabaseIntegration';
import { getUserWallet, updateWalletBalance } from '../supabaseIntegration';

export function useWallet(userId: string | null) {
  const [wallet, setWallet] = useState<WalletRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) { setWallet(null); setLoading(false); return; }
    const fetchWallet = async () => {
      try {
        setLoading(true);
        setWallet(await getUserWallet(userId));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally { setLoading(false); }
    };
    void fetchWallet();
    const interval = setInterval(() => { void fetchWallet(); }, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const updateBalance = async (amount: number, type: 'deposit' | 'withdrawal' | 'bet_placed' | 'bet_won') => {
    if (!userId) return { success: false, newBalance: 0, error: 'No user' };
    const result = await updateWalletBalance(userId, amount, type);
    if (result.success) setWallet((prev) => prev ? { ...prev, balance: result.newBalance } : prev);
    return result;
  };

  return {
    wallet, loading, error,
    balance: wallet?.balance ?? 0,
    bonusBalance: wallet?.bonus_balance ?? 0,
    lockedBalance: wallet?.locked_balance ?? 0,
    updateBalance,
  };
}
