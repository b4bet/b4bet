import { supabase } from '../integrations/supabase/client';
import { cms } from './cms';
import type { DepositRequest, WithdrawalRequest } from './cms';

// ---- Stats ----
export async function supabaseGetStats(): Promise<{ onlineUsers: number; topWin: number; paidOut: number }> {
  try {
    const { count: onlineUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { data: topWin } = await supabase.from('bets').select('win_amount').order('win_amount', { ascending: false }).limit(1);
    const { data: paidOut } = await supabase.from('transactions').select('amount').eq('type', 'withdrawal').eq('status', 'approved');
    const totalPaidOut = paidOut ? paidOut.reduce((sum: number, r: { amount: number }) => sum + (r.amount || 0), 0) : 0;
    return {
      onlineUsers: onlineUsers ?? 0,
      topWin: topWin?.[0]?.win_amount ?? 0,
      paidOut: totalPaidOut,
    };
  } catch {
    return { onlineUsers: 0, topWin: 0, paidOut: 0 };
  }
}

export async function loginUser(email: string, password: string) {
  return await supabase.auth.signInWithPassword({ email, password });
}

// ---- Users ----
export interface SupabaseProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  balance: number;
  total_deposit: number;
  total_withdrawal: number;
  vip_level: number;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  email?: string;
}

export async function supabaseGetUsers(): Promise<SupabaseProfile[]> {
  try {
    // Get profiles joined with auth.users email via RPC or direct query
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SupabaseProfile[];
  } catch (e) {
    console.error('[supabase] getUsers error:', e);
    return [];
  }
}

export async function supabaseUpdateBalance(userId: string, newBalance: number): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

export async function supabaseToggleAdmin(userId: string, isAdmin: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_admin: isAdmin, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

// ---- Transactions (Deposits & Withdrawals) ----
export interface SupabaseTransaction {
  id: string;
  user_id: string | null;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference: string | null;
  metadata: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function supabaseGetTransactions(): Promise<SupabaseTransaction[]> {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as SupabaseTransaction[];
  } catch (e) {
    console.error('[supabase] getTransactions error:', e);
    return [];
  }
}

export async function supabaseUpdateTransactionStatus(txnId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', txnId);
  if (error) throw error;
}

// ---- Sync transactions → cms finance ----
// Maps Supabase transactions into the DepositRequest / WithdrawalRequest shape
// that cms + FinanceTab / RequestsTab expect, then emits Finance bus event.
export async function syncTransactionsToCms(): Promise<void> {
  try {
    const txns = await supabaseGetTransactions();

    const deposits: DepositRequest[] = txns
      .filter((t) => t.type === 'deposit')
      .map((t) => ({
        id: t.id,
        user: t.user_id ?? 'unknown',
        userId: t.user_id ?? undefined,
        amount: t.amount,
        method: (t.metadata as { method?: string })?.method ?? 'bank',
        utr: (t.metadata as { utr?: string })?.utr,
        details: (t.metadata as { details?: string })?.details,
        reason: (t.metadata as { reason?: string })?.reason,
        status: mapStatus(t.status),
        ts: new Date(t.created_at).getTime(),
      }));

    const withdrawals: WithdrawalRequest[] = txns
      .filter((t) => t.type === 'withdrawal')
      .map((t) => ({
        id: t.id,
        user: t.user_id ?? 'unknown',
        userId: t.user_id ?? undefined,
        amount: t.amount,
        method: (t.metadata as { method?: string })?.method ?? 'bank',
        account: (t.metadata as { account?: string })?.account,
        details: (t.metadata as { details?: string })?.details,
        reason: (t.metadata as { reason?: string })?.reason,
        status: mapStatus(t.status),
        ts: new Date(t.created_at).getTime(),
      }));

    // Directly set cms internal arrays and emit
    (cms as unknown as { deposits: DepositRequest[] }).deposits = deposits;
    (cms as unknown as { withdrawals: WithdrawalRequest[] }).withdrawals = withdrawals;
    (cms as unknown as { emitFinance: () => void }).emitFinance();
  } catch (e) {
    console.error('[supabase] syncTransactionsToCms error:', e);
  }
}

function mapStatus(s: string): 'pending' | 'processing' | 'approved' | 'rejected' | 'cancelled' {
  if (s === 'completed') return 'approved';
  if (s === 'failed') return 'rejected';
  if (s === 'pending') return 'pending';
  if (s === 'processing') return 'processing';
  if (s === 'cancelled') return 'cancelled';
  return 'pending';
}

// ---- Staff ----
export interface SupabaseStaff {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: Record<string, boolean>;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export async function supabaseGetStaff(): Promise<SupabaseStaff[]> {
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('id,email,name,role,is_active,permissions,last_login_at,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SupabaseStaff[];
  } catch (e) {
    console.error('[supabase] getStaff error:', e);
    return [];
  }
}

// ---- Staff Login via Supabase staff table ----
// Returns staff record if credentials match, null otherwise.
export async function supabaseStaffLogin(
  email: string,
  passwordHash: string
): Promise<SupabaseStaff | null> {
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('id,email,name,role,permissions,is_active,last_login_at,created_at,password_hash')
      .eq('email', email)
      .eq('is_active', true)
      .single();
    if (error || !data) return null;
    const record = data as SupabaseStaff & { password_hash: string };
    if (record.password_hash !== passwordHash) return null;
    // Update last_login_at
    await supabase
      .from('staff')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', record.id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash: _ph, ...safe } = record;
    return safe as SupabaseStaff;
  } catch (e) {
    console.error('[supabase] staffLogin error:', e);
    return null;
  }
}

// ---- Settings ----
export interface SupabaseSetting {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

export async function supabaseGetSettings(): Promise<SupabaseSetting[]> {
  try {
    const { data, error } = await supabase.from('settings').select('*').order('key');
    if (error) throw error;
    return (data ?? []) as SupabaseSetting[];
  } catch (e) {
    console.error('[supabase] getSettings error:', e);
    return [];
  }
}

export async function supabaseUpdateSetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key);
  if (error) throw error;
}

// ---- Banners ----
export interface SupabaseBanner {
  id: string;
  title: string;
  image_url: string;
  link_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export async function supabaseGetBanners(): Promise<SupabaseBanner[]> {
  try {
    const { data, error } = await supabase.from('banners').select('*').order('sort_order');
    if (error) throw error;
    return (data ?? []) as SupabaseBanner[];
  } catch (e) {
    console.error('[supabase] getBanners error:', e);
    return [];
  }
}

// ---- Support Tickets ----
export interface SupabaseTicket {
  id: string;
  user_id: string | null;
  subject: string;
  message: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

export async function supabaseGetTickets(): Promise<SupabaseTicket[]> {
  try {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as SupabaseTicket[];
  } catch (e) {
    console.error('[supabase] getTickets error:', e);
    return [];
  }
}

export async function supabaseUpdateTicketStatus(ticketId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('support_tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', ticketId);
  if (error) throw error;
}
