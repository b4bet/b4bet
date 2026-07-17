import { supabase } from '../integrations/supabase/client';
import { cms } from './cms';
import type { DepositRequest, WithdrawalRequest } from './cms';

// ---- Stats ----
export async function supabaseGetStats(): Promise<{ onlineUsers: number; topWin: number; paidOut: number }> {
  try {
    const profiles = await supabaseGetUsers();
    const txns = await supabaseGetTransactions();
    const topWin = txns.reduce((max, t) => Math.max(max, t.win_amount ?? 0), 0);
    const totalPaidOut = txns
      .filter((t: SupabaseTransaction) => t.type === 'withdrawal' && t.status === 'completed')
      .reduce((sum: number, r: SupabaseTransaction) => sum + (r.amount || 0), 0);
    return {
      onlineUsers: profiles.length,
      topWin,
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
    const { data, error } = await supabase.rpc('admin_get_profiles');
    if (error) throw error;
    return (data ?? []) as SupabaseProfile[];
  } catch (e) {
    console.error('[supabase] getUsers error:', e);
    return [];
  }
}

export async function supabaseUpdateBalance(userId: string, newBalance: number): Promise<void> {
  const { error } = await supabase.rpc('admin_update_balance', {
    p_user_id: userId,
    p_balance: newBalance,
  });
  if (error) throw error;
}

export async function supabaseToggleAdmin(userId: string, isAdmin: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_toggle_user_admin', {
    p_user_id: userId,
    p_is_admin: isAdmin,
  });
  if (error) throw error;
}

// ---- Transactions (Deposits & Withdrawals) ----
export interface SupabaseTransaction {
  id: string;
  user_id: string | null;
  type: string;
  amount: number;
  win_amount?: number;
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
    const { data, error } = await supabase.rpc('admin_get_transactions', { p_limit: 500 });
    if (error) throw error;
    return (data ?? []) as SupabaseTransaction[];
  } catch (e) {
    console.error('[supabase] getTransactions error:', e);
    return [];
  }
}

export async function supabaseUpdateTransactionStatus(txnId: string, status: string): Promise<void> {
  const { error } = await supabase.rpc('admin_update_transaction_status', {
    p_txn_id: txnId,
    p_status: status,
  });
  if (error) throw error;
}

// ---- Sync transactions → cms finance ----
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
    const { data, error } = await supabase.rpc('admin_get_staff');
    if (error) throw error;
    return (data ?? []) as SupabaseStaff[];
  } catch (e) {
    console.error('[supabase] getStaff error:', e);
    return [];
  }
}

// ---- Staff Login via Supabase RPC (bypasses RLS) ----
export async function supabaseStaffLogin(
  email: string,
  passwordHash: string
): Promise<SupabaseStaff | null> {
  try {
    const { data, error } = await supabase.rpc('admin_staff_login', {
      p_email: email,
      p_password_hash: passwordHash,
    });
    if (error || !data || (data as SupabaseStaff[]).length === 0) return null;
    return (data as SupabaseStaff[])[0];
  } catch (e) {
    console.error('[supabase] staffLogin error:', e);
    return null;
  }
}

// ---- Create Staff ----
export async function supabaseCreateStaff(
  email: string,
  name: string,
  role: string,
  passwordHash: string,
  permissions: Record<string, boolean>
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('admin_create_staff', {
      p_email: email,
      p_name: name,
      p_role: role,
      p_password_hash: passwordHash,
      p_permissions: permissions,
    });
    if (error) throw error;
    return data as string;
  } catch (e) {
    console.error('[supabase] createStaff error:', e);
    return null;
  }
}

// ---- Update Staff Password ----
export async function supabaseUpdateStaffPassword(staffId: string, passwordHash: string): Promise<void> {
  const { error } = await supabase.rpc('admin_update_staff_password', {
    p_staff_id: staffId,
    p_password_hash: passwordHash,
  });
  if (error) throw error;
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
    const { data, error } = await supabase.rpc('admin_get_settings');
    if (error) throw error;
    return (data ?? []) as SupabaseSetting[];
  } catch (e) {
    console.error('[supabase] getSettings error:', e);
    return [];
  }
}

export async function supabaseUpdateSetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabase.rpc('admin_update_setting', {
    p_key: key,
    p_value: value,
  });
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
    const { data, error } = await supabase.rpc('admin_get_banners');
    if (error) throw error;
    return (data ?? []) as SupabaseBanner[];
  } catch (e) {
    console.error('[supabase] getBanners error:', e);
    return [];
  }
}

export async function supabaseUpsertBanner(banner: {
  id?: string;
  title: string;
  image_url: string;
  link_url?: string | null;
  sort_order?: number;
  is_active?: boolean;
}): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('admin_upsert_banner', {
      p_id: banner.id ?? null,
      p_title: banner.title,
      p_image_url: banner.image_url,
      p_link_url: banner.link_url ?? null,
      p_sort_order: banner.sort_order ?? 0,
      p_is_active: banner.is_active ?? true,
    });
    if (error) throw error;
    return data as string;
  } catch (e) {
    console.error('[supabase] upsertBanner error:', e);
    return null;
  }
}

export async function supabaseDeleteBanner(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_banner', { p_id: id });
  if (error) throw error;
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
    const { data, error } = await supabase.rpc('admin_get_tickets');
    if (error) throw error;
    return (data ?? []) as SupabaseTicket[];
  } catch (e) {
    console.error('[supabase] getTickets error:', e);
    return [];
  }
}

export async function supabaseUpdateTicketStatus(ticketId: string, status: string): Promise<void> {
  const { error } = await supabase.rpc('admin_update_ticket_status', {
    p_ticket_id: ticketId,
    p_status: status,
  });
  if (error) throw error;
}

// ---- Bets History ----
export interface SupabaseBet {
  id: string;
  user_id: string | null;
  game_id: string | null;
  round_id: string | null;
  bet_amount: number;
  bet_details: Record<string, unknown>;
  win_amount: number;
  multiplier: number;
  status: string;
  placed_at: string;
  resolved_at: string | null;
}

export async function supabaseGetBets(): Promise<SupabaseBet[]> {
  try {
    const { data, error } = await supabase.rpc('admin_get_bets', { p_limit: 200 });
    if (error) throw error;
    return (data ?? []) as SupabaseBet[];
  } catch (e) {
    console.error('[supabase] getBets error:', e);
    return [];
  }
}
