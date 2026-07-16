// CMS / admin-managed runtime content: banners, logo, UPI QR, deposit page HTML,
// email templates, finance ledger, support inbox, staff sub-accounts and DMs.
// In-memory only — extends the existing store/bus pattern without touching the
// core game engines or auth/security flows.
import { bus, Topics } from './bus';
import { store } from './store';
import type { AuthUser } from './auth';
import { uploadFile, deleteFile } from './uploadService';

export interface BannerSlide {
  id: string;
  imageDataUrl: string;
  imageUrl?: string; // Supabase Storage URL
  linkUrl: string;
}

export interface DepositRequest {
  id: string;
  user: string;
  amount: number;
  method: string;
  utr?: string;
  details?: string;
  reason?: string;
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'cancelled';
  ts: number;
}

export interface WithdrawalRequest {
  id: string;
  user: string;
  amount: number;
  destination: string;
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'cancelled';
  utr?: string;
  reason?: string;
  details?: string;
  ts: number;
}

export interface SupportMessage {
  id: string;
  from: string;
  body: string;
  ts: number;
  read: boolean;
}

export type StaffRole = 'support' | 'finance';

/** Per-tab permission keys mirror AdminView tab keys. */
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
  id: string;
  name: string;
  password: string;
  role: StaffRole;
  online: boolean;
  /** Optional email used for password recovery (SMTP). */
  email?: string;
  /** Per-tab access toggles. Missing key = denied. Admin role bypasses. */
  permissions: Partial<Record<PermissionKey, boolean>>;
  isOwner?: boolean;
}

export interface Country {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  currency: string;
  manualDepositMethods: string[];
  manualWithdrawalMethods: string[];
}

export interface ReferralConfig {
  rewardAmount: number;
  minDeposit: number;
  tierPercent: number;
  tierThreshold: number;
}

export interface Referral {
  id: string;
  referrerId: string;
  referredUserId: string;
  referredUsername: string;
  depositAmount: number;
  firstDepositApproved: boolean;
  rewardPaid: boolean;
  rewardCredited: boolean;
  rewardAmount: number;
  createdAt: number;
  paidAt?: number;
  ts: number;
}

export interface AffiliateApplication {
  id: string;
  userId: string;
  username: string;
  email: string;
  telegram: string;
  trafficSource: string;
  estimatedTraffic: string;
  status: 'pending' | 'approved' | 'rejected';
  revSharePct: number;
  stats: { clicks: number; registered: number; deposits: number; revenueShare: number };
  ts: number;
}
export interface AutoGateway {
  id: string;
  name: string;
  secretKey: string;
  publicKey: string;
  merchantId: string;
  webhookUrl: string;
  minDeposit: number;
  maxDeposit: number;
  /** Map of countryId -> enabled. */
  countries: Record<string, boolean>;
}

/** Crypto currency configuration */
export interface CryptoCurrency {
  id: string;
  name: string;           // e.g. "USDT", "BTC", "ETH"
  network: string;        // e.g. "TRC20", "ERC20", "BEP20"
  walletAddress: string;
  gasFee: number;         // Optional gas fee (0 = none)
  minDeposit: number;
  maxDeposit: number;
  minWithdrawal: number;
  maxWithdrawal: number;
}

export type ManualMethodKind = 'bank' | 'upi' | 'qr' | 'custom' | 'crypto';
export type ManualMethodFlow = 'deposit' | 'withdrawal';
export interface ManualMethod {
  id: string;
  kind: ManualMethodKind;
  flow: ManualMethodFlow;
  label: string;            // display/method name
  active: boolean;          // active/inactive toggle
  // min/max amounts
  minAmount: number;
  maxAmount: number;
  // bank fields
  accountNumber?: string;
  bankName?: string;
  ifsc?: string;
  holderName?: string;
  // upi fields
  upiId?: string;
  upiDisplayName?: string;
  // qr
  qrDataUrl?: string;
  // crypto fields
  cryptoCurrencies?: CryptoCurrency[];  // list of supported crypto currencies
  // custom
  html?: string;            // per-method HTML rendered in user deposit UI
  customData?: string;      // admin-editable raw text / instructions for custom methods
  /** Map of countryId -> enabled. */
  countries: Record<string, boolean>;
}

export interface TicketAttachment {
  kind: 'image' | 'pdf';
  dataUrl: string;
  name: string;
}
export interface TicketMessage {
  id: string;
  role: 'user' | 'agent';
  agentId?: string;
  body: string;
  ts: number;
  attachments?: TicketAttachment[];
}
export type TicketStatus = 'unassigned' | 'assigned' | 'closed';
export interface SupportTicket {
  id: string;
  accountId: string;        // 6-digit user id
  status: TicketStatus;
  assignedStaffId: string | null;
  messages: TicketMessage[];
  createdTs: number;
  lastUserMsgTs: number;
  /** Set to true when claimed/handled, persists until close. */
  acknowledged: boolean;
}



export interface StaffDM {
  id: string;
  fromId: string;
  toId: string;
  body: string;
  ts: number;
  read: boolean;
}

export interface EmailTemplates {
  welcome: string;
  depositSuccess: string;
  withdrawalStatus: string;
}

export interface SmtpConfig {
  host: string;
  port: string;
  user: string;
  pass: string;
  tls: boolean;
  active: boolean;
}

export interface DynamicPage {
  id: string;
  title: string;
  html: string;
  ts: number;
}

export interface ToastEvent {
  id: string;
  title: string;
  body: string;
  kind: 'info' | 'success' | 'warn' | 'alert';
}

export type NotificationTemplateKind = 'info' | 'success' | 'warn' | 'alert';

/** A managed notification template — admin-created or auto-generated. */
export interface NotificationTemplate {
  id: string;
  title: string;
  body: string;
  kind: NotificationTemplateKind;
  /** Whether this notification is sent/shown to users. */
  isActive: boolean;
  /** Auto-generated templates (e.g. welcome, deposit) cannot be deleted, only toggled. */
  isAutoGenerated: boolean;
  createdAt: number;
}

const defaultBanners: BannerSlide[] = [
  {
    id: 'b1',
    imageDataUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="%23b15eff"/><stop offset="1" stop-color="%2300ff88"/></linearGradient></defs><rect width="800" height="300" fill="url(%23g)"/><text x="40" y="160" fill="white" font-family="Inter" font-size="48" font-weight="800">Welcome Bonus ₹15,000</text></svg>'
      ),
    linkUrl: 'https://b4bet.com/promo/welcome',
  },
];

const defaultDepositHtml = `<div style="font-family:Inter,sans-serif;padding:16px;background:#0f1225;color:#fff;border-radius:14px">
  <h2 style="margin:0 0 8px;color:#00ff88">Manual UPI Deposit</h2>
  <p style="margin:0 0 8px">1. Scan the UPI QR above with any UPI app.</p>
  <p style="margin:0 0 8px">2. Pay the exact amount you entered.</p>
  <p style="margin:0">3. Submit the UTR / Transaction ID below for credit.</p>
</div>`;

const defaultUpiQr =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="white"/><g fill="black"><rect x="10" y="10" width="60" height="60"/><rect x="20" y="20" width="40" height="40" fill="white"/><rect x="30" y="30" width="20" height="20"/><rect x="130" y="10" width="60" height="60"/><rect x="140" y="20" width="40" height="40" fill="white"/><rect x="150" y="30" width="20" height="20"/><rect x="10" y="130" width="60" height="60"/><rect x="20" y="140" width="40" height="40" fill="white"/><rect x="30" y="150" width="20" height="20"/><rect x="90" y="90" width="20" height="20"/><rect x="120" y="120" width="10" height="10"/><rect x="140" y="100" width="10" height="10"/></g></svg>'
  );

const defaultEmails: EmailTemplates = {
  welcome: `<div style="font-family:Inter,sans-serif;background:#0a0f1c;color:#fff;padding:24px;border-radius:12px">
  <h1 style="margin:0 0 16px;color:#00ff88;font-size:28px">Welcome to B4BeT, {{username}}!</h1>
  <p style="margin:0 0 12px;font-size:16px">Your account is now live and ready to play.</p>
  <p style="margin:0 0 12px;font-size:14px">Enjoy our exclusive games, live betting, and amazing rewards.</p>
  <p style="margin:0;font-size:14px;color:#a0aec0">Start playing now and claim your welcome bonus on your first deposit!</p>
</div>`,
  depositSuccess: `<h1>Deposit successful</h1><p>Hi {{username}}, {{amount}} has been credited. New balance: {{balance}}.</p>`,
  withdrawalStatus: `<h1>Withdrawal {{status}}</h1><p>Hi {{username}}, your withdrawal of {{amount}} is now {{status}}.</p>`,
};

class Cms {
  banners: BannerSlide[] = defaultBanners;
  logoDataUrl: string | null = null;
  textLogoDataUrl: string | null = null;
  faviconDataUrl: string | null = null;
  upiQrDataUrl: string = defaultUpiQr;
  depositPageHtml: string = defaultDepositHtml;
  withdrawalPageHtml: string = `<div style="font-family:Inter,sans-serif;padding:16px;background:#0f1225;color:#fff;border-radius:14px">
  <h2 style="margin:0 0 8px;color:#ff5a5a">Manual UPI Withdrawal</h2>
  <p style="margin:0 0 8px">1. Enter your UPI ID below.</p>
  <p style="margin:0 0 8px">2. Request the amount you want to withdraw.</p>
  <p style="margin:0">3. Admin will process and send the payout.</p>
</div>`;
  emailTemplates: EmailTemplates = { ...defaultEmails };

  smtpConfig: SmtpConfig = {
    host: 'smtp.b4bet.com',
    port: '587',
    user: 'noreply@b4bet.com',
    pass: '',
    tls: true,
    active: false,
  };

  deposits: DepositRequest[] = [];
  withdrawals: WithdrawalRequest[] = [];
  support: SupportMessage[] = [];

  staff: StaffAccount[] = [];
  staffSessionId: string | null = null;
  staffDMs: StaffDM[] = [];

  countries: Country[] = [
    { id: 'c_in', name: 'India', code: 'IN', isActive: true, currency: '₹', manualDepositMethods: ['UPI','IMPS'], manualWithdrawalMethods: ['UPI','Bank'] },
    { id: 'c_us', name: 'United States', code: 'US', isActive: false, currency: '$', manualDepositMethods: ['Wire'], manualWithdrawalMethods: ['Wire'] },
    { id: 'c_uk', name: 'United Kingdom', code: 'GB', isActive: true, currency: '£', manualDepositMethods: ['Bank'], manualWithdrawalMethods: ['Bank'] },
  ];
  /** Detected client country id (mock — defaults to India). */
  detectedCountryId: string = 'c_in';

  referralConfig: ReferralConfig = { rewardAmount: 100, minDeposit: 500, tierPercent: 10, tierThreshold: 3 };

  autoGateways: AutoGateway[] = [];
  manualMethods: ManualMethod[] = [
    {
      id: 'mm_dep_upi_1', kind: 'upi', flow: 'deposit', label: 'UPI (PhonePe/GPay)',
      active: false, minAmount: 100, maxAmount: 50000,
      upiId: '', upiDisplayName: '',
      countries: { c_in: true },
    },
    {
      id: 'mm_dep_bank_1', kind: 'bank', flow: 'deposit', label: 'Bank Transfer',
      active: false, minAmount: 500, maxAmount: 100000,
      accountNumber: '', bankName: '', ifsc: '', holderName: '',
      countries: { c_in: true },
    },
    {
      id: 'mm_dep_crypto_1', kind: 'crypto', flow: 'deposit', label: 'Crypto Deposit',
      active: true, minAmount: 100, maxAmount: 500000,
      cryptoCurrencies: [
        { id: 'cc_1', name: 'USDT', network: 'TRC20', walletAddress: '', gasFee: 1, minDeposit: 50, maxDeposit: 200000, minWithdrawal: 100, maxWithdrawal: 100000 },
        { id: 'cc_2', name: 'USDT', network: 'ERC20', walletAddress: '', gasFee: 10, minDeposit: 100, maxDeposit: 200000, minWithdrawal: 200, maxWithdrawal: 100000 },
        { id: 'cc_3', name: 'BTC', network: 'Bitcoin', walletAddress: '', gasFee: 0.0005, minDeposit: 500, maxDeposit: 500000, minWithdrawal: 1000, maxWithdrawal: 500000 },
      ],
      countries: { c_in: true, c_us: true, c_uk: true },
    },
    {
      id: 'mm_wd_upi_1', kind: 'upi', flow: 'withdrawal', label: 'UPI Withdrawal',
      active: true, minAmount: 200, maxAmount: 25000,
      countries: { c_in: true },
    },
    {
      id: 'mm_wd_bank_1', kind: 'bank', flow: 'withdrawal', label: 'Bank Withdrawal',
      active: true, minAmount: 500, maxAmount: 100000,
      countries: { c_in: true },
    },
    {
      id: 'mm_wd_crypto_1', kind: 'crypto', flow: 'withdrawal', label: 'Crypto Withdrawal',
      active: true, minAmount: 100, maxAmount: 500000,
      cryptoCurrencies: [
        { id: 'cc_w1', name: 'USDT', network: 'TRC20', walletAddress: '', gasFee: 1, minDeposit: 50, maxDeposit: 200000, minWithdrawal: 100, maxWithdrawal: 100000 },
        { id: 'cc_w2', name: 'USDT', network: 'ERC20', walletAddress: '', gasFee: 10, minDeposit: 100, maxDeposit: 200000, minWithdrawal: 200, maxWithdrawal: 100000 },
        { id: 'cc_w3', name: 'BTC', network: 'Bitcoin', walletAddress: '', gasFee: 0.0005, minDeposit: 500, maxDeposit: 500000, minWithdrawal: 1000, maxWithdrawal: 500000 },
      ],
      countries: { c_in: true, c_us: true, c_uk: true },
    },
  ];
  tickets: SupportTicket[] = [];

  referrals: Referral[] = [];
  affiliates: AffiliateApplication[] = [];
  dynamicPages: DynamicPage[] = [];

  private _notificationTemplates: NotificationTemplate[] = [
    { id: 'nt_welcome', title: 'Welcome!', body: 'Account created. Welcome aboard!', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_login', title: 'Logged In', body: 'Welcome back! Your session is now active.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_logout', title: 'Logged Out', body: 'Your session has ended. See you next time!', kind: 'info', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_password_reset', title: 'Password Reset Successful', body: 'Your password has been updated successfully.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_password_changed', title: 'Password Changed', body: 'Your password was updated successfully.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_deposit_ok', title: 'Deposit Confirmed', body: 'Your deposit has been approved. Funds are now available in your balance.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_withdrawal_ok', title: 'Withdrawal Processed', body: 'Your withdrawal request has been processed. Funds are on the way.', kind: 'info', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_referral_reward', title: 'Referral Reward', body: 'You earned a bonus from a referral deposit!', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_pending_rewards', title: 'Pending Rewards Credited', body: 'Pending referral rewards have been added to your balance.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_redeem', title: 'Redeem Code Applied', body: 'Your promo code unlocked bonus credits.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_promo', title: 'Special Offer', body: 'Exclusive promo available! Check the promotions page for your reward.', kind: 'warn', isActive: false, isAutoGenerated: false, createdAt: Date.now() },
    { id: 'nt_profile_updated', title: 'Profile updated', body: 'Your contact info was saved.', kind: 'success', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_cashout_failed', title: 'Cashout failed', body: 'Your cashout could not be completed.', kind: 'warn', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
    { id: 'nt_mines_failed', title: 'Mines failed', body: 'Your Mines action could not be completed.', kind: 'warn', isActive: true, isAutoGenerated: true, createdAt: Date.now() },
  ];

  private static NOTIF_TEMPLATES_KEY = 'b4bet.cms.notifTemplates';

  get notificationTemplates(): NotificationTemplate[] {
    return this._notificationTemplates;
  }

  private loadNotificationTemplates() {
    try {
      const raw = localStorage.getItem(Cms.NOTIF_TEMPLATES_KEY);
      if (raw) this._notificationTemplates = JSON.parse(raw) as NotificationTemplate[];
    } catch { /* ignore */ }
  }

  private persistNotificationTemplates() {
    try {
      localStorage.setItem(Cms.NOTIF_TEMPLATES_KEY, JSON.stringify(this._notificationTemplates));
    } catch { /* ignore */ }
  }

  private emitNotificationTemplates() {
    bus.emit('cms:notif_templates', this._notificationTemplates);
  }

  addNotificationTemplate(t: Omit<NotificationTemplate, 'id' | 'createdAt' | 'isAutoGenerated'>): NotificationTemplate {
    const tpl: NotificationTemplate = { ...t, id: 'nt_' + Math.random().toString(36).slice(2), createdAt: Date.now(), isAutoGenerated: false };
    this._notificationTemplates = [...this._notificationTemplates, tpl];
    this.persistNotificationTemplates();
    this.emitNotificationTemplates();
    return tpl;
  }

  toggleNotificationTemplate(id: string, isActive: boolean) {
    this._notificationTemplates = this._notificationTemplates.map((t) => t.id === id ? { ...t, isActive } : t);
    this.persistNotificationTemplates();
    this.emitNotificationTemplates();
  }

  deleteNotificationTemplate(id: string) {
    const tpl = this._notificationTemplates.find((t) => t.id === id);
    if (tpl?.isAutoGenerated) return;
    this._notificationTemplates = this._notificationTemplates.filter((t) => t.id !== id);
    this.persistNotificationTemplates();
    this.emitNotificationTemplates();
  }

  updateNotificationTemplate(id: string, patch: Partial<Pick<NotificationTemplate, 'title' | 'body' | 'kind'>>) {
    this._notificationTemplates = this._notificationTemplates.map((t) => t.id === id ? { ...t, ...patch } : t);
    this.persistNotificationTemplates();
    this.emitNotificationTemplates();
  }

  // ---------- emitters ----------
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

  toast(t: Omit<ToastEvent, 'id'>) {
    bus.emit(Topics.Toast, { ...t, id: Math.random().toString(36).slice(2) });
  }

  /**
   * Push a user notification by template ID.
   * Only sends if the template exists AND isActive.
   * Falls back to direct pushNotification if template not found.
   */
  pushFromTemplate(templateId: string, fallbackTitle: string, fallbackBody: string, fallbackKind: NotificationTemplateKind = 'info') {
    const tpl = this._notificationTemplates.find((t) => t.id === templateId);
    if (tpl && tpl.isActive) {
      store.pushNotification({ title: tpl.title, body: tpl.body, kind: tpl.kind });
      return;
    }
    // Fallback: send the hardcoded notification only if no active template
    if (!tpl) {
      store.pushNotification({ title: fallbackTitle, body: fallbackBody, kind: fallbackKind });
    }
  }

  // ---------- banners ----------
  addBanner(imageDataUrl: string, linkUrl = '') {
    this.banners = [...this.banners, { id: Math.random().toString(36).slice(2), imageDataUrl, linkUrl }];
    this.emitBanners();
  }
  updateBanner(id: string, patch: Partial<BannerSlide>) {
    this.banners = this.banners.map((b) => (b.id === id ? { ...b, ...patch } : b));
    this.emitBanners();
  }
  removeBanner(id: string) {
    this.banners = this.banners.filter((b) => b.id !== id);
    this.emitBanners();
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

  setSmtpConfig(patch: Partial<SmtpConfig>) {
    this.smtpConfig = { ...this.smtpConfig, ...patch };
  }

  // ---------- finance ----------
  submitDeposit(user: string, amount: number, method: string, utr?: string, details?: string) {
    const rec: DepositRequest = { id: Math.random().toString(36).slice(2), user, amount, method, utr, details, status: 'pending', ts: Date.now() };
    this.deposits = [rec, ...this.deposits];
    this.emitFinance();
    this.toast({ title: 'New deposit request', body: `${user} • ₹${amount}`, kind: 'info' });
  }
  submitWithdrawal(user: string, amount: number, destination: string, details?: string) {
    const rec: WithdrawalRequest = { id: Math.random().toString(36).slice(2), user, amount, destination, details, status: 'pending', ts: Date.now() };
    this.withdrawals = [rec, ...this.withdrawals];
    this.emitFinance();
    this.toast({ title: 'New withdrawal request', body: `${user} • ₹${amount}`, kind: 'warn' });
  }
  setDepositStatus(id: string, status: DepositRequest['status'], utr?: string, reason?: string) {
    const before = this.deposits.find((d) => d.id === id);
    this.deposits = this.deposits.map((d) =>
      d.id === id ? { ...d, status, utr: utr !== undefined ? utr : d.utr, reason: reason !== undefined ? reason : d.reason } : d
    );
    if (before && before.status !== status) {
      const statusLabel = status === 'approved' ? 'Successful' : status === 'cancelled' ? 'Cancelled' : status === 'processing' ? 'Processing' : status === 'rejected' ? 'Failed' : status;
      const reasonText = reason ? `: ${reason}` : '';
      this.pushFromTemplate('nt_deposit_ok', `Deposit ${statusLabel}`, `Your deposit of ${store.currency}${before.amount.toFixed(2)} via ${before.method} is ${status}${reasonText}.`, status === 'approved' ? 'success' : status === 'processing' ? 'info' : 'warn');
    }
    if (before && before.status !== 'approved' && status === 'approved') {
      bus.emit(Topics.ReferralDepositApproved, { username: before.user, amount: before.amount });
      // Credit the target user's persisted balance immediately on approval.
      // This works even when the admin (not the depositor) is currently
      // logged in — the balance is stored per-user and restored on next login.
      try {
        store.creditUser(before.user, before.amount);
      } catch { /* ignore */ }
    }
    this.emitFinance();
  }
  setWithdrawalStatus(id: string, status: WithdrawalRequest['status'], utr?: string, reason?: string) {
    const before = this.withdrawals.find((w) => w.id === id);
    this.withdrawals = this.withdrawals.map((w) =>
      w.id === id ? { ...w, status, utr: utr !== undefined ? utr : w.utr, reason: reason !== undefined ? reason : w.reason } : w
    );
    if (before && before.status !== status) {
      const statusLabel = status === 'approved' ? 'Successful' : status === 'cancelled' ? 'Cancelled' : status === 'processing' ? 'Processing' : status === 'rejected' ? 'Failed' : status;
      const utrText = utr ? ` (UTR: ${utr})` : '';
      const reasonText = reason ? `: ${reason}` : '';
      this.pushFromTemplate('nt_withdrawal_ok', `Withdrawal ${statusLabel}`, `Your withdrawal of ${store.currency}${before.amount.toFixed(2)} to ${before.destination} is ${status}${utrText}${reasonText}.`, status === 'approved' ? 'success' : status === 'processing' ? 'info' : 'warn');
      this.toast({
        title: `Withdrawal ${status === 'approved' ? 'Activated' : status === 'processing' ? 'Processing' : 'Rejected'}`,
        body: `${store.currency}${before.amount.toFixed(2)} → ${before.destination}${utrText}`,
        kind: status === 'approved' ? 'success' : status === 'processing' ? 'info' : 'warn',
      });
    }
    this.emitFinance();
  }
  totals() {
    const approved = (xs: { amount: number; status: string }[]) =>
      xs.filter((x) => x.status === 'approved').reduce((s, x) => s + x.amount, 0);
    const totalDeposits = approved(this.deposits);
    const totalWithdrawals = approved(this.withdrawals);
    return {
      totalDeposits,
      totalWithdrawals,
      profit: totalDeposits - totalWithdrawals,
      pendingDeposits: this.deposits.filter((d) => d.status === 'pending' || d.status === 'processing').length,
      pendingWithdrawals: this.withdrawals.filter((w) => w.status === 'pending' || w.status === 'processing').length,
    };
  }

  // ---------- support ----------
  submitSupport(from: string, body: string) {
    const rec: SupportMessage = { id: Math.random().toString(36).slice(2), from, body, ts: Date.now(), read: false };
    this.support = [rec, ...this.support];
    this.emitSupport();
    this.toast({ title: 'New support message', body: `${from}: ${body.slice(0, 40)}`, kind: 'info' });
  }
  markSupportRead(id?: string) {
    this.support = this.support.map((s) => (!id || s.id === id ? { ...s, read: true } : s));
    this.emitSupport();
  }
  unreadSupport() { return this.support.filter((s) => !s.read).length; }

  // ---------- staff ----------
  addStaff(name: string, password: string, role: StaffRole, permissions: Partial<Record<PermissionKey, boolean>> = {}) {
    const rec: StaffAccount = { id: 'st_' + Math.random().toString(36).slice(2, 8), name, password, role, online: false, permissions };
    this.staff = [...this.staff, rec];
    this.emitStaff();
  }
  setStaffPermission(id: string, key: PermissionKey, value: boolean) {
    this.staff = this.staff.map((s) => s.id === id ? { ...s, permissions: { ...s.permissions, [key]: value } } : s);
    this.emitStaff();
  }
  updateStaffPassword(id: string, password: string) {
    this.staff = this.staff.map((s) => s.id === id ? { ...s, password } : s);
    this.emitStaff();
  }
  /** Verify staff credentials by username (case-insensitive) and password. */
  verifyStaffCredentials(name: string, password: string): StaffAccount | null {
    const n = (name || '').trim().toLowerCase();
    const found = this.staff.find((s) => s.name.toLowerCase() === n && s.password === password);
    return found ?? null;
  }
  /** Verify staff credentials by email (case-insensitive) and password. */
  verifyStaffCredentialsByEmail(email: string, password: string): StaffAccount | null {
    const e = (email || '').trim().toLowerCase();
    const found = this.staff.find((s) => (s.email || '').toLowerCase() === e && s.password === password);
    return found ?? null;
  }
  /** Add a new admin staff account. */
  addStaffAccount(name: string, email: string, password: string, isOwner: boolean = false): StaffAccount {
    const acc: StaffAccount = {
      id: 'st_' + Math.random().toString(36).slice(2, 8),
      name,
      email: email.toLowerCase(),
      password,
      role: isOwner ? 'finance' : 'support',
      online: false,
      isOwner,
      permissions: isOwner ? Object.fromEntries(ALL_PERMISSIONS.map((k) => [k, true])) : {},
    };
    this.staff = [...this.staff, acc];
    this.emitStaff();
    return acc;
  }
  /** Change password after verifying the old one. Returns error string on failure. */
  changeStaffPassword(id: string, oldPassword: string, newPassword: string): { ok: boolean; error?: string } {
    const acc = this.staff.find((s) => s.id === id);
    if (!acc) return { ok: false, error: 'Account not found.' };
    if (acc.password !== oldPassword) return { ok: false, error: 'Old password is incorrect.' };
    if (!newPassword || newPassword.length < 4) return { ok: false, error: 'New password must be at least 4 characters.' };
    this.staff = this.staff.map((s) => s.id === id ? { ...s, password: newPassword } : s);
    this.emitStaff();
    return { ok: true };
  }
  /** Update the current staff account's email (used for password recovery). */
  updateStaffEmail(id: string, email: string) {
    this.staff = this.staff.map((s) => s.id === id ? { ...s, email } : s);
    this.emitStaff();
  }
  /**
   * Request a password reset email via SMTP for the staff account matching
   * the provided email. Generates a temporary password, updates the account
   * and simulates dispatching the reset via the configured SMTP server.
   */
  requestStaffPasswordReset(email: string): { ok: boolean; error?: string; tempPassword?: string } {
    const e = (email || '').trim().toLowerCase();
    if (!e) return { ok: false, error: 'Please enter your recovery email address.' };
    const acc = this.staff.find((s) => (s.email || '').toLowerCase() === e);
    if (!acc) return { ok: false, error: 'No admin account found with that email.' };
    if (!this.smtpConfig.active || !this.smtpConfig.host || !this.smtpConfig.user) {
      return { ok: false, error: 'SMTP is not configured. Please configure SMTP first.' };
    }
    const temp = 'tmp' + Math.random().toString(36).slice(2, 8);
    this.staff = this.staff.map((s) => s.id === acc.id ? { ...s, password: temp } : s);
    this.emitStaff();
    this.toast({
      title: 'Password reset email sent',
      body: `A recovery email was dispatched to ${acc.email} via ${this.smtpConfig.host}.`,
      kind: 'success',
    });
    return { ok: true, tempPassword: temp };
  }
  hasPermission(key: PermissionKey): boolean {
    const me = this.currentStaff();
    if (!me) return false;
    if (me.isOwner) return true;
    return !!me.permissions[key];
  }
  removeStaff(id: string) {
    this.staff = this.staff.filter((s) => s.id !== id);
    this.emitStaff();
  }

  setStaffSession(id: string | null) {
    this.staffSessionId = id;
    this.staff = this.staff.map((s) => ({ ...s, online: s.id === id ? true : s.online }));
    this.emitStaff();
    bus.emit(Topics.StaffSession, id);
  }
  currentStaff(): StaffAccount | null {
    return this.staff.find((s) => s.id === this.staffSessionId) ?? null;
  }
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
    return this.staffDMs.filter((m) => (m.fromId === meId && m.toId === otherId) || (m.fromId === otherId && m.toId === meId));
  }




  // ---------- countries / geo ----------
  addCountry(c: Omit<Country, 'id'>) {
    this.countries = [...this.countries, { ...c, id: 'c_' + Math.random().toString(36).slice(2, 7) }];
    bus.emit(Topics.Countries, this.countries);
  }
  updateCountry(id: string, patch: Partial<Country>) {
    this.countries = this.countries.map((c) => c.id === id ? { ...c, ...patch } : c);
    bus.emit(Topics.Countries, this.countries);
  }
  removeCountry(id: string) {
    this.countries = this.countries.filter((c) => c.id !== id);
    bus.emit(Topics.Countries, this.countries);
  }
  setDetectedCountry(id: string) {
    this.detectedCountryId = id;
    bus.emit(Topics.Countries, this.countries);
  }
  detectedCountry(): Country | null {
    return this.countries.find((c) => c.id === this.detectedCountryId) ?? null;
  }
  isGeoBlocked(): boolean {
    const c = this.detectedCountry();
    return !!c && !c.isActive;
  }

  // ---------- referrals / affiliates ----------
  setReferralConfig(patch: Partial<ReferralConfig>) {
    this.referralConfig = { ...this.referralConfig, ...patch };
    bus.emit(Topics.ReferralConfig, this.referralConfig);
  }
  recordReferralSignup(referredUser: AuthUser, referrerId: string) {
    const rec: Referral = {
      id: 'ref_' + Math.random().toString(36).slice(2, 8),
      referrerId,
      referredUserId: referredUser.id,
      referredUsername: referredUser.username,
      depositAmount: 0,
      firstDepositApproved: false,
      rewardPaid: false,
      rewardCredited: false,
      rewardAmount: 0,
      createdAt: referredUser.createdAt,
      ts: Date.now(),
    };
    this.referrals = [rec, ...this.referrals];
    this.emitReferrals();
    this.toast({ title: 'New referral signup', body: `${referredUser.username} used your referral link.`, kind: 'success' });
  }
  submitAffiliateApplication(app: Omit<AffiliateApplication, 'id' | 'status' | 'revSharePct' | 'stats' | 'ts'>) {
    const rec: AffiliateApplication = {
      ...app, id: 'aff_' + Math.random().toString(36).slice(2, 8),
      status: 'pending', revSharePct: 20,
      stats: { clicks: 0, registered: 0, deposits: 0, revenueShare: 0 }, ts: Date.now(),
    };
    this.affiliates = [rec, ...this.affiliates];
    bus.emit(Topics.Affiliates, this.affiliates);
    this.toast({ title: 'New affiliate application', body: `${app.username}`, kind: 'info' });
    return rec;
  }
  setAffiliateStatus(id: string, status: AffiliateApplication['status']) {
    this.affiliates = this.affiliates.map((a) => a.id === id ? { ...a, status } : a);
    bus.emit(Topics.Affiliates, this.affiliates);
  }
  setAffiliateRevShare(id: string, pct: number) {
    this.affiliates = this.affiliates.map((a) => a.id === id ? { ...a, revSharePct: pct } : a);
    bus.emit(Topics.Affiliates, this.affiliates);
  }
  myAffiliate(userId: string): AffiliateApplication | null {
    return this.affiliates.find((a) => a.userId === userId) ?? null;
  }

  // ---------- auto gateways ----------
  private emitGateways() { bus.emit(Topics.AutoGateways, this.autoGateways); }
  addAutoGateway(g: Omit<AutoGateway, 'id'>) {
    this.autoGateways = [...this.autoGateways, { ...g, id: 'gw_' + Math.random().toString(36).slice(2, 8) }];
    this.emitGateways();
  }
  updateAutoGateway(id: string, patch: Partial<AutoGateway>) {
    this.autoGateways = this.autoGateways.map((g) => g.id === id ? { ...g, ...patch } : g);
    this.emitGateways();
  }
  toggleAutoGatewayCountry(id: string, countryId: string, on: boolean) {
    this.autoGateways = this.autoGateways.map((g) =>
      g.id === id ? { ...g, countries: { ...g.countries, [countryId]: on } } : g
    );
    this.emitGateways();
  }
  removeAutoGateway(id: string) {
    this.autoGateways = this.autoGateways.filter((g) => g.id !== id);
    this.emitGateways();
  }

  // ---------- manual methods ----------
  private emitManual() { bus.emit(Topics.ManualMethods, this.manualMethods); }
  addManualMethod(m: Omit<ManualMethod, 'id'>) {
    this.manualMethods = [...this.manualMethods, { ...m, id: 'mm_' + Math.random().toString(36).slice(2, 8) }];
    this.emitManual();
  }
  updateManualMethod(id: string, patch: Partial<ManualMethod>) {
    this.manualMethods = this.manualMethods.map((m) => m.id === id ? { ...m, ...patch } : m);
    this.emitManual();
  }
  toggleManualMethodCountry(id: string, countryId: string, on: boolean) {
    this.manualMethods = this.manualMethods.map((m) =>
      m.id === id ? { ...m, countries: { ...m.countries, [countryId]: on } } : m
    );
    this.emitManual();
  }
  removeManualMethod(id: string) {
    this.manualMethods = this.manualMethods.filter((m) => m.id !== id);
    this.emitManual();
  }

  // ---------- support tickets ----------
  private emitTickets() { bus.emit(Topics.Tickets, this.tickets); }
  /** User opens a thread / sends a message. Creates ticket if none open. */
  postTicketMessage(accountId: string, body: string, attachments?: TicketAttachment[]) {
    let t = this.tickets.find((x) => x.accountId === accountId && x.status !== 'closed');
    const msg: TicketMessage = {
      id: Math.random().toString(36).slice(2),
      role: 'user', body, ts: Date.now(), attachments,
    };
    if (!t) {
      t = {
        id: 'tk_' + Math.random().toString(36).slice(2, 8),
        accountId, status: 'unassigned', assignedStaffId: null,
        messages: [msg], createdTs: Date.now(), lastUserMsgTs: Date.now(), acknowledged: false,
      };
      this.tickets = [t, ...this.tickets];
    } else {
      t.messages = [...t.messages, msg];
      t.lastUserMsgTs = Date.now();
      // re-surface alert if previously acknowledged
      t.acknowledged = t.status === 'assigned';
      this.tickets = [...this.tickets];
    }
    this.emitTickets();
    this.toast({ title: 'New support ticket message', body: `#${accountId}: ${body.slice(0, 40)}`, kind: 'info' });
    return t;
  }
  /** Agent claims / locks a ticket. Returns true on success. */
  claimTicket(ticketId: string, staffId: string): boolean {
    const t = this.tickets.find((x) => x.id === ticketId);
    if (!t) return false;
    if (t.status === 'assigned' && t.assignedStaffId !== staffId) return false;
    this.tickets = this.tickets.map((x) =>
      x.id === ticketId ? { ...x, status: 'assigned', assignedStaffId: staffId, acknowledged: true } : x
    );
    this.emitTickets();
    return true;
  }
  postTicketReply(ticketId: string, staffId: string, body: string) {
    const t = this.tickets.find((x) => x.id === ticketId);
    if (!t || t.assignedStaffId !== staffId) return false;
    const msg: TicketMessage = {
      id: Math.random().toString(36).slice(2),
      role: 'agent', agentId: staffId, body, ts: Date.now(),
    };
    this.tickets = this.tickets.map((x) =>
      x.id === ticketId ? { ...x, messages: [...x.messages, msg] } : x
    );
    this.emitTickets();
    return true;
  }
  /** Fully terminates and removes the ticket. */
  closeTicket(ticketId: string) {
    this.tickets = this.tickets.filter((x) => x.id !== ticketId);
    this.emitTickets();
  }
  ticketByAccount(accountId: string): SupportTicket | null {
    return this.tickets.find((x) => x.accountId === accountId && x.status !== 'closed') ?? null;
  }

  // ---------- dynamic pages ----------
  addDynamicPage(title: string, html: string) {
    this.dynamicPages = [...this.dynamicPages, { id: Math.random().toString(36).slice(2), title, html, ts: Date.now() }];
    this.emitDynamicPages();
  }
  updateDynamicPage(id: string, patch: Partial<DynamicPage>) {
    this.dynamicPages = this.dynamicPages.map((p) => p.id === id ? { ...p, ...patch } : p);
    this.emitDynamicPages();
  }
  removeDynamicPage(id: string) {
    this.dynamicPages = this.dynamicPages.filter((p) => p.id !== id);
    this.emitDynamicPages();
  }

  // ---------- File uploads to Supabase Storage ----------
  /**
   * Upload a file to Supabase Storage
   * @param file - File to upload
   * @param folder - Folder type: 'logos', 'games', 'banners', etc.
   */
  async uploadFile(file: File, folder: string = 'misc') {
    return uploadFile(file, 'admin-uploads', folder);
  }

  /**
   * Delete a file from Supabase Storage
   * @param filePath - Full path to file (e.g., 'logos/timestamp-filename.png')
   */
  async deleteFile(filePath: string) {
    return deleteFile(filePath, 'admin-uploads');
  }
}


export const cms = new Cms();
