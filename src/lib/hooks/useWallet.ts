import { useEffect, useState } from 'react';
import { supabase } from '../integrations/supabase/client';

interface WalletData {
  balance: number;
  total_deposit: number;
  total_withdrawal: number;
}

/**
 * Fetches the current user's wallet balance directly from the `profiles` table.
 * No userId argument required — uses the active Supabase auth session.
 * Returns 0 / not-loading gracefully when the user is not authenticated.
 */
export function useWallet() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchWallet = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setWallet(null); setLoading(false); return; }

        const { data, error: dbErr } = await supabase
          .from('profiles')
          .select('balance, total_deposit, total_withdrawal')
          .eq('id', user.id)
          .single();

        if (cancelled) return;
        if (dbErr) throw dbErr;
        setWallet(data as WalletData);
        setError(null);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load wallet');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchWallet();
    // Refresh every 30s
    const interval = setInterval(() => { void fetchWallet(); }, 30_000);

    // Also re-fetch when auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void fetchWallet();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, []);

  return {
    wallet,
    loading,
    error,
    balance: wallet?.balance ?? 0,
    totalDeposit: wallet?.total_deposit ?? 0,
    totalWithdrawal: wallet?.total_withdrawal ?? 0,
  };
}
