// CMS – Supabase-backed admin-managed runtime content.
// ALL data (deposits, withdrawals, tickets, payment methods, users, banners, staff)
// is loaded from and persisted to Supabase on every action.

import { supabase } from '@/integrations/supabase/client';
import { bus, Topics } from './bus';
import { store } from './store';
import { auth } from './auth';
import { emailService } from './emailService';
import type { AuthUser } from './auth';

// ---- Types ----
export interface BannerSlide {
  id: string; imageDataUrl: string; imageUrl?: string; linkUrl: string;
}
export interface DepositRequest {
  id: string; user: string; userId?: string; amount: number; method: string;
  utr?: string; details?: string; reason?: string;
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'cancelled'; ts: number;
}
export interface WithdrawalRequest {
  id: string; user: string; userId?: string; amount: number; destination: string;
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'cancelled';
  utr?: string; reason?: string; details?: string; ts: number;
}
export interface SupportMessage { id: string; from: string; body: string; ts: number; read: boolean; }
export type StaffRole = 'support' | 'finance';
export type PermissionKey =
  | 'finance' | 'banner' | 'deposit' | 'emails' | 'staff' | 'marketing'
  | 'algos' | 'users' | 'smtp' | 'currencies' | 'crm' | 'intercom' | 'notify'
  | 'gateways' | 'tickets' | 'history' | 'withdrawals' | 'redeem'
  | 'gameSettings' | 'paymentMethods' | 'dynamicPages' | 'ban' | 'notifyManager'
  | 'requests' | 'affiliates';
export const ALL_PERMISSIONS: PermissionKey[] = [
  'finance','banner','deposit','emails','staff','marketing',
  'algos','users','smtp','currencies','crm','intercom','notify',
  'gateways','tickets','history','withdrawals','redeem',
  'gameSettings','paymentMethods','dynamicPages','ban','notifyManager',
  'requests','affiliates',
];
export interface StaffAccount {
  id: string; name: string; password: string; role: StaffRole; online: boolean;
  email?: string; permissions: Partial<Record<PermissionKey, boolean>>; isOwner?: boolean;
}
export interface AdminUser {
  id: string; username: string; displayName?: string; phone?: string;
  balance: number; totalDeposit: number; totalWithdrawal: number;
  vipLevel: number; isAdmin: boolean; createdAt: string;
}
export interface Country { id: string; name: string; code: string; isActive: boolean; currency: string; manualDepositMethods: string[]; manualWithdrawalMethods: string[]; }
export interface ReferralConfig { rewardAmount: number; minDeposit: number; tierPercent: number; tierThreshold: number; model?: string; cpaAmount?: number; revSharePercent?: number; }
export interface Referral {
  id: string; referrerId: string; referredUserId: string; referredUsername: string;
  depositAmount: number; firstDepositApproved: boolean;
  rewardPaid: boolean; rewardCredited: boolean;
  rewardAmount: number; createdAt: number; paidAt?: number; ts: number;
}
export interface AffiliateApplication {
  id: string; userId: string; username: string; email: string;
  telegram: string; trafficSource: string; estimatedTraffic: string;
  status: 'pending' | 'approved' | 'rejected'; revSharePct: number;
  stats: { clicks: number; registered: number; deposits: number; revenueShare: number }; ts: number;
}
export interface AutoGateway { id: string; name: string; secretKey: string; publicKey: string; merchantId: string; webhookUrl: string; minDeposit: number; maxDeposit: number; countries: Record<string, boolean>; }
export interface CryptoCurrency { id: string; name: string; network: string; walletAddress: string; gasFee: number; minDeposit: number; maxDeposit: number; minWithdrawal: number; maxWithdrawal: number; }
export type ManualMethodKind = 'bank' | 'upi' | 'qr' | 'custom' | 'crypto';
export type ManualMethodFlow = 'deposit' | 'withdrawal';
export interface ManualMethod {
  id: string; kind: ManualMethodKind; flow: ManualMethodFlow; label: string; active: boolean;
  minAmount: number; maxAmount: number;
  accountNumber?: string; bankName?: string; ifsc?: string; holderName?: string;
  upiId?: string; upiDisplayName?: string; qrDataUrl?: string;
  cryptoCurrencies?: CryptoCurrency[]; html?: string; customData?: string;
  countries: Record<string, boolean>;
}
export interface TicketAttachment { kind: 'image' | 'pdf'; dataUrl: string; name: string; }
export interface TicketMessage { id: string; role: 'user' | 'agent'; agentId?: string; body: string; ts: number; attachments?: TicketAttachment[]; }
export type TicketStatus = 'unassigned' | 'assigned' | 'closed';
export interface SupportTicket {
  id: string; accountId: string; status: TicketStatus;
  assignedStaffId: string | null; messages: TicketMessage[];
  createdTs: number; lastUserMsgTs: number; acknowledged: boolean;
}
export interface StaffDM { id: string; fromId: string; toId: string; body: string; ts: number; read: boolean; }
export interface EmailTemplates { welcome: string; depositSuccess: string; withdrawalStatus: string; forgotPassword: string; }
export interface SmtpConfig { host: string; port: string; user: string; pass: string; tls: boolean; active: boolean; }
export interface DynamicPage { id: string; title: string; html: string; ts: number; }
export interface ToastEvent { id: string; title: string; body: string; kind: 'info' | 'success' | 'warn' | 'alert'; }
export type NotificationTemplateKind = 'info' | 'success' | 'warn' | 'alert';
export interface NotificationTemplate { id: string; title: string; body: string; kind: NotificationTemplateKind; isActive: boolean; isAutoGenerated: boolean; createdAt: number; }

// ---- Defaults ----
const defaultBanners: BannerSlide[] = [
  { id: 'b1', imageDataUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="%23b15eff"/><stop offset="1" stop-color="%2300ff88"/></linearGradient></defs><rect width="800" height="300" fill="url(%23g)"/><text x="40" y="160" fill="white" font-family="Inter" font-size="48" font-weight="800">Welcome Bonus ₹15,000</text></svg>'), linkUrl: 'https://b4bet.com/promo/welcome' },
];
const defaultDepositHtml = `<div style="font-family:Inter,sans-serif;padding:16px;background:#0f1225;color:#fff;border-radius:14px"><h2 style="margin:0 0 8px;color:#00ff88">Manual UPI Deposit</h2><p style="margin:0 0 8px">1. Scan the UPI QR above with any UPI app.</p><p style="margin:0 0 8px">2. Pay the exact amount you entered.</p><p style="margin:0">3. Submit the UTR / Transaction ID below for credit.</p></div>`;
const defaultUpiQr = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="white"/><g fill="black"><rect x="10" y="10" width="60" height="60"/><rect x="20" y="20" width="40" height="40" fill="white"/><rect x="30" y="30" width="20" height="20"/><rect x="130" y="10" width="60" height="60"/><rect x="140" y="20" width="40" height="40" fill="white"/><rect x="150" y="30" width="20" height="20"/><rect x="10" y="130" width="60" height="60"/><rect x="20" y="140" width="40" height="40" fill="white"/><rect x="30" y="150" width="20" height="20"/><rect x="90" y="90" width="20" height="20"/><rect x="120" y="120" width="10" height="10"/><rect x="140" y="100" width="10" height="10"/></g></svg>');

const defaultEmails: EmailTemplates = {
  welcome: '<div style="font-family:Inter,sans-serif;background:#0a0f1c;color:#fff;padding:24px;border-radius:12px"><h1 style="margin:0 0 16px;color:#00ff88;font-size:28px">Welcome to B4BeT, {{username}}!</h1><p style="margin:0 0 12px;font-size:16px">Your account is now live and ready to play.</p><p style="margin:0 0 12px;font-size:14px">Enjoy our exclusive games, live betting, and amazing rewards.</p><p style="margin:0;font-size:14px;color:#a0aec0">Start playing now and claim your welcome bonus on your first deposit!</p></div>',
  depositSuccess: `<div style="font-family:Inter,sans-serif;background:#0a0f1c;color:#fff;padding:0;border-radius:12px;overflow:hidden;max-width:520px">
  <div style="background:linear-gradient(135deg,#00c97a,#00ff88);padding:28px 24px;text-align:center">
    <div style="font-size:48px;margin-bottom:8px">&#x2705;</div>
    <h1 style="margin:0;font-size:26px;font-weight:800;color:#0a0f1c;letter-spacing:-0.5px">Deposit Successful!</h1>
    <p style="margin:6px 0 0;font-size:14px;color:#065f46">Your payment has been received and credited.</p>
  </div>
  <div style="padding:24px">
    <p style="margin:0 0 16px;font-size:15px">Hi <strong>{{username}}</strong>,</p>
    <p style="margin:0 0 16px;font-size:15px">Your deposit of <strong style="color:#00ff88;font-size:18px">{{amount}}</strong> has been <strong>successfully</strong> added to your B4BeT wallet.</p>
    <div style="background:#151d35;border-radius:10px;padding:16px;margin:0 0 16px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#a0aec0;font-size:13px">Amount Deposited</span>
        <span style="color:#00ff88;font-weight:700">{{amount}}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#a0aec0;font-size:13px">New Balance</span>
        <span style="color:#fff;font-weight:700">{{balance}}</span>
      </div>
      <div style="border-top:1px solid #2d3748;padding-top:8px;margin-top:4px">
        <span style="color:#718096;font-size:12px">Transaction ID: {{txn_id}}</span>
      </div>
    </div>
    <p style="margin:0;font-size:13px;color:#718096;text-align:center">Thank you for choosing B4BeT. Good luck!</p>
  </div>
</div>`,
  withdrawalStatus: `<div style="font-family:Inter,sans-serif;background:#0a0f1c;color:#fff;padding:0;border-radius:12px;overflow:hidden;max-width:520px">
  <div style="background:linear-gradient(135deg,#00c97a,#00ff88);padding:28px 24px;text-align:center">
    <div style="font-size:48px;margin-bottom:8px">&#x1F4B8;</div>
    <h1 style="margin:0;font-size:26px;font-weight:800;color:#0a0f1c;letter-spacing:-0.5px">Withdrawal Successful!</h1>
    <p style="margin:6px 0 0;font-size:14px;color:#065f46">Your payout has been processed successfully.</p>
  </div>
  <div style="padding:24px">
    <p style="margin:0 0 16px;font-size:15px">Hi <strong>{{username}}</strong>,</p>
    <p style="margin:0 0 16px;font-size:15px">Your withdrawal of <strong style="color:#00ff88;font-size:18px">{{amount}}</strong> has been <strong>successfully</strong> processed and sent to your account.</p>
    <div style="background:#151d35;border-radius:10px;padding:16px;margin:0 0 16px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#a0aec0;font-size:13px">Amount Withdrawn</span>
        <span style="color:#00ff88;font-weight:700">{{amount}}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#a0aec0;font-size:13px">Status</span>
        <span style="color:#00ff88;font-weight:700">&#x2713; Successful</span>
      </div>
      <div style="border-top:1px solid #2d3748;padding-top:8px;margin-top:4px">
        <span style="color:#718096;font-size:12px">Transaction ID: {{txn_id}}</span>
      </div>
    </div>
    <p style="margin:0;font-size:13px;color:#718096;text-align:center">Funds typically arrive within 1-24 hours depending on your bank.</p>
  </div>
</div>`,
  forgotPassword: '<div style="font-family:Inter,sans-serif;padding:24px;background:#0a0f1c;color:#fff;border-radius:12px"><h2 style="color:#00ff88">Password Reset Request</h2><p>Hi {{username}},</p><p>Aapne password reset request ki hai. Neeche diye link par click karein:</p><p><a href="{{reset_link}}" style="background:#00ff88;color:#000;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin:8px 0">Reset Password</a></p><p style="color:#a0aec0;font-size:12px">Yeh link {{expiry}} me expire ho jayega.</p><p style="color:#a0aec0;font-size:12px">Agar aapne yeh request nahi ki toh ignore karein. Request IP: {{ip_address}}</p></div>',
};

// ---- Helpers ----
function mapSupabaseStaff(row: Record<string, unknown>): StaffAccount {
  const roleStr = row.role as string;
  const isOwner = roleStr === 'super_admin';
  const role: StaffRole = (roleStr === 'super_admin' || roleStr === 'admin') ? 'finance' : 'support';
  const perms: Partial<Record<PermissionKey, boolean>> = isOwner
    ? Object.fromEntries(ALL_PERMISSIONS.map(k => [k, true]))
    : ((row.permissions as Partial<Record<PermissionKey, boolean>>) ?? {});
  return { id: row.id as string, name: row.name as string, email: row.email as string, password: '', role, online: false, permissions: perms, isOwner };
}

function mapTxToDeposit(row: Record<string, unknown>): DepositRequest {
  const meta = (row.metadata as Record<string, unknown>) ?? {};
  return {
    id: row.id as string,
    userId: row.user_id as string,
    user: (meta.username as string) || (row.reference as string) || 'Unknown',
    amount: Number(row.amount),
    method: (meta.method as string) || 'Manual',
    utr: meta.utr as string | undefined,
    details: meta.details as string | undefined,
    reason: meta.reason as string | undefined,
    status: (row.status as DepositRequest['status']) || 'pending',
    ts: new Date(row.created_at as string).getTime(),
  };
}

function mapTxToWithdrawal(row: Record<string, unknown>): WithdrawalRequest {
  const meta = (row.metadata as Record<string, unknown>) ?? {};
  return {
    id: row.id as string,
    userId: row.user_id as string,
    user: (meta.username as string) || (row.reference as string) || 'Unknown',
    amount: Number(row.amount),
    destination: (meta.destination as string) || (meta.upi_id as string) || '',
    utr: meta.utr as string | undefined,
    reason: meta.reason as string | undefined,
    details: meta.details as string | undefined,
    status: (row.status as WithdrawalRequest['status']) || 'pending',
    ts: new Date(row.created_at as string).getTime(),
  };
}

function mapTicket(row: Record<string, unknown>): SupportTicket {
  const rawMsgs = row.messages as Array<Record<string, unknown>> | null;
  const messages: TicketMessage[] = rawMsgs && rawMsgs.length > 0
    ? rawMsgs.map(m => ({
        id: (m.id as string) || Math.random().toString(36).slice(2),
        role: (m.sender_type as string) === 'staff' ? 'agent' : 'user',
        agentId: m.sender_type === 'staff' ? (m.sender_id as string | undefined) : undefined,
        body: (m.message as string) || '',
        ts: m.created_at ? new Date(m.created_at as string).getTime() : Date.now(),
      }))
    : [{
        id: (row.id as string) + '_0',
        role: 'user' as const,
        body: (row.message as string) || '',
        ts: new Date(row.created_at as string).getTime(),
      }];
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  return {
    id: row.id as string,
    accountId: (row.account_id as string) || (row.user_id as string) || '',
    status: (row.status as string) === 'closed' ? 'closed' : (row.assigned_staff_id ? 'assigned' : 'unassigned'),
    assignedStaffId: (row.assigned_staff_id as string | null) ?? null,
    messages,
    createdTs: new Date(row.created_at as string).getTime(),
    lastUserMsgTs: lastUserMsg ? lastUserMsg.ts : new Date(row.created_at as string).getTime(),
    acknowledged: (row.status as string) !== 'open',
  };
}

function mapPaymentMethod(row: Record<string, unknown>): ManualMethod {
  const details = (row.account_details as Record<string, unknown>) ?? {};
  return {
    id: row.id as string,
    kind: (details.kind ?? row.method_type) as ManualMethodKind,
    flow: (details.flow ?? 'deposit') as ManualMethodFlow,
    label: (details.label as string) || (row.method_type as string),
    active: row.is_active as boolean,
    minAmount: Number(details.minAmount) || 0,
    maxAmount: Number(details.maxAmount) || 999999,
    accountNumber: details.accountNumber as string | undefined,
    bankName: details.bankName as string | undefined,
    ifsc: details.ifsc as string | undefined,
    holderName: details.holderName as string | undefined,
    upiId: details.upiId as string | undefined,
    upiDisplayName: details.upiDisplayName as string | undefined,
    qrDataUrl: details.qrDataUrl as string | undefined,
    cryptoCurrencies: details.cryptoCurrencies as CryptoCurrency[] | undefined,
    html: details.html as string | undefined,
    customData: details.customData as string | undefined,
    countries: (details.countries as Record<string, boolean>) ?? {},
  };
}

// Helper: wrap supabase rpc result in a real Promise so .catch() works correctly.
function rpc<T>(call: PromiseLike<T>): Promise<T> {
  return Promise.resolve(call);
}

// Statuses from which a withdrawal balance was already deducted (on submit).
const DEDUCTED_STATUSES = new Set<WithdrawalRequest['status']>(['pending', 'processing']);

const ADMIN_SESSION_KEY = 'b4bet.admin.session';

class Cms {
  banners: BannerSlide[] = defaultBanners;
  logoDataUrl: string | null = null;
  textLogoDataUrl: string | null = null;
  faviconDataUrl: string | null = null;
  upiQrDataUrl: string = defaultUpiQr;
  depositPageHtml: string = defaultDepositHtml;
  withdrawalPageHtml: string = `<div style="font-family:Inter,sans-serif;padding:16px;background:#0f1225;color:#fff;border-radius:14px"><h2 style="margin:0 0 8px;color:#ff5a5a">Manual UPI Withdrawal</h2><p style="margin:0 0 8px">1. Enter your UPI ID below.</p><p style="margin:0 0 8px">2. Request the amount you want to withdraw.</p><p style="margin:0">3. Admin will process and send the payout.</p></div>`;
  emailTemplates: EmailTemplates = { ...defaultEmails };
  smtpConfig: SmtpConfig = { host: 'smtp.b4bet.com', port: '587', user: 'noreply@b4bet.com', pass: '', tls: true, active: false };

  deposits: DepositRequest[] = [];
  withdrawals: WithdrawalRequest[] = [];
  support: SupportMessage[] = [];
  staff: StaffAccount[] = [];
  staffSessionId: string | null = null;
  staffDMs: StaffDM[] = [];
  adminUsers: AdminUser[] = [];

  countries: Country[] = [
    { id: 'c_in', name: 'India', code: 'IN', isActive: true, currency: '\u20b9', manualDepositMethods: ['UPI','IMPS'], manualWithdrawalMethods: ['UPI','Bank'] },
    { id: 'c_us', name: 'United States', code: 'US', isActive: false, currency: '$', manualDepositMethods: ['Wire'], manualWithdrawalMethods: ['Wire'] },
    { id: 'c_uk', name: 'United Kingdom', code: 'GB', isActive: true, currency: '\u00a3', manualDepositMethods: ['Bank'], manualWithdrawalMethods: ['Bank'] },
  ];
  detectedCountryId: string = 'c_in';
  referralConfig: ReferralConfig = { rewardAmount: 100, minDeposit: 500, tierPercent: 10, tierThreshold: 3 };
  autoGateways: AutoGateway[] = [];
  manualMethods: ManualMethod[] = [];
  tickets: SupportTicket[] = [];
  referrals: Referral[] = [];
  affiliates: AffiliateApplication[] = [];
  dynamicPages: DynamicPage[] = [];

  private _notificationTemplates: NotificationTemplate[] = [
    { id: 'nt_welcome', title: 'Welcome!', body: 'Account created. Welcome aboard!', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_login', title: 'Logged In', body: 'Welcome back! Your session is now active.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_logout', title: 'Logged Out', body: 'Your session has ended. See you next time!', kind: 'info', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_password_reset', title: 'Password Reset', body: 'Your password has been updated successfully.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_password_changed', title: 'Password Changed', body: 'Your password was updated successfully.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_deposit_ok', title: 'Deposit Confirmed', body: 'Your deposit has been approved.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_withdrawal_ok', title: 'Withdrawal Processed', body: 'Your withdrawal request has been processed.', kind: 'info', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_withdrawal_refunded', title: 'Withdrawal Refunded', body: 'Your withdrawal was rejected. Amount refunded to your wallet.', kind: 'warn', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_referral_reward', title: 'Referral Reward', body: 'You earned a bonus from a referral deposit!', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_pending_rewards', title: 'Pending Rewards Credited', body: 'Pending referral rewards have been added to your balance.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_redeem', title: 'Redeem Code Applied', body: 'Your promo code unlocked bonus credits.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_promo', title: 'Special Offer', body: 'Exclusive promo available! Check the promotions page.', kind: 'warn', isActive: false, isAutoGenerated: false, createdAt: Date.now() },
    { id: 'nt_profile_updated', title: 'Profile updated', body: 'Your contact info was saved.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_cashout_failed', title: 'Cashout failed', body: 'Your cashout could not be completed.', kind: 'warn', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_mines_failed', title: 'Mines failed', body: 'Your Mines action could not be completed.', kind: 'warn', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
  ];
  private static NOTIF_TEMPLATES_KEY = 'b4bet.cms.notifTemplates';

  constructor() {
    this.loadNotificationTemplatesFromLocalStorage();
    try {
      const savedId = localStorage.getItem(ADMIN_SESSION_KEY);
      if (savedId) this.staffSessionId = savedId;
    } catch { /* ignore */ }
    this.syncAllFromSupabase();
    this.startRealtimeSubscriptions();
  }

  private startRealtimeSubscriptions() {
    supabase.channel('cms_transactions').on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => { void this.syncTransactionsFromSupabase(); }).subscribe();
    supabase.channel('cms_profiles').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { void this.syncUsersFromSupabase(); }).subscribe();
    supabase.channel('cms_tickets').on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => { void this.syncTicketsFromSupabase(); }).subscribe();
    supabase.channel('cms_ticket_messages').on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_messages' }, () => { void this.syncTicketsFromSupabase(); }).subscribe();
    supabase.channel('cms_staff').on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, () => { void this.syncStaffFromSupabase(); }).subscribe();
    supabase.channel('cms_payment_methods').on('postgres_changes', { event: '*', schema: 'public', table: 'payment_methods' }, () => { void this.syncPaymentMethodsFromSupabase(); }).subscribe();
    supabase.channel('cms_banners').on('postgres_changes', { event: '*', schema: 'public', table: 'banners' }, () => { void this.syncBannersFromSupabase(); }).subscribe();
    supabase.channel('cms_settings').on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => { void this.syncSettingsFromSupabase(); }).subscribe();
    supabase.channel('cms_referrals').on('postgres_changes', { event: '*', schema: 'public', table: 'referrals' }, () => { void this.syncTransactionsFromSupabase(); }).subscribe();
  }

  async syncAllFromSupabase() {
    await Promise.all([
      this.syncBannersFromSupabase(), this.syncSettingsFromSupabase(), this.syncStaffFromSupabase(),
      this.syncTransactionsFromSupabase(), this.syncTicketsFromSupabase(),
      this.syncPaymentMethodsFromSupabase(), this.syncUsersFromSupabase(),
    ]);
  }

  private async syncBannersFromSupabase() {
    try {
      const { data } = await supabase.rpc('admin_get_banners');
      if (data && (data as Array<Record<string, unknown>>).length > 0) {
        this.banners = (data as Array<Record<string, unknown>>).map(b => ({ id: b.id as string, imageDataUrl: (b.image_url as string) || '', imageUrl: b.image_url as string, linkUrl: (b.link_url as string) || '' }));
        this.emitBanners();
      }
    } catch { /* use defaults */ }
  }

  private async syncSettingsFromSupabase() {
    try {
      const { data } = await supabase.rpc('admin_get_settings');
      if (!data) return;
      const rows = data as Array<{ key: string; value: unknown }>;
      const find = (k: string) => rows.find(r => r.key === k)?.value;

      const refBonus = find('referral_bonus');
      if (refBonus !== undefined && refBonus !== null) this.referralConfig.rewardAmount = refBonus as number;
      const refConfig = find('referral_config');
      if (refConfig !== undefined && refConfig !== null && typeof refConfig === 'object') this.referralConfig = { ...this.referralConfig, ...(refConfig as Partial<ReferralConfig>) };
      bus.emit(Topics.ReferralConfig, this.referralConfig);

      const logo = find('site_logo_data_url') as string | null;
      const textLogo = find('site_text_logo_data_url') as string | null;
      const favicon = find('site_favicon_data_url') as string | null;
      if (logo !== undefined) { this.logoDataUrl = logo; this.emitLogo(); }
      if (textLogo !== undefined) { this.textLogoDataUrl = textLogo; bus.emit(Topics.TextLogo, this.textLogoDataUrl); }
      if (favicon !== undefined) { this.faviconDataUrl = favicon; bus.emit(Topics.Favicon, this.faviconDataUrl); }

      const smtpHost = find('smtp_host') as string | undefined;
      const smtpPort = find('smtp_port') as string | undefined;
      const smtpUser = find('smtp_user') as string | undefined;
      const smtpPass = find('smtp_pass') as string | undefined;
      const smtpTls = find('smtp_tls');
      const smtpActive = find('smtp_active');
      if (smtpHost !== undefined) this.smtpConfig.host = smtpHost || this.smtpConfig.host;
      if (smtpPort !== undefined) this.smtpConfig.port = smtpPort || this.smtpConfig.port;
      if (smtpUser !== undefined) this.smtpConfig.user = smtpUser || this.smtpConfig.user;
      if (smtpPass !== undefined) this.smtpConfig.pass = smtpPass || '';
      if (smtpTls !== undefined && smtpTls !== null) this.smtpConfig.tls = smtpTls as boolean;
      if (smtpActive !== undefined && smtpActive !== null) this.smtpConfig.active = smtpActive as boolean;

      const dynPages = find('dynamic_pages');
      if (dynPages !== undefined && dynPages !== null && Array.isArray(dynPages)) { this.dynamicPages = dynPages as DynamicPage[]; this.emitDynamicPages(); }

      const emailTpls = find('email_templates');
      if (emailTpls !== undefined && emailTpls !== null && typeof emailTpls === 'object') { this.emailTemplates = { ...defaultEmails, ...(emailTpls as Partial<EmailTemplates>) }; this.emitEmails(); }

      const notifTpls = find('notification_templates');
      if (notifTpls !== undefined && notifTpls !== null && Array.isArray(notifTpls)) {
        const custom = notifTpls as NotificationTemplate[];
        const autoGen = this._notificationTemplates.filter(t => t.isAutoGenerated);
        const dbCustom = custom.filter(t => !t.isAutoGenerated);
        this._notificationTemplates = [...autoGen, ...dbCustom];
        this.emitNotificationTemplates();
      }
    } catch { /* ignore */ }
  }

  async syncStaffFromSupabase() {
    try {
      const { data, error } = await supabase.rpc('admin_get_staff');
      if (error) {
        const { data: data2, error: error2 } = await supabase.rpc('get_all_staff');
        if (error2) { console.warn('[cms] syncStaff error:', error2.message); return; }
        if (data2 && Array.isArray(data2)) { this.staff = (data2 as Array<Record<string, unknown>>).filter(r => r.is_active).map(mapSupabaseStaff); this.emitStaff(); }
        return;
      }
      if (data && Array.isArray(data)) { this.staff = (data as Array<Record<string, unknown>>).filter(r => r.is_active).map(mapSupabaseStaff); this.emitStaff(); }
    } catch (e) { console.warn('[cms] syncStaff failed:', e); }
  }

  async syncTransactionsFromSupabase() {
    try {
      const { data, error } = await supabase.rpc('admin_get_transactions', { p_limit: 500 });
      if (error) { console.warn('[cms] syncTransactions error:', error.message); return; }
      if (data && Array.isArray(data)) {
        const rows = data as Array<Record<string, unknown>>;
        this.deposits = rows.filter(r => r.type === 'deposit').map(mapTxToDeposit);
        this.withdrawals = rows.filter(r => r.type === 'withdrawal').map(mapTxToWithdrawal);
        this.emitFinance();
      }
    } catch (e) { console.warn('[cms] syncTransactions failed:', e); }
  }

  async syncTicketsFromSupabase() {
    try {
      const { data, error } = await supabase.rpc('admin_get_support_tickets');
      if (error) { console.warn('[cms] syncTickets error:', error.message); return; }
      if (data && Array.isArray(data)) { this.tickets = (data as Array<Record<string, unknown>>).map(mapTicket); this.emitTickets(); }
    } catch (e) { console.warn('[cms] syncTickets failed:', e); }
  }

  async syncPaymentMethodsFromSupabase() {
    try {
      const { data, error } = await supabase.rpc('admin_get_payment_methods');
      if (error) {
        const { data: rows2, error: err2 } = await supabase.from('payment_methods').select('*').eq('is_active', true);
        if (err2) { console.warn('[cms] syncPaymentMethods fallback error:', err2.message); return; }
        if (rows2 && Array.isArray(rows2)) { this.manualMethods = (rows2 as Array<Record<string, unknown>>).map(mapPaymentMethod); this.emitManual(); }
        return;
      }
      if (data && Array.isArray(data)) { this.manualMethods = (data as Array<Record<string, unknown>>).map(mapPaymentMethod); this.emitManual(); }
    } catch (e) { console.warn('[cms] syncPaymentMethods failed:', e); }
  }

  async syncUsersFromSupabase() {
    try {
      const { data, error } = await supabase.rpc('admin_get_users');
      if (error) { console.warn('[cms] syncUsers error:', error.message); return; }
      if (data && Array.isArray(data)) {
        this.adminUsers = (data as Array<Record<string, unknown>>).map(r => ({
          id: r.id as string, username: (r.username as string) || '',
          displayName: r.display_name as string | undefined, phone: r.phone as string | undefined,
          balance: Number(r.balance) || 0, totalDeposit: Number(r.total_deposit) || 0,
          totalWithdrawal: Number(r.total_withdrawal) || 0, vipLevel: Number(r.vip_level) || 0,
          isAdmin: Boolean(r.is_admin), createdAt: r.created_at as string,
        }));
        bus.emit(Topics.AdminUsers, this.adminUsers);
      }
    } catch (e) { console.warn('[cms] syncUsers failed:', e); }
  }

  private emitBanners() { bus.emit(Topics.Banners, this.banners); }
  private emitDynamicPages() { bus.emit(Topics.DynamicPages, this.dynamicPages); }
  private emitLogo() { bus.emit(Topics.Logo, this.logoDataUrl); }
  private emitUpi() { bus.emit(Topics.UpiQr, this.upiQrDataUrl); }
  private emitDepositHtml() { bus.emit(Topics.DepositHtml, this.depositPageHtml); }
  private emitWithdrawalHtml() { bus.emit(Topics.WithdrawalHtml, this.withdrawalPageHtml); }
  private emitEmails() { bus.emit(Topics.EmailTemplates, this.emailTemplates); }
  emitFinance() { bus.emit(Topics.Finance, { deposits: this.deposits, withdrawals: this.withdrawals }); }
  private emitSupport() { bus.emit(Topics.Support, this.support); }
  private emitStaff() { bus.emit(Topics.Staff, this.staff); }
  private emitDMs() { bus.emit(Topics.StaffDM, this.staffDMs); }
  private emitReferrals() { bus.emit(Topics.Referrals, this.referrals); }
  private emitTickets() { bus.emit(Topics.Tickets, this.tickets); }
  private emitGateways() { bus.emit(Topics.AutoGateways, this.autoGateways); }
  emitManual() { bus.emit(Topics.ManualMethods, this.manualMethods); }

  get notificationTemplates(): NotificationTemplate[] { return this._notificationTemplates; }

  private loadNotificationTemplatesFromLocalStorage() {
    try { const raw = localStorage.getItem(Cms.NOTIF_TEMPLATES_KEY); if (raw) this._notificationTemplates = JSON.parse(raw) as NotificationTemplate[]; } catch { /* ignore */ }
  }

  private persistNotificationTemplatesToSupabase() {
    const custom = this._notificationTemplates.filter(t => !t.isAutoGenerated);
    void rpc(supabase.rpc('admin_update_setting', { p_key: 'notification_templates', p_value: custom as unknown as string })).catch(() => {});
    try { localStorage.setItem(Cms.NOTIF_TEMPLATES_KEY, JSON.stringify(this._notificationTemplates)); } catch { /* ignore */ }
  }

  private emitNotificationTemplates() { bus.emit('cms:notif_templates', this._notificationTemplates); }

  addNotificationTemplate(t: Omit<NotificationTemplate, 'id' | 'createdAt' | 'isAutoGenerated'>): NotificationTemplate {
    const tpl: NotificationTemplate = { ...t, id: 'nt_' + Math.random().toString(36).slice(2), createdAt: Date.now(), isAutoGenerated: false };
    this._notificationTemplates = [...this._notificationTemplates, tpl];
    this.persistNotificationTemplatesToSupabase(); this.emitNotificationTemplates();
    return tpl;
  }
  toggleNotificationTemplate(id: string, isActive: boolean) {
    this._notificationTemplates = this._notificationTemplates.map(t => t.id === id ? { ...t, isActive } : t);
    this.persistNotificationTemplatesToSupabase(); this.emitNotificationTemplates();
  }
  deleteNotificationTemplate(id: string) {
    const tpl = this._notificationTemplates.find(t => t.id === id);
    if (tpl?.isAutoGenerated) return;
    this._notificationTemplates = this._notificationTemplates.filter(t => t.id !== id);
    this.persistNotificationTemplatesToSupabase(); this.emitNotificationTemplates();
  }
  updateNotificationTemplate(id: string, patch: Partial<Pick<NotificationTemplate, 'title' | 'body' | 'kind'>>) {
    this._notificationTemplates = this._notificationTemplates.map(t => t.id === id ? { ...t, ...patch } : t);
    this.persistNotificationTemplatesToSupabase(); this.emitNotificationTemplates();
  }

  toast(t: Omit<ToastEvent, 'id'>) { bus.emit(Topics.Toast, { ...t, id: Math.random().toString(36).slice(2) }); }
  pushFromTemplate(templateId: string, fallbackTitle: string, fallbackBody: string, fallbackKind: NotificationTemplateKind = 'info') {
    const tpl = this._notificationTemplates.find(t => t.id === templateId);
    if (tpl && tpl.isActive) { store.pushNotification({ title: tpl.title, body: tpl.body, kind: tpl.kind }); return; }
    if (!tpl) store.pushNotification({ title: fallbackTitle, body: fallbackBody, kind: fallbackKind });
  }

  addBanner(imageDataUrl: string, linkUrl = '') {
    const rec = { id: Math.random().toString(36).slice(2), imageDataUrl, linkUrl };
    this.banners = [...this.banners, rec]; this.emitBanners();
    rpc(supabase.rpc('admin_upsert_banner', { p_id: null, p_title: 'Banner', p_image_url: imageDataUrl, p_link_url: linkUrl, p_sort_order: this.banners.length, p_is_active: true }))
      .then(() => { void this.syncBannersFromSupabase(); }).catch(() => {});
  }
  updateBanner(id: string, patch: Partial<BannerSlide>) {
    this.banners = this.banners.map(b => b.id === id ? { ...b, ...patch } : b); this.emitBanners();
    if (patch.imageDataUrl || patch.linkUrl) {
      const b = this.banners.find(x => x.id === id);
      if (b) rpc(supabase.rpc('admin_upsert_banner', { p_id: id, p_title: 'Banner', p_image_url: b.imageDataUrl, p_link_url: b.linkUrl, p_sort_order: 0, p_is_active: true })).then(() => { void this.syncBannersFromSupabase(); }).catch(() => {});
    }
  }
  removeBanner(id: string) {
    this.banners = this.banners.filter(b => b.id !== id); this.emitBanners();
    rpc(supabase.rpc('admin_delete_banner', { p_id: id })).then(() => { void this.syncBannersFromSupabase(); }).catch(() => {});
  }

  setLogo(dataUrl: string | null) { this.logoDataUrl = dataUrl; this.emitLogo(); }
  setTextLogo(dataUrl: string | null) { this.textLogoDataUrl = dataUrl; bus.emit(Topics.TextLogo, this.textLogoDataUrl); }
  setFavicon(dataUrl: string | null) { this.faviconDataUrl = dataUrl; bus.emit(Topics.Favicon, this.faviconDataUrl); }
  setUpiQr(dataUrl: string) { this.upiQrDataUrl = dataUrl; this.emitUpi(); }
  setDepositHtml(html: string) { this.depositPageHtml = html; this.emitDepositHtml(); }
  setWithdrawalHtml(html: string) { this.withdrawalPageHtml = html; this.emitWithdrawalHtml(); }

  setEmailTemplate(key: keyof EmailTemplates, html: string) {
    this.emailTemplates = { ...this.emailTemplates, [key]: html };
    this.emitEmails();
    void rpc(supabase.rpc('admin_update_setting', { p_key: 'email_templates', p_value: this.emailTemplates as unknown as string })).catch(() => {});
  }

  setSmtpConfig(patch: Partial<SmtpConfig>) { this.smtpConfig = { ...this.smtpConfig, ...patch }; }

  addDynamicPage(title: string, html: string) {
    const page: DynamicPage = { id: 'dp_' + Math.random().toString(36).slice(2), title, html, ts: Date.now() };
    this.dynamicPages = [...this.dynamicPages, page]; this.emitDynamicPages(); this.persistDynamicPagesToSupabase();
  }
  updateDynamicPage(id: string, patch: Partial<Pick<DynamicPage, 'title' | 'html'>>) {
    this.dynamicPages = this.dynamicPages.map(p => p.id === id ? { ...p, ...patch, ts: Date.now() } : p);
    this.emitDynamicPages(); this.persistDynamicPagesToSupabase();
  }
  removeDynamicPage(id: string) {
    this.dynamicPages = this.dynamicPages.filter(p => p.id !== id); this.emitDynamicPages(); this.persistDynamicPagesToSupabase();
  }
  private persistDynamicPagesToSupabase() {
    void rpc(supabase.rpc('admin_update_setting', { p_key: 'dynamic_pages', p_value: this.dynamicPages as unknown as string })).catch(() => {});
  }

  submitDeposit(user: string, amount: number, method: string, utr?: string, details?: string, userId?: string) {
    const meta = { username: user, method, ...(utr ? { utr } : {}), ...(details ? { details } : {}) };
    supabase.from('transactions').insert({
      user_id: userId || null, type: 'deposit', amount,
      reference: `${user} - ${method}`, status: 'pending', metadata: meta,
    }).then(({ data }) => { if (data) void this.syncTransactionsFromSupabase(); }).catch(() => {});
    const rec: DepositRequest = { id: Math.random().toString(36).slice(2), user, userId, amount, method, utr, details, status: 'pending', ts: Date.now() };
    this.deposits = [rec, ...this.deposits]; this.emitFinance();
    this.toast({ title: 'New deposit request', body: `${user} \u20b9${amount}`, kind: 'info' });
  }

  submitWithdrawal(user: string, amount: number, destination: string, details?: string, userId?: string) {
    const debited = store.debitLocalOnly(amount);
    if (!debited) {
      this.toast({ title: 'Insufficient balance', body: `Available: ${store.currency}${store.balance.toFixed(2)}`, kind: 'alert' });
      return;
    }
    const newBalance = store.balance;
    const session = auth.getSession();
    if (session?.userId) {
      supabase.from('profiles').update({ balance: newBalance }).eq('id', session.userId).then(() => {}).catch(() => {});
    }
    const meta = { username: user, destination, ...(details ? { details } : {}) };
    supabase.from('transactions').insert({
      user_id: userId || null, type: 'withdrawal', amount,
      reference: `${user} - ${destination}`, status: 'pending', metadata: meta,
    }).then(() => { void this.syncTransactionsFromSupabase(); }).catch(() => {});
    const rec: WithdrawalRequest = { id: Math.random().toString(36).slice(2), user, userId, amount, destination, details, status: 'pending', ts: Date.now() };
    this.withdrawals = [rec, ...this.withdrawals]; this.emitFinance();
    this.toast({ title: 'New withdrawal request', body: `${user} \u20b9${amount}`, kind: 'warn' });
  }

  async setDepositStatus(id: string, status: DepositRequest['status'], utr?: string, reason?: string) {
    const before = this.deposits.find(d => d.id === id);
    this.deposits = this.deposits.map(d => d.id === id ? { ...d, status, utr: utr ?? d.utr, reason: reason ?? d.reason } : d);
    if (before && before.status !== status) {
      const statusLabel = status === 'approved' ? 'Successful' : status === 'cancelled' ? 'Cancelled' : status === 'processing' ? 'Processing' : status === 'rejected' ? 'Failed' : status;
      const reasonText = reason ? `: ${reason}` : '';
      this.pushFromTemplate('nt_deposit_ok', `Deposit ${statusLabel}`, `Your deposit of ${store.currency}${before.amount.toFixed(2)} via ${before.method} is ${status}${reasonText}.`, status === 'approved' ? 'success' : status === 'processing' ? 'info' : 'warn');
      if ((status === 'approved' || status === 'rejected') && before.userId) {
        emailService.sendDepositEmail(before.userId, before.user, `${store.currency}${before.amount.toFixed(2)}`, `${store.currency}0.00`, id, status);
      }
    }
    if (status === 'approved') {
      const { data: creditResult, error: creditErr } = await supabase.rpc('admin_approve_deposit_credit', { p_txn_id: id });
      if (creditErr) {
        this.toast({ title: 'Balance credit failed', body: creditErr.message, kind: 'alert' });
      } else {
        const result = creditResult as { credited: boolean; reward?: number; referred_name?: string } | null;
        if (result?.credited && result.reward) {
          const referredName = result.referred_name ?? 'user';
          this.pushFromTemplate(
            'nt_referral_reward',
            'Referral Reward Credited',
            `${referredName} ka deposit approve hua. Referrer ko \u20b9${result.reward} bonus mila!`,
            'success',
          );
        }
      }
    }
    this.emitFinance();
    const { error: statusErr } = await supabase.rpc('admin_update_transaction', { p_id: id, p_status: status, p_utr: utr ?? null, p_reason: reason ?? null });
    if (statusErr) { this.toast({ title: 'Status update failed', body: statusErr.message, kind: 'alert' }); throw statusErr; }
  }

  async setWithdrawalStatus(id: string, status: WithdrawalRequest['status'], utr?: string, reason?: string) {
    const before = this.withdrawals.find(w => w.id === id);
    this.withdrawals = this.withdrawals.map(w => w.id === id ? { ...w, status, utr: utr ?? w.utr, reason: reason ?? w.reason } : w);
    const isRefundable = (status === 'rejected' || status === 'cancelled') && before && DEDUCTED_STATUSES.has(before.status);
    if (isRefundable && before) {
      if (before.userId) {
        try {
          const { data: userProfile } = await supabase.from('profiles').select('balance').eq('id', before.userId).single();
          if (userProfile) {
            const currentBalance = Number((userProfile as { balance: number }).balance) || 0;
            const refundedBalance = Math.round((currentBalance + before.amount) * 100) / 100;
            await supabase.from('profiles').update({ balance: refundedBalance }).eq('id', before.userId);
          } else {
            if (before.user && before.user !== 'Unknown') {
              await supabase.rpc('admin_credit_balance', { p_username: before.user, p_amount: before.amount }).catch(() => {});
            }
          }
        } catch (e) {
          if (before.user && before.user !== 'Unknown') {
            await supabase.rpc('admin_credit_balance', { p_username: before.user, p_amount: before.amount }).catch(() => {});
          }
          console.warn('[cms] withdrawal refund error:', e);
        }
      } else if (before.user && before.user !== 'Unknown') {
        await supabase.rpc('admin_credit_balance', { p_username: before.user, p_amount: before.amount }).catch(() => {});
      }
      const currentSession = auth.getSession();
      if (currentSession?.userId && currentSession.userId === before.userId) {
        store.creditLocalOnly(before.amount);
      }
      const reasonText = reason ? `: ${reason}` : '';
      this.pushFromTemplate('nt_withdrawal_refunded', 'Withdrawal Refunded', `Your withdrawal of ${store.currency}${before.amount.toFixed(2)} was ${status}${reasonText}. Amount refunded to your wallet.`, 'warn');
      if (before.userId) {
        emailService.sendWithdrawalEmail(before.userId, before.user, `${store.currency}${before.amount.toFixed(2)}`, status, id);
      }
    } else if (before && before.status !== status) {
      const utrText = utr ? ` (UTR: ${utr})` : '';
      const reasonText = reason ? `: ${reason}` : '';
      this.pushFromTemplate('nt_withdrawal_ok', `Withdrawal ${status}`, `Your withdrawal of ${store.currency}${before.amount.toFixed(2)} to ${before.destination} is ${status}${utrText}${reasonText}.`, status === 'approved' ? 'success' : 'info');
      if (before.userId) {
        emailService.sendWithdrawalEmail(before.userId, before.user, `${store.currency}${before.amount.toFixed(2)}`, status, id);
      }
    }
    this.emitFinance();
    const { error: statusErr } = await supabase.rpc('admin_update_transaction', { p_id: id, p_status: status, p_utr: utr ?? null, p_reason: reason ?? null });
    if (statusErr) { this.toast({ title: 'Status update failed', body: statusErr.message, kind: 'alert' }); throw statusErr; }
  }

  totals() {
    const approved = (xs: { amount: number; status: string }[]) => xs.filter(x => x.status === 'approved').reduce((s, x) => s + x.amount, 0);
    return {
      totalDeposits: approved(this.deposits), totalWithdrawals: approved(this.withdrawals),
      profit: approved(this.deposits) - approved(this.withdrawals),
      pendingDeposits: this.deposits.filter(d => d.status === 'pending' || d.status === 'processing').length,
      pendingWithdrawals: this.withdrawals.filter(w => w.status === 'pending' || w.status === 'processing').length,
    };
  }

  async updateUserBalance(userId: string, newBalance: number) {
    const bal = Math.round(newBalance);
    this.adminUsers = this.adminUsers.map(u => u.id === userId ? { ...u, balance: bal } : u);
    bus.emit(Topics.AdminUsers, this.adminUsers);
    await rpc(supabase.rpc('admin_update_user', { p_id: userId, p_balance: bal })).catch(() => {});
  }

  submitSupport(from: string, body: string) {
    const rec: SupportMessage = { id: Math.random().toString(36).slice(2), from, body, ts: Date.now(), read: false };
    this.support = [rec, ...this.support]; this.emitSupport();
    this.toast({ title: 'New support message', body: `${from}: ${body.slice(0, 40)}`, kind: 'info' });
    supabase.from('support_tickets').insert({ user_id: from, subject: 'Support', message: body, status: 'open' }).then(() => {}).catch(() => {});
  }
  markSupportRead(id?: string) { this.support = this.support.map(s => (!id || s.id === id ? { ...s, read: true } : s)); this.emitSupport(); }
  unreadSupport() { return this.support.filter(s => !s.read).length; }

  // ---- Staff Session Management ----

  /** Login: set session, persist to localStorage, emit bus event so React updates instantly */
  loginStaff(staffId: string) {
    this.staffSessionId = staffId;
    try { localStorage.setItem(ADMIN_SESSION_KEY, staffId); } catch { /* ignore */ }
    bus.emit(Topics.StaffSession, staffId);
  }

  /** Logout: clear session, remove from localStorage, emit bus event so React updates instantly */
  logoutStaff() {
    this.staffSessionId = null;
    try { localStorage.removeItem(ADMIN_SESSION_KEY); } catch { /* ignore */ }
    bus.emit(Topics.StaffSession, null);
  }

  // ---- Staff helpers ----
  getStaffById(id: string): StaffAccount | undefined { return this.staff.find(s => s.id === id); }
  getCurrentStaff(): StaffAccount | undefined { return this.staffSessionId ? this.staff.find(s => s.id === this.staffSessionId) : undefined; }

  hasPermission(staffId: string, key: PermissionKey): boolean {
    const s = this.staff.find(x => x.id === staffId);
    if (!s) return false;
    if (s.isOwner) return true;
    return s.permissions[key] === true;
  }

  adminLogout() {
    this.staffSessionId = null;
    try { localStorage.removeItem(ADMIN_SESSION_KEY); } catch { /* ignore */ }
  }

  async adminLogin(name: string, password: string): Promise<StaffAccount | null> {
    try {
      const { data, error } = await supabase.rpc('admin_login', { p_name: name, p_password: password });
      if (error || !data) return null;
      const rows = data as Array<Record<string, unknown>>;
      if (!rows || rows.length === 0) return null;
      const account = mapSupabaseStaff(rows[0]);
      this.staffSessionId = account.id;
      try { localStorage.setItem(ADMIN_SESSION_KEY, account.id); } catch { /* ignore */ }
      return account;
    } catch { return null; }
  }

  async verifyStaffCredentialsAsync(name: string, password: string): Promise<StaffAccount | null> {
    return this.adminLogin(name, password);
  }

  async addStaff(name: string, password: string, role: StaffRole, email?: string) {
    const { data, error } = await supabase.rpc('admin_create_staff', { p_name: name, p_password: password, p_role: role, p_email: email ?? null });
    if (error) throw error;
    await this.syncStaffFromSupabase();
    return data;
  }

  async removeStaff(id: string) {
    await supabase.rpc('admin_delete_staff', { p_id: id });
    await this.syncStaffFromSupabase();
  }

  async updateStaffPermissions(id: string, permissions: Partial<Record<PermissionKey, boolean>>) {
    await supabase.rpc('admin_update_staff_permissions', { p_id: id, p_permissions: permissions as unknown as string });
    await this.syncStaffFromSupabase();
  }

  // ---- Tickets ----
  createTicket(accountId: string, subject: string, message: string): SupportTicket {
    const ticket: SupportTicket = {
      id: Math.random().toString(36).slice(2), accountId, status: 'unassigned', assignedStaffId: null,
      messages: [{ id: Math.random().toString(36).slice(2), role: 'user', body: message, ts: Date.now() }],
      createdTs: Date.now(), lastUserMsgTs: Date.now(), acknowledged: false,
    };
    this.tickets = [ticket, ...this.tickets]; this.emitTickets();
    rpc(supabase.rpc('user_post_ticket_message', { p_account_id: accountId, p_body: message }))
      .then(() => { void this.syncTicketsFromSupabase(); })
      .catch(() => { supabase.from('support_tickets').insert({ user_id: accountId, subject, message, status: 'open', priority: 'normal' }).then(() => { void this.syncTicketsFromSupabase(); }).catch(() => {}); });
    return ticket;
  }

  getTicket(id: string): SupportTicket | undefined { return this.tickets.find(t => t.id === id); }

  assignTicket(id: string, staffId: string) {
    this.tickets = this.tickets.map(t => t.id === id ? { ...t, status: 'assigned' as TicketStatus, assignedStaffId: staffId } : t); this.emitTickets();
    rpc(supabase.rpc('admin_assign_ticket', { p_ticket_id: id, p_staff_id: staffId }))
      .then(() => { void this.syncTicketsFromSupabase(); }).catch(() => {});
  }

  closeTicket(id: string) {
    this.tickets = this.tickets.map(t => t.id === id ? { ...t, status: 'closed' as TicketStatus } : t); this.emitTickets();
    rpc(supabase.rpc('admin_close_ticket', { p_ticket_id: id }))
      .then(() => { void this.syncTicketsFromSupabase(); }).catch(() => {});
  }

  acknowledgeTicket(id: string) {
    this.tickets = this.tickets.map(t => t.id === id ? { ...t, acknowledged: true } : t); this.emitTickets();
  }

  replyToTicket(id: string, body: string, staffId: string, attachments?: TicketAttachment[]) {
    const msg: TicketMessage = { id: Math.random().toString(36).slice(2), role: 'agent', agentId: staffId, body, ts: Date.now(), attachments };
    this.tickets = this.tickets.map(t => {
      if (t.id !== id) return t;
      const updated: SupportTicket = { ...t, messages: [...t.messages, msg] };
      return updated;
    }); this.emitTickets();
    rpc(supabase.rpc('admin_reply_ticket', { p_ticket_id: id, p_staff_id: staffId, p_body: body }))
      .then(() => { void this.syncTicketsFromSupabase(); }).catch(() => {});
  }

  // ---- Staff DMs ----
  getOrCreateDM(fromId: string, toId: string): StaffDM[] {
    return this.staffDMs.filter(d => (d.fromId === fromId && d.toId === toId) || (d.fromId === toId && d.toId === fromId));
  }

  sendDM(fromId: string, toId: string, body: string) {
    const dm: StaffDM = { id: Math.random().toString(36).slice(2), fromId, toId, body, ts: Date.now(), read: false };
    this.staffDMs = [...this.staffDMs, dm]; this.emitDMs();
  }

  markDMRead(fromId: string, toId: string) {
    this.staffDMs = this.staffDMs.map(d => d.fromId === fromId && d.toId === toId ? { ...d, read: true } : d); this.emitDMs();
  }

  markDMsRead(fromId: string) {
    this.staffDMs = this.staffDMs.map(d => d.fromId === fromId ? { ...d, read: true } : d); this.emitDMs();
  }

  unreadDMs(toId: string) { return this.staffDMs.filter(d => d.toId === toId && !d.read).length; }

  async sendStaffDM(fromId: string, toId: string, body: string) {
    const dm: StaffDM = { id: Math.random().toString(36).slice(2), fromId, toId, body, ts: Date.now(), read: false };
    this.staffDMs = [...this.staffDMs, dm]; this.emitDMs();
  }

  staffConversation(staffId1: string, staffId2: string): StaffDM[] {
    return this.getOrCreateDM(staffId1, staffId2);
  }

  // ---- Countries ----
  addCountry(country: Omit<Country, 'id'>) {
    const newCountry: Country = { ...country, id: 'c_' + Math.random().toString(36).slice(2) };
    this.countries = [...this.countries, newCountry];
    bus.emit(Topics.Countries, this.countries);
  }

  updateCountry(id: string, patch: Partial<Country>) {
    this.countries = this.countries.map(c => c.id === id ? { ...c, ...patch } : c);
    bus.emit(Topics.Countries, this.countries);
  }

  removeCountry(id: string) {
    this.countries = this.countries.filter(c => c.id !== id);
    bus.emit(Topics.Countries, this.countries);
  }

  isGeoBlocked(): boolean {
    const country = this.countries.find(c => c.id === this.detectedCountryId);
    return country ? !country.isActive : false;
  }

  get detectedCountry(): Country | undefined {
    return this.countries.find(c => c.id === this.detectedCountryId);
  }

  setDetectedCountry(countryId: string) {
    this.detectedCountryId = countryId;
  }

  hasIpAlreadySignedUp(_ip: string): boolean {
    return false;
  }

  // ---- Payment Methods ----
  addManualMethod(method: Omit<ManualMethod, 'id'>) {
    const newMethod: ManualMethod = { ...method, id: 'mm_' + Math.random().toString(36).slice(2) };
    this.manualMethods = [...this.manualMethods, newMethod]; this.emitManual();
    rpc(supabase.rpc('admin_upsert_payment_method', {
      p_id: null, p_method_type: newMethod.kind, p_is_active: newMethod.active,
      p_account_details: { ...newMethod } as unknown as string, p_countries: newMethod.countries as unknown as string,
    })).then(() => { void this.syncPaymentMethodsFromSupabase(); }).catch(() => {});
  }

  updateManualMethod(id: string, patch: Partial<ManualMethod>) {
    this.manualMethods = this.manualMethods.map(m => m.id === id ? { ...m, ...patch } : m); this.emitManual();
    const updated = this.manualMethods.find(m => m.id === id);
    if (updated) {
      rpc(supabase.rpc('admin_upsert_payment_method', {
        p_id: id, p_method_type: updated.kind, p_is_active: updated.active,
        p_account_details: { ...updated } as unknown as string, p_countries: updated.countries as unknown as string,
      })).then(() => { void this.syncPaymentMethodsFromSupabase(); }).catch(() => {});
    }
  }

  removeManualMethod(id: string) {
    this.manualMethods = this.manualMethods.filter(m => m.id !== id); this.emitManual();
    rpc(supabase.rpc('admin_delete_payment_method', { p_id: id })).then(() => { void this.syncPaymentMethodsFromSupabase(); }).catch(() => {});
  }

  // ---- Auto Gateways ----
  addAutoGateway(gateway: Omit<AutoGateway, 'id'>) {
    const newGateway: AutoGateway = { ...gateway, id: 'ag_' + Math.random().toString(36).slice(2) };
    this.autoGateways = [...this.autoGateways, newGateway]; this.emitGateways();
  }
  addGateway(g: Omit<AutoGateway, 'id'>) { return this.addAutoGateway(g); }

  updateAutoGateway(id: string, patch: Partial<AutoGateway>) {
    this.autoGateways = this.autoGateways.map(g => g.id === id ? { ...g, ...patch } : g); this.emitGateways();
  }
  updateGateway(id: string, patch: Partial<AutoGateway>) { return this.updateAutoGateway(id, patch); }

  removeAutoGateway(id: string) {
    this.autoGateways = this.autoGateways.filter(g => g.id !== id); this.emitGateways();
  }
  removeGateway(id: string) { return this.removeAutoGateway(id); }

  // ---- Referrals ----
  async saveReferralConfig(config: ReferralConfig) {
    this.referralConfig = config;
    bus.emit(Topics.ReferralConfig, this.referralConfig);
    await rpc(supabase.rpc('admin_update_setting', { p_key: 'referral_config', p_value: config as unknown as string })).catch(() => {});
  }

  async loadReferrals() {
    try {
      const { data, error } = await supabase.rpc('admin_get_referrals');
      if (error) { console.warn('[cms] loadReferrals error:', error.message); return; }
      if (data && Array.isArray(data)) {
        this.referrals = (data as Array<Record<string, unknown>>).map(r => ({
          id: r.id as string,
          referrerId: r.referrer_id as string,
          referredUserId: r.referred_id as string,
          referredUsername: (r.referred_username as string) || '',
          depositAmount: Number(r.deposit_amount) || 0,
          firstDepositApproved: (r.status as string) === 'credited',
          rewardPaid: (r.status as string) === 'credited',
          rewardCredited: (r.status as string) === 'credited',
          rewardAmount: Number(r.bonus_amount) || 0,
          createdAt: new Date(r.created_at as string).getTime(),
          ts: new Date(r.created_at as string).getTime(),
        }));
        this.emitReferrals();
      }
    } catch (e) { console.warn('[cms] loadReferrals failed:', e); }
  }

  addReferral(referral: Omit<Referral, 'id' | 'ts'>) {
    const newReferral: Referral = { ...referral, id: 'ref_' + Math.random().toString(36).slice(2), ts: Date.now() };
    this.referrals = [...this.referrals, newReferral]; this.emitReferrals();
  }

  updateReferralReward(id: string, patch: Partial<Pick<Referral, 'rewardPaid' | 'rewardCredited' | 'paidAt'>>) {
    this.referrals = this.referrals.map(r => r.id === id ? { ...r, ...patch } : r); this.emitReferrals();
  }

  approveReferral(id: string) {
    this.referrals = this.referrals.map(r => r.id === id ? { ...r, rewardPaid: true, paidAt: Date.now() } : r); this.emitReferrals();
  }

  recordReferralSignup(referrerId: string, referredUserId: string, _referredUsername: string) {
    const existing = this.referrals.find(r => r.referredUserId === referredUserId);
    if (existing) return;
    void supabase.rpc('record_referral_signup', { p_referrer_id: referrerId, p_referred_id: referredUserId }).catch(() => {});
  }

  // ---- Affiliates ----
  async loadAffiliates() {
    try {
      const { data, error } = await supabase.from('affiliates').select('*').order('created_at', { ascending: false });
      if (error) { console.warn('[cms] loadAffiliates error:', error.message); return; }
      if (data && Array.isArray(data)) {
        this.affiliates = (data as Array<Record<string, unknown>>).map(a => ({
          id: a.id as string,
          userId: a.user_id as string,
          username: (a.username as string) || '',
          email: (a.email as string) || '',
          telegram: (a.telegram as string) || '',
          trafficSource: (a.traffic_source as string) || '',
          estimatedTraffic: (a.estimated_traffic as string) || '',
          status: (a.status as 'pending' | 'approved' | 'rejected') || 'pending',
          revSharePct: Number(a.rev_share_pct) || 0,
          stats: { clicks: 0, registered: 0, deposits: 0, revenueShare: 0 },
          ts: new Date(a.created_at as string).getTime(),
        }));
        bus.emit(Topics.Affiliates, this.affiliates);
      }
    } catch (e) { console.warn('[cms] loadAffiliates failed:', e); }
  }

  async updateAffiliateStatus(id: string, status: 'approved' | 'rejected', revSharePct?: number) {
    await supabase.from('affiliates').update({ status, ...(revSharePct !== undefined ? { rev_share_pct: revSharePct } : {}) }).eq('id', id);
    await this.loadAffiliates();
  }

  addAffiliate(a: Omit<AffiliateApplication, 'id' | 'ts'>) {
    const app: AffiliateApplication = { ...a, id: Math.random().toString(36).slice(2), ts: Date.now() };
    this.affiliates = [...this.affiliates, app];
    bus.emit(Topics.Affiliates, this.affiliates);
  }

  updateAffiliate(id: string, patch: Partial<AffiliateApplication>) {
    this.affiliates = this.affiliates.map(a => a.id === id ? { ...a, ...patch } : a);
    bus.emit(Topics.Affiliates, this.affiliates);
  }
}

export const cms = new Cms();
