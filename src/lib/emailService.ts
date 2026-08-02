// Email service — calls the send-email Supabase Edge Function
// Supports sending by email address (to) or by userId (server resolves email securely)
import { supabase } from '@/integrations/supabase/client';

type EmailType = 'welcome' | 'depositSuccess' | 'withdrawalStatus' | 'forgotPassword';

// Per-email-type enabled/disabled state. Loaded from Supabase settings key 'email_enabled'.
// Defaults to all enabled.
const emailEnabled: Record<EmailType, boolean> = {
  welcome: true,
  depositSuccess: true,
  withdrawalStatus: true,
  forgotPassword: true,
};

export function setEmailEnabled(type: EmailType, enabled: boolean) {
  emailEnabled[type] = enabled;
}

export function getEmailEnabled(): Record<EmailType, boolean> {
  return { ...emailEnabled };
}

async function sendEmail(
  type: EmailType,
  recipient: { to: string } | { userId: string },
  variables: Record<string, string>,
): Promise<void> {
  // Respect the on/off toggle set by admin
  if (!emailEnabled[type]) return;

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string || '';
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string || '';
    if (!supabaseUrl) return;

    const { data: { session } } = await supabase.auth.getSession();
    const authHeader = session?.access_token ? `Bearer ${session.access_token}` : `Bearer ${anonKey}`;

    const body = { type, variables, ...(('to' in recipient) ? { to: recipient.to } : { userId: recipient.userId }) };

    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': authHeader,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json() as { ok: boolean; error?: string };
    if (!json.ok) {
      console.warn(`[email] ${type} failed:`, json.error);
    }
  } catch (e) {
    console.warn('[email] send error:', e);
  }
}

export const emailService = {
  /** Send welcome email after signup. recipient = email address */
  sendWelcome(to: string, username: string): void {
    void sendEmail('welcome', { to }, {
      username,
      site_name: 'B4BeT',
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
    });
  },

  /** Send deposit status email. Looks up email server-side from userId */
  sendDepositEmail(userId: string, username: string, amount: string, balance: string, txnId: string, status = 'approved'): void {
    void sendEmail('depositSuccess', { userId }, {
      username, amount, balance, txn_id: txnId, status,
      date: new Date().toLocaleString('en-IN'),
    });
  },

  /** Send withdrawal status email. Looks up email server-side from userId */
  sendWithdrawalEmail(userId: string, username: string, amount: string, status: string, txnId: string, utr?: string, destination?: string): void {
    void sendEmail('withdrawalStatus', { userId }, {
      username, amount, status, txn_id: txnId,
      utr: utr ?? '',
      destination: destination ?? '',
      date: new Date().toLocaleString('en-IN'),
    });
  },

  /** Send forgot password / reset link email */
  sendForgotPassword(to: string, username: string, resetLink: string, otp?: string, ipAddress?: string): void {
    void sendEmail('forgotPassword', { to }, {
      username,
      reset_link: resetLink,
      otp: otp ?? '',
      expiry: '30 minutes',
      site_name: 'B4BeT',
      ip_address: ipAddress ?? '',
      date: new Date().toLocaleString('en-IN'),
    });
  },
};
