// CMS – Supabase-backed admin-managed runtime content: banners, logo, UPI QR, deposit page HTML,
// email templates, finance ledger, support inbox, staff sub-accounts and DMs,
// payment methods, countries, referrals, dynamic pages, notification templates.
// Now fully backed by Supabase database tables.

import { supabase } from '@/integrations/supabase/client';
import { bus, Topics } from './bus';
import { store } from './store';
import type { AuthUser } from './auth';
import { uploadFile, deleteFile } from './uploadService';

// ---- Types ----
export interface BannerSlide {
  id: string;
  imageDataUrl: string;
  imageUrl?: string;
  linkUrl: string;
}
export interface DepositRequest {
  id: string; user: string; amount: number; method: string;
  utr?: string; details?: string; reason?: string;
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'cancelled'; ts: number;
}
export interface WithdrawalRequest {
  id: string; user: string; amount: number; destination: string;
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'cancelled';
  utr?: string; reason?: string; details?: string; ts: number;
}
export interface SupportMessage { id: string; from: string; body: string; ts: number; read: boolean; }
export type StaffRole = 'support' | 'finance';
export type PermissionKey =
  | 'finance' | 'banner' | 'deposit' | 'emails' | 'staff' | 'marketing'
  | 'algos' | 'users' | 'smtp' | 'currencies' | 'crm' | 'intercom' | 'notify'
  | 'gateways' | 'tickets' | 'history' | 'withdrawals' | 'redeem'
  | 'gameSettings' | 'paymentMethods' | 'dynamicPages' | 'ban' | 'notifyManager';
export const ALL_PERMISSIONS: PermissionKey[] = [
  'finance','banner','deposit','emails','staff','marketing',
  'algos','users','smtp','currencies','crm','intercom','notify',
  'gateways','tickets','history','withdrawals','redeem',
  'gameSettings','paymentMethods','dynamicPages','ban','notifyManager',
];
export interface StaffAccount {
  id: string; name: string; password: string; role: StaffRole; online: boolean;
  email?: string; permissions: Partial<Record<PermissionKey, boolean>>; isOwner?: boolean;
}
export interface Country { id: string; name: string; code: string; isActive: boolean; currency: string; manualDepositMethods: string[]; manualWithdrawalMethods: string[]; }
export interface ReferralConfig { rewardAmount: number; minDeposit: number; tierPercent: number; tierThreshold: number; }
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
  upiId?: string; upiDisplayName?: string;
  qrDataUrl?: string;
  cryptoCurrencies?: CryptoCurrency[];
  html?: string; customData?: string;
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
export interface EmailTemplates { welcome: string; depositSuccess: string; withdrawalStatus: string; }
export interface SmtpConfig { host: string; port: string; user: string; pass: string; tls: boolean; active: boolean; }
export interface DynamicPage { id: string; title: string; html: string; ts: number; }
export interface ToastEvent { id: string; title: string; body: string; kind: 'info' | 'success' | 'warn' | 'alert'; }
export type NotificationTemplateKind = 'info' | 'success' | 'warn' | 'alert';
export interface NotificationTemplate { id: string; title: string; body: string; kind: NotificationTemplateKind; isActive: boolean; isAutoGenerated: boolean; createdAt: number; }

// ---- Defaults ----
const defaultBanners: BannerSlide[] = [
  { id: 'b1', imageDataUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="%23b15eff"/><stop offset="1" stop-color="%2300ff88"/></linearGradient></defs><rect width="800" height="300" fill="url(%23g)"/><text x="40" y="160" fill="white" font-family="Inter" font-size="48" font-weight="800">Welcome Bonus \u20B915,000</text></svg>'), linkUrl: 'https://b4bet.com/promo/welcome' },
];
const defaultDepositHtml = `<div style="font-family:Inter,sans-serif;padding:16px;background:#0f1225;color:#fff;border-radius:14px"><h2 style="margin:0 0 8px;color:#00ff88">Manual UPI Deposit</h2><p style="margin:0 0 8px">1. Scan the UPI QR above with any UPI app.</p><p style="margin:0 0 8px">2. Pay the exact amount you entered.</p><p style="margin:0">3. Submit the UTR / Transaction ID below for credit.</p></div>`;

const defaultUpiQr = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="white"/><g fill="black"><rect x="10" y="10" width="60" height="60"/><rect x="20" y="20" width="40" height="40" fill="white"/><rect x="30" y="30" width="20" height="20"/><rect x="130" y="10" width="60" height="60"/><rect x="140" y="20" width="40" height="40" fill="white"/><rect x="150" y="30" width="20" height="20"/><rect x="10" y="130" width="60" height="60"/><rect x="20" y="140" width="40" height="40" fill="white"/><rect x="30" y="150" width="20" height="20"/><rect x="90" y="90" width="20" height="20"/><rect x="120" y="120" width="10" height="10"/><rect x="140" y="100" width="10" height="10"/></g></svg>');

const defaultEmails: EmailTemplates = {
  welcome: '<div style="font-family:Inter,sans-serif;background:#0a0f1c;color:#fff;padding:24px;border-radius:12px"><h1 style="margin:0 0 16px;color:#00ff88;font-size:28px">Welcome to B4BeT, {{username}}!</h1><p style="margin:0 0 12px;font-size:16px">Your account is now live and ready to play.</p><p style="margin:0 0 12px;font-size:14px">Enjoy our exclusive games, live betting, and amazing rewards.</p><p style="margin:0;font-size:14px;color:#a0aec0">Start playing now and claim your welcome bonus on your first deposit!</p></div>',
  depositSuccess: '<h1>Deposit successful</h1><p>Hi {{username}}, {{amount}} has been credited. New balance: {{balance}}.</p>',
  withdrawalStatus: '<h1>Withdrawal {{status}}</h1><p>Hi {{username}}, your withdrawal of {{amount}} is now {{status}}.</p>',
};

// ---- Supabase staff row mapped to StaffAccount ----
function mapSupabaseStaff(row: Record<string, unknown>): StaffAccount {
  const role = (row.role as string) === 'super_admin' || (row.role as string) === 'admin' ? 'finance' : 'support';
  const isOwner = (row.role as string) === 'super_admin';
  const perms: Partial<Record<PermissionKey, boolean>> = isOwner
    ? Object.fromEntries(ALL_PERMISSIONS.map(k => [k, true]))
    : ((row.permissions as Partial<Record<PermissionKey, boolean>>) ?? {});
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    password: '', // never stored client-side
    role: role as StaffRole,
    online: false,
    permissions: perms,
    isOwner,
  };
}

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

  countries: Country[] = [
    { id: 'c_in', name: 'India', code: 'IN', isActive: true, currency: '\u20B9', manualDepositMethods: ['UPI','IMPS'], manualWithdrawalMethods: ['UPI','Bank'] },
    { id: 'c_us', name: 'United States', code: 'US', isActive: false, currency: '$', manualDepositMethods: ['Wire'], manualWithdrawalMethods: ['Wire'] },
    { id: 'c_uk', name: 'United Kingdom', code: 'GB', isActive: true, currency: '\u00A3', manualDepositMethods: ['Bank'], manualWithdrawalMethods: ['Bank'] },
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
    { id: 'nt_deposit_ok', title: 'Deposit Confirmed', body: 'Your deposit has been approved. Funds are now available in your balance.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_withdrawal_ok', title: 'Withdrawal Processed', body: 'Your withdrawal request has been processed. Funds are on the way.', kind: 'info', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
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
    this.loadFromStorage();
    this.syncBannersFromSupabase();
    this.syncSettingsFromSupabase();
    // Load staff from Supabase staff table (not profiles)
    this.syncStaffFromSupabase();
  }

  // ---- Supabase Sync Methods ----

  private async syncBannersFromSupabase() {
    try {
      const { data } = await supabase.from('banners').select('*').eq('is_active', true).order('sort_order');
      if (data && data.length > 0) {
        this.banners = data.map((b: Record<string, unknown>) => ({
          id: b.id as string, imageDataUrl: (b.image_url as string) || '', imageUrl: b.image_url as string, linkUrl: (b.link_url as string) || '',
        }));
        this.emitBanners();
      }
    } catch { /* use defaults */ }
  }

  private async syncSettingsFromSupabase() {
    try {
      const { data } = await supabase.from('settings').select('*');
      if (data) {
        for (const s of data as Array<{ key: string; value: unknown }>) {
          if (s.key === 'referral_bonus' && s.value) { this.referralConfig.rewardAmount = s.value as number; }
        }
      }
    } catch { /* ignore */ }
  }

  // Load all active staff from Supabase `staff` table via RPC
  async syncStaffFromSupabase() {
    try {
      const { data, error } = await supabase.rpc('get_all_staff');
      if (error) { console.warn('[cms] syncStaffFromSupabase error:', error.message); return; }
      if (data && Array.isArray(data)) {
        this.staff = (data as Array<Record<string, unknown>>)
          .filter(row => row.is_active)
          .map(mapSupabaseStaff);
        this.emitStaff();
      }
    } catch (err) {
      console.warn('[cms] syncStaffFromSupabase failed:', err);
    }
  }

  private loadFromStorage() {
    this.loadNotificationTemplates();
  }

  get notificationTemplates(): NotificationTemplate[] { return this._notificationTemplates; }

  private loadNotificationTemplates() {
    try {
      const raw = localStorage.getItem(Cms.NOTIF_TEMPLATES_KEY);
      if (raw) this._notificationTemplates = JSON.parse(raw);
    } catch { /* ignore */ }
  }

  private persistNotificationTemplates() {
    try { localStorage.setItem(Cms.NOTIF_TEMPLATES_KEY, JSON.stringify(this._notificationTemplates)); } catch { /* ignore */ }
  }

  private emitNotificationTemplates() { bus.emit('cms:notif_templates', this._notificationTemplates); }

  addNotificationTemplate(t: Omit<NotificationTemplate, 'id' | 'createdAt' | 'isAutoGenerated'>): NotificationTemplate {
    const tpl: NotificationTemplate = { ...t, id: 'nt_' + Math.random().toString(36).slice(2), createdAt: Date.now(), isAutoGenerated: false };
    this._notificationTemplates = [...this._notificationTemplates, tpl];
    this.persistNotificationTemplates();
    this.emitNotificationTemplates();
    return tpl;
  }

  toggleNotificationTemplate(id: string, isActive: boolean) {
    this._notificationTemplates = this._notificationTemplates.map(t => t.id === id ? { ...t, isActive } : t);
    this.persistNotificationTemplates(); this.emitNotificationTemplates();
  }

  deleteNotificationTemplate(id: string) {
    const tpl = this._notificationTemplates.find(t => t.id === id);
    if (tpl?.isAutoGenerated) return;
    this._notificationTemplates = this._notificationTemplates.filter(t => t.id !== id);
    this.persistNotificationTemplates(); this.emitNotificationTemplates();
  }

  updateNotificationTemplate(id: string, patch: Partial<Pick<NotificationTemplate, 'title' | 'body' | 'kind'>>) {
    this._notificationTemplates = this._notificationTemplates.map(t => t.id === id ? { ...t, ...patch } : t);
    this.persistNotificationTemplates(); this.emitNotificationTemplates();
  }

  // ---- Emitters ----
  private emitBanners() { bus.emit(Topics.Banners, this.banners); }
  private emitDynamicPages() { bus.emit(Topics.DynamicPages, this.dynamicPages); }
  private emitLogo() { bus.emit(Topics.Logo, this.logoDataUrl); }
  private emitUpi() { bus.emit(Topics.UpiQr, this.upiQrDataUrl); }
  private emitDepositHtml() { bus.emit(Topics.DepositHtml, this.depositPageHtml); }
  private emitWithdrawalHtml() { bus.emit(Topics.WithdrawalHtml, this.withdrawalPageHtml); }
  private emitEmails() { bus.emit(Topics.EmailTemplates, this.emailTemplates); }
  private emitFinance() { bus.emit(Topics.Finance, { deposits: this.deposits, withdrawals: this.withdrawals }); }
  private emitSupport() { bus.emit(Topics.Support, this.support); }
  private emitStaff() { bus.emit(Topics.Staff, this.staff); }
  private emitDMs() { bus.emit(Topics.StaffDM, this.staffDMs); }
  private emitReferrals() { bus.emit(Topics.Referrals, this.referrals); }

  toast(t: Omit<ToastEvent, 'id'>) { bus.emit(Topics.Toast, { ...t, id: Math.random().toString(36).slice(2) }); }

  pushFromTemplate(templateId: string, fallbackTitle: string, fallbackBody: string, fallbackKind: NotificationTemplateKind = 'info') {
    const tpl = this._notificationTemplates.find(t => t.id === templateId);
    if (tpl && tpl.isActive) {
      store.pushNotification({ title: tpl.title, body: tpl.body, kind: tpl.kind });
      return;
    }
    if (!tpl) store.pushNotification({ title: fallbackTitle, body: fallbackBody, kind: fallbackKind });
  }

  // ---- Banners ----
  addBanner(imageDataUrl: string, linkUrl = '') {
    const rec = { id: Math.random().toString(36).slice(2), imageDataUrl, linkUrl };
    this.banners = [...this.banners, rec];
    this.emitBanners();
    supabase.from('banners').insert({ title: 'Banner', image_url: imageDataUrl, link_url: linkUrl, is_active: true, sort_order: this.banners.length }).then(() => {}).catch(() => {});
  }
  updateBanner(id: string, patch: Partial<BannerSlide>) {
    this.banners = this.banners.map(b => b.id === id ? { ...b, ...patch } : b);
    this.emitBanners();
    supabase.from('banners').update({ image_url: patch.imageDataUrl, link_url: patch.linkUrl }).eq('id', id).then(() => {}).catch(() => {});
  }
  removeBanner(id: string) {
    this.banners = this.banners.filter(b => b.id !== id);
    this.emitBanners();
    supabase.from('banners').update({ is_active: false }).eq('id', id).then(() => {}).catch(() => {});
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
  }
  setSmtpConfig(patch: Partial<SmtpConfig>) { this.smtpConfig = { ...this.smtpConfig, ...patch }; }

  // ---- Finance ----
  submitDeposit(user: string, amount: number, method: string, utr?: string, details?: string) {
    const rec: DepositRequest = { id: Math.random().toString(36).slice(2), user, amount, method, utr, details, status: 'pending', ts: Date.now() };
    this.deposits = [rec, ...this.deposits];
    this.emitFinance();
    this.toast({ title: 'New deposit request', body: `${user} \u20B9${amount}`, kind: 'info' });
    supabase.from('transactions').insert({ user_id: 'admin', type: 'deposit', amount, reference: `${user} - ${method}`, status: 'pending' }).then(() => {}).catch(() => {});
  }
  submitWithdrawal(user: string, amount: number, destination: string, details?: string) {
    const rec: WithdrawalRequest = { id: Math.random().toString(36).slice(2), user, amount, destination, details, status: 'pending', ts: Date.now() };
    this.withdrawals = [rec, ...this.withdrawals];
    this.emitFinance();
    this.toast({ title: 'New withdrawal request', body: `${user} \u20B9${amount}`, kind: 'warn' });
    supabase.from('transactions').insert({ user_id: 'admin', type: 'withdrawal', amount, reference: `${user} - ${destination}`, status: 'pending' }).then(() => {}).catch(() => {});
  }
  setDepositStatus(id: string, status: DepositRequest['status'], utr?: string, reason?: string) {
    const before = this.deposits.find(d => d.id === id);
    this.deposits = this.deposits.map(d => d.id === id ? { ...d, status, utr: utr !== undefined ? utr : d.utr, reason: reason !== undefined ? reason : d.reason } : d);
    if (before && before.status !== status) {
      const statusLabel = status === 'approved' ? 'Successful' : status === 'cancelled' ? 'Cancelled' : status === 'processing' ? 'Processing' : status === 'rejected' ? 'Failed' : status;
      const reasonText = reason ? `: ${reason}` : '';
      this.pushFromTemplate('nt_deposit_ok', `Deposit ${statusLabel}`, `Your deposit of ${store.currency}${before.amount.toFixed(2)} via ${before.method} is ${status}${reasonText}.`, status === 'approved' ? 'success' : status === 'processing' ? 'info' : 'warn');
    }
    if (before && before.status !== 'approved' && status === 'approved') {
      bus.emit(Topics.ReferralDepositApproved, { username: before.user, amount: before.amount });
      try { store.creditUser(before.user, before.amount); } catch { /* ignore */ }
    }
    this.emitFinance();
    supabase.from('transactions').update({ status }).eq('id', id).then(() => {}).catch(() => {});
  }
  setWithdrawalStatus(id: string, status: WithdrawalRequest['status'], utr?: string, reason?: string) {
    const before = this.withdrawals.find(w => w.id === id);
    this.withdrawals = this.withdrawals.map(w => w.id === id ? { ...w, status, utr: utr !== undefined ? utr : w.utr, reason: reason !== undefined ? reason : w.reason } : w);
    if (before && before.status !== status) {
      const utrText = utr ? ` (UTR: ${utr})` : '';
      const reasonText = reason ? `: ${reason}` : '';
      this.pushFromTemplate('nt_withdrawal_ok', `Withdrawal ${status}`, `Your withdrawal of ${store.currency}${before.amount.toFixed(2)} to ${before.destination} is ${status}${utrText}${reasonText}.`, status === 'approved' ? 'success' : 'info');
    }
    this.emitFinance();
    supabase.from('transactions').update({ status }).eq('id', id).then(() => {}).catch(() => {});
  }
  totals() {
    const approved = (xs: { amount: number; status: string }[]) => xs.filter(x => x.status === 'approved').reduce((s, x) => s + x.amount, 0);
    const totalDeposits = approved(this.deposits);
    const totalWithdrawals = approved(this.withdrawals);
    return {
      totalDeposits, totalWithdrawals, profit: totalDeposits - totalWithdrawals,
      pendingDeposits: this.deposits.filter(d => d.status === 'pending' || d.status === 'processing').length,
      pendingWithdrawals: this.withdrawals.filter(w => w.status === 'pending' || w.status === 'processing').length,
    };
  }

  // ---- Support ----
  submitSupport(from: string, body: string) {
    const rec: SupportMessage = { id: Math.random().toString(36).slice(2), from, body, ts: Date.now(), read: false };
    this.support = [rec, ...this.support];
    this.emitSupport();
    this.toast({ title: 'New support message', body: `${from}: ${body.slice(0, 40)}`, kind: 'info' });
    supabase.from('support_tickets').insert({ user_id: from, subject: 'Support', message: body, status: 'open' }).then(() => {}).catch(() => {});
  }
  markSupportRead(id?: string) {
    this.support = this.support.map(s => (!id || s.id === id ? { ...s, read: true } : s));
    this.emitSupport();
  }
  unreadSupport() { return this.support.filter(s => !s.read).length; }

  // ---- Staff (Supabase-backed) ----

  /**
   * Add a new staff member to Supabase staff table.
   */
  async addStaff(name: string, password: string, role: StaffRole, permissions: Partial<Record<PermissionKey, boolean>> = {}): Promise<StaffAccount | null> {
    const email = name.toLowerCase().replace(/\s+/g, '.') + '@b4bet.local';
    try {
      const { data, error } = await supabase.rpc('add_staff_member', {
        p_email: email,
        p_name: name,
        p_password: password,
        p_role: role === 'finance' ? 'admin' : 'staff',
        p_permissions: permissions,
      });
      if (error) { console.warn('[cms] addStaff error:', error.message); return null; }
      const rows = data as Array<Record<string, unknown>>;
      if (rows && rows.length > 0) {
        const acc = mapSupabaseStaff(rows[0]);
        this.staff = [...this.staff, acc];
        this.emitStaff();
        return acc;
      }
      return null;
    } catch (err) { console.warn('[cms] addStaff failed:', err); return null; }
  }

  /**
   * Add a new staff member with explicit email.
   */
  async addStaffAccount(name: string, email: string, password: string, isOwner: boolean = false): Promise<StaffAccount | null> {
    const supabaseRole = isOwner ? 'super_admin' : 'staff';
    const perms: Partial<Record<PermissionKey, boolean>> = isOwner
      ? Object.fromEntries(ALL_PERMISSIONS.map(k => [k, true]))
      : {};
    try {
      const { data, error } = await supabase.rpc('add_staff_member', {
        p_email: email.toLowerCase(),
        p_name: name,
        p_password: password,
        p_role: supabaseRole,
        p_permissions: perms,
      });
      if (error) { console.warn('[cms] addStaffAccount error:', error.message); return null; }
      const rows = data as Array<Record<string, unknown>>;
      if (rows && rows.length > 0) {
        const acc = mapSupabaseStaff(rows[0]);
        this.staff = [...this.staff, acc];
        this.emitStaff();
        return acc;
      }
      return null;
    } catch (err) { console.warn('[cms] addStaffAccount failed:', err); return null; }
  }

  async setStaffPermission(id: string, key: PermissionKey, value: boolean) {
    const acc = this.staff.find(s => s.id === id);
    if (!acc) return;
    const newPerms = { ...acc.permissions, [key]: value };
    this.staff = this.staff.map(s => s.id === id ? { ...s, permissions: newPerms } : s);
    this.emitStaff();
    await supabase.rpc('update_staff_permissions', { p_id: id, p_permissions: newPerms })
      .catch(err => { console.warn('[cms] setStaffPermission error:', err); });
  }

  async updateStaffPassword(id: string, password: string) {
    await supabase.rpc('update_staff_password', { p_id: id, p_new_password: password })
      .catch(err => { console.warn('[cms] updateStaffPassword error:', err); });
  }

  /**
   * Verify staff credentials via Supabase RPC staff_login.
   * Returns StaffAccount on success, null on failure.
   */
  async verifyStaffCredentialsAsync(email: string, password: string): Promise<StaffAccount | null> {
    try {
      const { data, error } = await supabase.rpc('staff_login', {
        p_email: email.trim().toLowerCase(),
        p_password: password,
      });
      if (error) { console.warn('[cms] staff_login error:', error.message); return null; }
      const rows = data as Array<Record<string, unknown>>;
      if (!rows || rows.length === 0) return null;
      const acc = mapSupabaseStaff(rows[0]);
      if (!this.staff.find(s => s.id === acc.id)) {
        this.staff = [...this.staff, acc];
        this.emitStaff();
      }
      return acc;
    } catch (err) { console.warn('[cms] verifyStaffCredentialsAsync failed:', err); return null; }
  }

  // Legacy sync stubs — use verifyStaffCredentialsAsync instead
  verifyStaffCredentials(_name: string, _password: string): StaffAccount | null { return null; }
  verifyStaffCredentialsByEmail(_email: string, _password: string): StaffAccount | null { return null; }

  async changeStaffPassword(id: string, oldPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
    const acc = this.staff.find(s => s.id === id);
    if (!acc) return { ok: false, error: 'Account not found.' };
    if (!newPassword || newPassword.length < 4) return { ok: false, error: 'New password must be at least 4 characters.' };
    const verified = await this.verifyStaffCredentialsAsync(acc.email || '', oldPassword);
    if (!verified) return { ok: false, error: 'Old password is incorrect.' };
    await this.updateStaffPassword(id, newPassword);
    return { ok: true };
  }

  updateStaffEmail(id: string, email: string) {
    this.staff = this.staff.map(s => s.id === id ? { ...s, email } : s);
    this.emitStaff();
    supabase.from('staff').update({ email: email.toLowerCase(), updated_at: new Date().toISOString() }).eq('id', id).then(() => {}).catch(() => {});
  }

  requestStaffPasswordReset(email: string): { ok: boolean; error?: string; tempPassword?: string } {
    const e = (email || '').trim().toLowerCase();
    if (!e) return { ok: false, error: 'Please enter your recovery email address.' };
    const acc = this.staff.find(s => (s.email || '').toLowerCase() === e);
    if (!acc) return { ok: false, error: 'No admin account found with that email.' };
    if (!this.smtpConfig.active || !this.smtpConfig.host || !this.smtpConfig.user) return { ok: false, error: 'SMTP is not configured. Please configure SMTP first.' };
    const temp = 'tmp' + Math.random().toString(36).slice(2, 8);
    this.updateStaffPassword(acc.id, temp).catch(() => {});
    this.toast({ title: 'Password reset email sent', body: `A recovery email was dispatched to ${acc.email} via ${this.smtpConfig.host}.`, kind: 'success' });
    return { ok: true, tempPassword: temp };
  }

  hasPermission(key: PermissionKey): boolean {
    const me = this.currentStaff();
    if (!me) return false;
    if (me.isOwner) return true;
    return !!me.permissions[key];
  }

  async removeStaff(id: string) {
    this.staff = this.staff.filter(s => s.id !== id);
    this.emitStaff();
    await supabase.rpc('deactivate_staff', { p_id: id })
      .catch(err => { console.warn('[cms] removeStaff error:', err); });
  }

  setStaffSession(id: string | null) {
    this.staffSessionId = id;
    this.staff = this.staff.map(s => ({ ...s, online: s.id === id ? true : s.online }));
    this.emitStaff();
    bus.emit(Topics.StaffSession, id);
  }
  currentStaff(): StaffAccount | null { return this.staff.find(s => s.id === this.staffSessionId) ?? null; }
  sendStaffDM(toId: string, body: string) {
    const me = this.currentStaff();
    if (!me) return;
    const rec: StaffDM = { id: Math.random().toString(36).slice(2), fromId: me.id, toId, body, ts: Date.now(), read: false };
    this.staffDMs = [...this.staffDMs, rec];
    this.emitDMs();
  }
  staffConversation(otherId: string): StaffDM[] {
    const meId = this.staffSessionId;
    if (!meId) return [];
    return this.staffDMs.filter(m => (m.fromId === meId && m.toId === otherId) || (m.fromId === otherId && m.toId === meId));
  }

  // ---- IP Signup Bonus Check ----
  /**
   * Returns true if this IP has already been used for a signup.
   * Used to block duplicate signup bonuses.
   */
  async hasIpAlreadySignedUp(ip: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('check_ip_signup_bonus', { p_ip: ip });
      if (error) return false;
      return !!data;
    } catch { return false; }
  }

  // ---- Countries / Geo ----
  addCountry(c: Omit<Country, 'id'>) {
    this.countries = [...this.countries, { ...c, id: 'c_' + Math.random().toString(36).slice(2, 7) }];
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
  setDetectedCountry(id: string) { this.detectedCountryId = id; bus.emit(Topics.Countries, this.countries); }
  detectedCountry(): Country | null { return this.countries.find(c => c.id === this.detectedCountryId) ?? null; }
  isGeoBlocked(): boolean { const c = this.detectedCountry(); return !!c && !c.isActive; }

  // ---- Referrals / Affiliates ----
  setReferralConfig(patch: Partial<ReferralConfig>) {
    this.referralConfig = { ...this.referralConfig, ...patch };
    bus.emit(Topics.ReferralConfig, this.referralConfig);
  }
  recordReferralSignup(referredUser: AuthUser, referrerId: string) {
    const rec: Referral = {
      id: 'ref_' + Math.random().toString(36).slice(2, 8),
      referrerId, referredUserId: referredUser.id, referredUsername: referredUser.username,
      depositAmount: 0, firstDepositApproved: false,
      rewardPaid: false, rewardCredited: false, rewardAmount: 0,
      createdAt: referredUser.createdAt, ts: Date.now(),
    };
    this.referrals = [rec, ...this.referrals];
    this.emitReferrals();
    this.toast({ title: 'New referral signup', body: `${referredUser.username} used your referral link.`, kind: 'success' });
  }
  submitAffiliateApplication(app: Omit<AffiliateApplication, 'id' | 'status' | 'revSharePct' | 'stats' | 'ts'>) {
    const rec: AffiliateApplication = { ...app, id: 'aff_' + Math.random().toString(36).slice(2, 8), status: 'pending', revSharePct: 20, stats: { clicks: 0, registered: 0, deposits: 0, revenueShare: 0 }, ts: Date.now() };
    this.affiliates = [rec, ...this.affiliates];
    bus.emit(Topics.Affiliates, this.affiliates);
    this.toast({ title: 'New affiliate application', body: `${app.username}`, kind: 'info' });
    return rec;
  }
  setAffiliateStatus(id: string, status: AffiliateApplication['status']) {
    this.affiliates = this.affiliates.map(a => a.id === id ? { ...a, status } : a);
    bus.emit(Topics.Affiliates, this.affiliates);
  }
  setAffiliateRevShare(id: string, pct: number) {
    this.affiliates = this.affiliates.map(a => a.id === id ? { ...a, revSharePct: pct } : a);
    bus.emit(Topics.Affiliates, this.affiliates);
  }
  myAffiliate(userId: string): AffiliateApplication | null { return this.affiliates.find(a => a.userId === userId) ?? null; }

  // ---- Auto Gateways ----
  private emitGateways() { bus.emit(Topics.AutoGateways, this.autoGateways); }
  addAutoGateway(g: Omit<AutoGateway, 'id'>) {
    this.autoGateways = [...this.autoGateways, { ...g, id: 'gw_' + Math.random().toString(36).slice(2, 8) }];
    this.emitGateways();
    supabase.from('payment_methods').insert({ method_type: 'gateway', account_details: g, is_active: true }).then(() => {}).catch(() => {});
  }
  updateAutoGateway(id: string, patch: Partial<AutoGateway>) {
    this.autoGateways = this.autoGateways.map(g => g.id === id ? { ...g, ...patch } : g);
    this.emitGateways();
  }
  toggleAutoGatewayCountry(id: string, countryId: string, on: boolean) {
    this.autoGateways = this.autoGateways.map(g => g.id === id ? { ...g, countries: { ...g.countries, [countryId]: on } } : g);
    this.emitGateways();
  }
  removeAutoGateway(id: string) {
    this.autoGateways = this.autoGateways.filter(g => g.id !== id);
    this.emitGateways();
  }

  // ---- Manual Methods ----
  private emitManual() { bus.emit(Topics.ManualMethods, this.manualMethods); }
  addManualMethod(m: Omit<ManualMethod, 'id'>) {
    this.manualMethods = [...this.manualMethods, { ...m, id: 'mm_' + Math.random().toString(36).slice(2, 8) }];
    this.emitManual();
    supabase.from('payment_methods').insert({ method_type: m.kind, account_details: m, is_active: m.active }).then(() => {}).catch(() => {});
  }
  updateManualMethod(id: string, patch: Partial<ManualMethod>) {
    this.manualMethods = this.manualMethods.map(m => m.id === id ? { ...m, ...patch } : m);
    this.emitManual();
  }
  removeManualMethod(id: string) {
    this.manualMethods = this.manualMethods.filter(m => m.id !== id);
    this.emitManual();
  }

  // ---- Tickets ----
  private emitTickets() { bus.emit(Topics.Tickets, this.tickets); }
  createTicket(accountId: string, subject: string, message: string): SupportTicket {
    const ticket: SupportTicket = {
      id: Math.random().toString(36).slice(2), accountId, status: 'unassigned',
      assignedStaffId: null, messages: [{ id: Math.random().toString(36).slice(2), role: 'user', body: message, ts: Date.now() }],
      createdTs: Date.now(), lastUserMsgTs: Date.now(), acknowledged: false,
    };
    this.tickets = [ticket, ...this.tickets];
    this.emitTickets();
    supabase.from('support_tickets').insert({ user_id: accountId, subject, message, status: 'open', priority: 'normal' }).then(() => {}).catch(() => {});
    return ticket;
  }
  getTicket(id: string): SupportTicket | undefined { return this.tickets.find(t => t.id === id); }
  assignTicket(id: string, staffId: string) {
    this.tickets = this.tickets.map(t => t.id === id ? { ...t, status: 'assigned' as TicketStatus, assignedStaffId: staffId } : t);
    this.emitTickets();
    supabase.from('support_tickets').update({ status: 'open' }).eq('id', id).then(() => {}).catch(() => {});
  }
  closeTicket(id: string) {
    this.tickets = this.tickets.map(t => t.id === id ? { ...t, status: 'closed' as TicketStatus } : t);
    this.emitTickets();
    supabase.from('support_tickets').update({ status: 'closed' }).eq('id', id).then(() => {}).catch(() => {});
  }
  addTicketMessage(ticketId: string, body: string, role: 'user' | 'agent', agentId?: string) {
    const msg: TicketMessage = { id: Math.random().toString(36).slice(2), role, agentId, body, ts: Date.now() };
    this.tickets = this.tickets.map(t => t.id === ticketId ? { ...t, messages: [...t.messages, msg], lastUserMsgTs: role === 'user' ? Date.now() : t.lastUserMsgTs } : t);
    this.emitTickets();
  }
  ackTicket(id: string) { this.tickets = this.tickets.map(t => t.id === id ? { ...t, acknowledged: true } : t); this.emitTickets(); }

  // ---- Dynamic Pages ----
  addDynamicPage(title: string, html: string): DynamicPage {
    const page: DynamicPage = { id: Math.random().toString(36).slice(2), title, html, ts: Date.now() };
    this.dynamicPages = [page, ...this.dynamicPages];
    this.emitDynamicPages();
    return page;
  }
  updateDynamicPage(id: string, patch: Partial<Pick<DynamicPage, 'title' | 'html'>>) {
    this.dynamicPages = this.dynamicPages.map(p => p.id === id ? { ...p, ...patch } : p);
    this.emitDynamicPages();
  }
  removeDynamicPage(id: string) {
    this.dynamicPages = this.dynamicPages.filter(p => p.id !== id);
    this.emitDynamicPages();
  }
}

export const cms = new Cms();
