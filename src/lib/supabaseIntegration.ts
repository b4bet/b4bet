import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================================
// USER OPERATIONS
// ============================================================================

export async function signUpUser(email: string, password: string, userData: { firstName: string; lastName: string; phone?: string }) {
  try {
    // Sign up with Supabase auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;

    // Create user profile in database
    if (authData.user) {
      const { error: profileError } = await supabase.from('users').insert({
        id: authData.user.id,
        auth_id: authData.user.id,
        email,
        first_name: userData.firstName,
        last_name: userData.lastName,
        phone: userData.phone,
        is_active: true,
        kyc_status: 'pending',
      });

      if (profileError) throw profileError;

      // Create wallet for user
      await supabase.from('wallets').insert({
        user_id: authData.user.id,
        balance: 0,
        bonus_balance: 0,
        locked_balance: 0,
      });
    }

    return { success: true, user: authData.user };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function loginUser(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    return { success: true, user: data.user, session: data.session };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function logoutUser() {
  try {
    await supabase.auth.signOut();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getCurrentUser() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  } catch (error: any) {
    return null;
  }
}

// ============================================================================
// WALLET OPERATIONS
// ============================================================================

export async function getUserWallet(userId: string) {
  try {
    const { data, error } = await supabase.from('wallets').select('*').eq('user_id', userId).single();

    if (error) throw error;
    return data;
  } catch (error: any) {
    return null;
  }
}

export async function updateWalletBalance(userId: string, amount: number, type: 'deposit' | 'withdrawal' | 'bet_placed' | 'bet_won') {
  try {
    const wallet = await getUserWallet(userId);
    if (!wallet) throw new Error('Wallet not found');

    let newBalance = wallet.balance;

    if (type === 'deposit') {
      newBalance += amount;
    } else if (type === 'withdrawal') {
      newBalance -= amount;
    } else if (type === 'bet_placed') {
      newBalance -= amount; // Lock balance
    } else if (type === 'bet_won') {
      newBalance += amount;
    }

    const { error } = await supabase.from('wallets').update({ balance: newBalance }).eq('user_id', userId);

    if (error) throw error;
    return { success: true, newBalance };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// BETTING OPERATIONS
// ============================================================================

export async function placeBet(betData: {
  userId: string;
  eventId: string;
  marketId: string;
  selectionId: string;
  stake: number;
  odds: number;
  betType: 'back' | 'lay';
}) {
  try {
    const potentialWin = betData.stake * betData.odds;

    const { data, error } = await supabase.from('bets').insert({
      user_id: betData.userId,
      event_id: betData.eventId,
      market_id: betData.marketId,
      selection_id: betData.selectionId,
      bet_type: betData.betType,
      stake: betData.stake,
      odds_at_placement: betData.odds,
      potential_win: potentialWin,
      bet_status: 'active',
    });

    if (error) throw error;

    // Update wallet - lock balance
    await updateWalletBalance(betData.userId, betData.stake, 'bet_placed');

    return { success: true, bet: data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getUserBets(userId: string, status?: string) {
  try {
    let query = supabase.from('bets').select('*, events(name), markets(market_name), market_selections(selection_name)').eq('user_id', userId);

    if (status) {
      query = query.eq('bet_status', status);
    }

    const { data, error } = await query.order('placed_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error: any) {
    return [];
  }
}

// ============================================================================
// EVENTS & MARKETS
// ============================================================================

export async function getEvents(category?: string, isLive?: boolean) {
  try {
    let query = supabase.from('events').select('*');

    if (category) {
      query = query.eq('category', category);
    }

    if (isLive !== undefined) {
      query = query.eq('is_live', isLive);
    }

    const { data, error } = await query.eq('status', 'upcoming').order('start_time', { ascending: true });

    if (error) throw error;
    return data;
  } catch (error: any) {
    return [];
  }
}

export async function getEventDetails(eventId: string) {
  try {
    const { data, error } = await supabase
      .from('events')
      .select(
        `
      *,
      markets (
        *,
        market_selections (*)
      )
    `,
      )
      .eq('id', eventId)
      .single();

    if (error) throw error;
    return data;
  } catch (error: any) {
    return null;
  }
}

// ============================================================================
// TRANSACTIONS
// ============================================================================

export async function createTransaction(transactionData: {
  userId: string;
  type: string;
  amount: number;
  description?: string;
  paymentMethodId?: string;
  status?: string;
}) {
  try {
    const referenceNumber = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const { data, error } = await supabase.from('transactions').insert({
      user_id: transactionData.userId,
      transaction_type: transactionData.type,
      amount: transactionData.amount,
      description: transactionData.description,
      payment_method_id: transactionData.paymentMethodId,
      reference_number: referenceNumber,
      transaction_status: transactionData.status || 'pending',
      currency: 'INR',
    });

    if (error) throw error;
    return { success: true, transaction: data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getUserTransactions(userId: string) {
  try {
    const { data, error } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);

    if (error) throw error;
    return data;
  } catch (error: any) {
    return [];
  }
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export async function createNotification(notificationData: {
  userId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
}) {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: notificationData.userId,
      notification_type: notificationData.type,
      title: notificationData.title,
      message: notificationData.message,
      action_url: notificationData.actionUrl,
      channel: 'in_app',
    });

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getUserNotifications(userId: string) {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    return data;
  } catch (error: any) {
    return [];
  }
}

export async function markNotificationAsRead(notificationId: string) {
  try {
    const { error } = await supabase.from('notifications').update({ is_read: true, read_at: new Date() }).eq('id', notificationId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Get live stats for dashboard
export async function supabaseGetStats() {
  try {
    // Get count of active users (last login in last 24 hours)
    const { count: onlineUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gt('last_login', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Get highest multiplier from completed bets
    const { data: topBet } = await supabase
      .from('bets')
      .select('win_amount')
      .eq('bet_status', 'settled')
      .order('win_amount', { ascending: false })
      .limit(1)
      .single();

    // Get total paid out
    const { data: totalPaid } = await supabase
      .from('transactions')
      .select('net_amount')
      .eq('transaction_type', 'bet_won')
      .eq('transaction_status', 'completed');

    const paidOut = totalPaid?.reduce((sum, t) => sum + (t.net_amount || 0), 0) || 0;
    const topWin = topBet?.win_amount || 0;

    return {
      onlineUsers: onlineUsers || 0,
      topWin: topWin / 100 || 2.5, // Convert to multiplier
      paidOut: paidOut || 0,
    };
  } catch (error: any) {
    console.error('[v0] Error fetching stats:', error);
    return {
      onlineUsers: 0,
      topWin: 0,
      paidOut: 0,
    };
  }
}
