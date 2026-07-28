// Email service — calls the send-email Supabase Edge Function
// Reads SMTP config from Supabase settings at send time (no env vars needed in frontend)
import { supabase } from '@/integrations/supabase/client';

type EmailType = 'welcome' | 'depositSuccess' | 'withdrawalStatus';

async function sendEmail(
  type: EmailType,
  to: string,
  variables: Record<string, string>,
): Promise<void> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string || '';
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string || '';

    if (!supabaseUrl || !to) return;

    // Get current session token for auth
    const { data: { session } } = await supabase.auth.getSession();
    const authHeader = session?.access_token ? `Bearer ${session.access_token}` : `Bearer ${anonKey}`;

    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': authHeader,
      },
      body: JSON.stringify({ type, to, variables }),
    });

    const json = await res.json() as { ok: boolean; error?: string; message?: string };
    if (!json.ok) {
      // Silent fail — email errors should not break the UI
      console.warn(`[email] ${type} to ${to} failed:`, json.error);
    }
  } catch (e) {
    console.warn('[email] send error:', e);
  }
}

export const emailService = {
  /**
   * Send welcome email after user signup.
   * Variables: username, date
   */
  sendWelcome(to: string, username: string): void {
    void sendEmail('welcome', to, {
      username,
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
    });
  },

  /**
   * Send deposit status email.
   * Variables: username, amount, balance, txn_id
   */
  sendDepositEmail(to: string, username: string, amount: string, balance: string, txnId: string): void {
    void sendEmail('depositSuccess', to, {
      username,
      amount,
      balance,
      txn_id: txnId,
    });
  },

  /**
   * Send withdrawal status email.
   * Variables: username, amount, status, txn_id
   */
  sendWithdrawalEmail(to: string, username: string, amount: string, status: string, txnId: string): void {
    void sendEmail('withdrawalStatus', to, {
      username,
      amount,
      status,
      txn_id: txnId,
    });
  },
};
