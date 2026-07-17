export { supabase } from '@/integrations/supabase/client';

// All Supabase database operations now go through the centralized client

// ---- Stats ----
export async function supabaseGetStats(): Promise<{ onlineUsers: number; topWin: number; paidOut: number }> {
  try {
    const { count: onlineUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { data: topWin } = await supabase.from('bets').select('win_amount').order('win_amount', { ascending: false }).limit(1);
    const { data: paidOut } = await supabase.from('transactions').select('amount').eq('type', 'withdrawal').eq('status', 'approved');
    const totalPaidOut = paidOut ? paidOut.reduce((sum: number, r: any) => sum + (r.amount || 0), 0) : 0;
    return {
      onlineUsers: typeof onlineUsers === 'number' ? onlineUsers : 0,
      topWin: topWin && topWin.length > 0 ? topWin[0].win_amount || 0 : 0,
      paidOut: totalPaidOut,
    };
  } catch {
    return { onlineUsers: 0, topWin: 0, paidOut: 0 };
  }
}

// ---- Wallet ----
export async function getUserWallet(userId: string) {
  const { data } = await supabase.from('profiles').select('balance').eq('id', userId).single();
  return data ?? { balance: 0 };
}

export async function updateWalletBalance(userId: string, amount: number) {
  const { data } = await supabase.from('profiles').select('balance').eq('id', userId).single();
  const newBalance = (data?.balance ?? 0) + amount;
  await supabase.from('profiles').update({ balance: newBalance }).eq('id', userId);
  return newBalance;
}

// ---- Auth ----
export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

export async function signUpUser(email: string, password: string, metadata?: Record<string, any>) {
  return await supabase.auth.signUp({ email, password, options: { data: metadata } });
}

export async function loginUser(email: string, password: string) {
  return await supabase.auth.signInWithPassword({ email, password });
}

export async function logoutUser() {
  return await supabase.auth.signOut();
}

// ---- Betting ----
export async function getUserBets(userId: string) {
  const { data } = await supabase.from('bets').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  return data ?? [];
}

export async function placeBet(userId: string, amount: number, gameType: string, details?: any) {
  const { data } = await supabase.from('bets').insert({
    user_id: userId,
    bet_amount: amount,
    win_amount: 0,
    multiplier: 1,
    status: 'pending',
    bet_details: details ?? {},
  }).select().single();
  return data;
}

export async function getEvents(limit = 20) {
  const { data } = await supabase.from('bets').select('*').order('created_at', { ascending: false }).limit(limit);
  return data ?? [];
}

export async function getEventDetails(eventId: string) {
  const { data } = await supabase.from('bets').select('*').eq('id', eventId).single();
  return data;
}