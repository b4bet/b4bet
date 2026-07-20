// Lightweight in-memory pub/sub event bus — emulates Socket.io bi-directional
// real-time sync within the SPA. Components subscribe to topics and the engine
// emits state changes; this keeps the UI jitter-free and decoupled from game logic.

type Handler = (payload: unknown) => void;

class EventBus {
  private handlers = new Map<string, Set<Handler>>();

  on(topic: string, handler: Handler): () => void {
    if (!this.handlers.has(topic)) this.handlers.set(topic, new Set());
    this.handlers.get(topic)!.add(handler);
    return () => this.off(topic, handler);
  }

  off(topic: string, handler: Handler): void {
    this.handlers.get(topic)?.delete(handler);
  }

  emit(topic: string, payload?: unknown): void {
    this.handlers.get(topic)?.forEach((h) => {
      try {
        h(payload);
      } catch (err) {
        console.error('[bus] handler error', topic, err);
      }
    });
  }
}

export const bus = new EventBus();

export const Topics = {
  Balance: 'balance',
  CrashState: 'crash:state',
  CrashTick: 'crash:tick',
  CrashBets: 'crash:bets',
  CrashHistory: 'crash:history',
  CrashMyBets: 'crash:mybets',
  CrashCashout: 'crash:cashout',
  MinesState: 'mines:state',
  MinesMyHistory: 'mines:myhistory',
  Notification: 'notify',
  SecurityAlert: 'security:alert',
  AdminConfig: 'admin:config',
  Intercom: 'intercom:msg',
  GameLogos: 'game:logos',
  Banners: 'cms:banners',
  Logo: 'cms:logo',
  TextLogo: 'cms:textlogo',
  Favicon: 'cms:favicon',
  UpiQr: 'cms:upiqr',
  DepositHtml: 'cms:deposit_html',
  WithdrawalHtml: 'cms:withdrawal_html',
  EmailTemplates: 'cms:email_templates',
  Finance: 'finance:ledger',
  Support: 'support:msgs',
  Staff: 'staff:list',
  StaffSession: 'staff:session',
  StaffDM: 'staff:dm',
  Toast: 'ui:toast',
  Countries: 'cms:countries',
  Referrals: 'cms:referrals',
  Affiliates: 'cms:affiliates',
  ReferralConfig: 'cms:referral_config',
  ReferralDepositApproved: 'referral:deposit_approved',
  AutoGateways: 'cms:auto_gateways',
  ManualMethods: 'cms:manual_methods',
  DynamicPages: 'cms:dynamic_pages',
  Tickets: 'cms:tickets',
  AdminUsers: 'cms:admin_users',
  SunMoonHistory: 'sunmoon:history',
  TradingHistory: 'trading:history',
  AdminHistory: 'admin:history',
  /** Emitted by any game when a bet attempt fails due to low balance. */
  InsufficientBalance: 'ui:insufficient_balance',
  RedeemCodes: 'store:redeem_codes',
  SignupBonus: 'store:signup_bonus',
  /** Emitted when auth session changes (login/logout/register). */
  AuthState: 'auth:state',
  /** Emitted to open the floating auth modal from any component. */
  AuthOpenModal: 'auth:open_modal',
  /** Emitted whenever a game's round counter advances/resets. Payload: { gameKey, round }. */
  GameRound: 'game:round',
} as const;
