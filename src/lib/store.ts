import { bus, Topics } from './bus';
import { getDeviceToken } from './security';
import { getOrCreateAccountId } from './accountId';
import { auth } from './auth';

export interface PerGameLimit {
  min: number;
  max: number;
}

/**
 * Per-game admin handler configuration for the auto-run games
 * (aviator, wingo, k3, fived, sunvsmoon). Games continue to run
 * automatically; these fields let admins nudge win-probability, house-edge
 * and queue a manual outcome for the next round — mirroring how Crash is
 * already handled. Values are advisory and additive — the underlying game
 * engines remain untouched unless they opt-in to read these settings.
 */
export interface GameHandlerConfig {
  mode: 'AUTO' | 'MANUAL';
  targetWinProbability: number; // 0..100
  houseEdge: number;            // %
  /** Free-form manual outcome (interpretation depends on the game). */
  manualResult: string;
  /** Round number the queued MANUAL override should apply to (null = next round). */
  manualTargetRoundId: number | null;
  /** Quick-stake chip values shown on that game's bet panel. */
  quickStakes: number[];
}

export interface AdminConfig {
  mode: 'AUTO' | 'MANUAL';
  targetWinProbability: number; // 0..100
  manualCrashPoint: number; // e.g. 2.5
  houseEdge: number; // %
  // Quick-stake chip values used by Crash bet panel (dynamic via Admin).
  crashQuickStakes: number[];
  // Round number the queued MANUAL override should apply to (null = next round).
  manualTargetRoundId: number | null;
  // Global betting limits enforced engine-side.
  minBet: number;
  maxBet: number;
  // Per-game overrides — when set these take priority over global min/maxBet.
  perGameLimits: Partial<Record<string, PerGameLimit>>;
  // Per-game handler configs for the auto games (aviator/wingo/k3/fived/sunvsmoon).
  gameHandlers: Partial<Record<string, GameHandlerConfig>>;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  kind: 'info' | 'success' | 'warn' | 'alert';
  ts: number;
  read: boolean;
}

export interface CrashBetRecord {
  id: string;
  roundId: number;
  amount: number;
  cashOutAt: number | null;
  bustPoint: number;
  win: number; // 0 if busted
  ts: number;
}

export interface MinesRoundRecord {
  id: string;
  stake: number;
  mines: number;
  gems: number;
  multiplier: number;
  win: number;
  busted: boolean;
  ts: number;
}

export interface SunMoonRoundRecord {
  id: string;
  roundNumber: number;
  stake: number;
  bet: 'sun' | 'moon' | 'tie';
  result: 'sun' | 'moon' | 'tie';
  payout: number;       // multiplier (1 or 8)
  win: number;          // net profit credited (0 if lost)
  ts: number;
}

export interface TradingBetRecord {
  id: string;
  symbol: string;
  direction: 'UP' | 'DOWN';
  stake: number;
  duration: number;     // minutes
  entryPrice: number;
  exitPrice: number;
  payout: number;       // payout percentage
  win: number;          // total credited (stake + profit, or 0 on loss)
  won: boolean;
  ts: number;
}

export type AdminHistoryGame = 'crash' | 'mines' | 'wingo' | 'k3' | 'fived' | 'sunvsmoon' | 'trading';

export interface AdminHistoryRecord {
  id: string;
  userId: string;
  username: string;
  game: AdminHistoryGame;
  amount: number;
  win: number;
  result: string;
  ts: number;
}

export interface BalanceHistoryRecord {
  id: string;
  userId: string;
  username: string;
  type: 'credit' | 'debit';
  amount: number;
  reason: string;
  ts: number;
}

export interface SignupBonusRecord {
  id: string;
  userId: string;
  username: string;
  amount: number;
  ts: number;
}

export interface RedeemCode {
  code: string;
  bonus: number;
  maxUsesPerUser: number; // 1 = one use per unique user
  /** Total number of distinct users allowed to redeem this code. */
  userLimit: number;
  createdAt: number;
  /** Map of accountId -> redemption timestamp */
  usageByUser: Record<string, number>;
}

// Logged-in user identity (mock).
export const CURRENT_USER = { id: 'u_self', name: 'You' };

// Generate a mock top-10 leaderboard with timestamped earnings rows so the
// 1D/1W/1M/1Y filters have realistic data to slice through.
function seedLeaderboard(prefix: string): { user: string; earnings: number; ts: number }[] {
  const names = ['NeonHawk', 'PixelFox', 'CyberLynx', 'QuantumOwl', 'AstroBee', 'NovaWolf', 'EchoFalcon', 'TurboKoi', 'GlitchRavn', 'PrismTiger', 'OrbitMoth', 'VoltGecko'];
  const now = Date.now();
  const rows: { user: string; earnings: number; ts: number }[] = [];
  for (let i = 0; i < 40; i++) {
    rows.push({
      user: names[i % names.length] + (Math.floor(i / names.length) || ''),
      earnings: Math.round((Math.random() * 9000 + 500) * 100) / 100,
      ts: now - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000),
    });
  }
  // tag with prefix just to keep names varied per game
  return rows.map((r) => ({ ...r, user: r.user + (prefix === 'mines' ? '·M' : '') }));
}


export const globalRounds: Record<string, number> = { wingo: 1, k3: 1, fived: 1, sunvsmoon: 1 };

export interface RoundOutcomePreview { outcome: string; detail: string; }

export function computeAutoOutcome(gameKey: string, handler: GameHandlerConfig): RoundOutcomePreview {
  const p = Math.min(99, Math.max(1, handler.targetWinProbability)) / 100;
  const rand = Math.random;
  switch (gameKey) {
    case 'aviator': { const r = rand(); if (r < (1 - p) * 0.12) { const bp = 1 + rand() * 0.05; return { outcome: bp.toFixed(2) + 'x', detail: '\u26a0 Instant bust zone' }; } const u = Math.max(0.0001, 1 - rand()); const raw = (1 / (u * (1 - handler.houseEdge / 100))) * (0.5 + p); const bp = Math.max(1.01, Math.min(1000, raw)); return { outcome: bp.toFixed(2) + 'x', detail: '~' + bp.toFixed(2) + 'x crash \u00b7 win-prob ' + handler.targetWinProbability + '%' }; }
    case 'wingo': { const num = Math.floor(rand() * 10); const colors: string[] = []; if ([1,3,7,9].includes(num)) colors.push('Red'); if ([2,4,6,8].includes(num)) colors.push('Green'); if (num === 0) colors.push('Green'); if (num === 5) colors.push('Red'); if (num === 0 || num === 5) colors.push('Violet'); const bs = num >= 5 ? 'Big' : 'Small'; return { outcome: String(num), detail: colors.join('+') + ' \u00b7 ' + bs }; }
    case 'k3': { const d = [1,2,3].map(() => Math.floor(rand() * 6) + 1); const sum = d[0] + d[1] + d[2]; return { outcome: d.join(','), detail: 'Sum ' + sum + ' \u00b7 ' + (sum >= 11 ? 'Big' : 'Small') + ' \u00b7 ' + (sum % 2 === 0 ? 'Even' : 'Odd') }; }
    case 'fived': { const digits = Array.from({length:5}, () => Math.floor(rand() * 10)); const sum = digits.reduce((a: number, b: number) => a + b, 0); return { outcome: digits.join(''), detail: 'Sum ' + sum + ' \u00b7 ' + (sum >= 23 ? 'Big' : 'Small') + ' \u00b7 ' + (sum % 2 === 0 ? 'Even' : 'Odd') }; }
    case 'sunvsmoon': { const r = rand(); const side = r < 0.45 ? 'sun' : r < 0.90 ? 'moon' : 'tie'; return { outcome: side, detail: side === 'sun' ? '\u2600\ufe0f Sun Wins' : side === 'moon' ? '\ud83c\udf19 Moon Wins' : '\ud83c\udf12 Eclipse (8x)' }; }
    default: return { outcome: '\u2014', detail: 'Unknown game' };
  }
}

class Store {
  balance = 0;
  currency = '₹';
  notifications: NotificationItem[] = [];
  admin: AdminConfig = {
    mode: 'AUTO',
    targetWinProbability: 55,
    manualCrashPoint: 2.0,
    houseEdge: 4,
    crashQuickStakes: [200, 500, 1000, 2000],
    manualTargetRoundId: null,
    minBet: 10,
    maxBet: 100000,
    perGameLimits: {},
    gameHandlers: {
      aviator:   { mode: 'AUTO', targetWinProbability: 55, houseEdge: 4, manualResult: '2.00', manualTargetRoundId: null, quickStakes: [10, 50, 100, 500] },
      wingo:     { mode: 'AUTO', targetWinProbability: 50, houseEdge: 5, manualResult: '5',    manualTargetRoundId: null, quickStakes: [10, 100, 1000, 10000] },
      k3:        { mode: 'AUTO', targetWinProbability: 50, houseEdge: 5, manualResult: '3,3,3',manualTargetRoundId: null, quickStakes: [10, 100, 1000, 10000] },
      fived:     { mode: 'AUTO', targetWinProbability: 50, houseEdge: 5, manualResult: '00000',manualTargetRoundId: null, quickStakes: [10, 100, 1000, 10000] },
      sunvsmoon: { mode: 'AUTO', targetWinProbability: 50, houseEdge: 6, manualResult: 'sun',  manualTargetRoundId: null, quickStakes: [10, 50, 100, 500] },
    },
  };

  // Per-user history (last 100). Mock single-user app.
  crashMyBets: CrashBetRecord[] = [];
  minesMyHistory: MinesRoundRecord[] = [];
  sunMoonHistory: SunMoonRoundRecord[] = [];
  tradingHistory: TradingBetRecord[] = [];

  // Mock leaderboards with timestamped earnings.
  crashLeaderboard = seedLeaderboard('crash');
  minesLeaderboard = seedLeaderboard('mines');

  // Admin history: real bet records recorded as users play.
  adminHistory: AdminHistoryRecord[] = [];
  balanceHistory: BalanceHistoryRecord[] = [];

  /**
   * Per-user persisted balances keyed by lowercase username.
   * Persisted to localStorage so admin-approved deposits survive across
   * sessions/devices views and are restored when the user next logs in.
   */
  private balancesByUser: Record<string, number> = {};
  private static BALANCES_KEY = 'b4bet.balances';

  // Signup bonus (admin-configurable). Persisted separately so it survives reloads.
  signupBonus: number = 100;
  signupBonusHistory: SignupBonusRecord[] = [];
  private static SIGNUP_BONUS_KEY = 'b4bet.signupBonus';
  private static SIGNUP_BONUS_HISTORY_KEY = 'b4bet.signupBonusHistory';
  private static SIGNUP_BONUS_GRANTED_KEY = 'b4bet.signupBonusGranted';
  private signupBonusGranted: Record<string, number> = {};

  constructor() {
    // Restore per-user balance map + current session balance on boot.
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(Store.BALANCES_KEY) : null;
      if (raw) this.balancesByUser = JSON.parse(raw) as Record<string, number>;
    } catch { /* ignore */ }
    // Restore signup bonus config + history + granted map.
    try {
      const b = typeof localStorage !== 'undefined' ? localStorage.getItem(Store.SIGNUP_BONUS_KEY) : null;
      if (b) this.signupBonus = Math.max(0, Number(JSON.parse(b)) || 0);
      const h = typeof localStorage !== 'undefined' ? localStorage.getItem(Store.SIGNUP_BONUS_HISTORY_KEY) : null;
      if (h) this.signupBonusHistory = JSON.parse(h) as SignupBonusRecord[];
      const g = typeof localStorage !== 'undefined' ? localStorage.getItem(Store.SIGNUP_BONUS_GRANTED_KEY) : null;
      if (g) this.signupBonusGranted = JSON.parse(g) as Record<string, number>;
    } catch { /* ignore */ }
    try {
      const session = auth.getSession();
      if (session) {
        const key = session.username.toLowerCase();
        this.balance = this.balancesByUser[key] ?? 0;
      }
    } catch { /* ignore */ }
    // Swap the in-memory balance whenever the logged-in user changes.
    bus.on(Topics.AuthState, (payload: unknown) => {
      const session = payload as { username?: string } | null;
      if (session && session.username) {
        const key = session.username.toLowerCase();
        this.balance = Math.max(0, Math.round((this.balancesByUser[key] ?? 0) * 100) / 100);
      } else {
        this.balance = 0;
      }
      bus.emit(Topics.Balance, this.balance);
    });
  }

  private persistBalances() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(Store.BALANCES_KEY, JSON.stringify(this.balancesByUser));
      }
    } catch { /* ignore */ }
  }

  /** Read the persisted balance for any user (0 if unknown). */
  getUserBalance(username: string): number {
    return this.balancesByUser[username.toLowerCase()] ?? 0;
  }

  /**
   * Credit an arbitrary user's persisted balance (used by admin approval
   * flows). If the credited user is the currently logged-in session, also
   * updates the live in-memory balance so the UI refreshes immediately.
   */
  creditUser(username: string, amount: number) {
    if (!username || !isFinite(amount) || amount <= 0) return;
    const key = username.toLowerCase();
    const next = Math.max(0, Math.round(((this.balancesByUser[key] ?? 0) + amount) * 100) / 100);
    this.balancesByUser[key] = next;
    this.persistBalances();
    const session = auth.getSession();
    if (session && session.username.toLowerCase() === key) {
      this.balance = next;
      bus.emit(Topics.Balance, this.balance);
    }
  }

  setBalance(next: number) {
    this.balance = Math.max(0, Math.round(next * 100) / 100);
    // Persist to the current user's slot so it survives reloads/logins.
    try {
      const session = auth.getSession();
      if (session) {
        this.balancesByUser[session.username.toLowerCase()] = this.balance;
        this.persistBalances();
      }
    } catch { /* ignore */ }
    bus.emit(Topics.Balance, this.balance);
  }

  credit(amount: number) {
    this.setBalance(this.balance + amount);
  }

  debit(amount: number): boolean {
    // Require login before any bet-related debit.
    if (!auth.getSession()) {
      bus.emit(Topics.AuthOpenModal, 'login');
      return false;
    }
    if (amount > this.balance) return false;
    this.setBalance(this.balance - amount);
    return true;
  }

  /** Alias for credit() — used by lottery views. */
  addBalance(amount: number) { this.credit(amount); }

  /** Alias for debit() — used by lottery views. */
  deductBalance(amount: number): boolean { return this.debit(amount); }

  pushNotification(n: Omit<NotificationItem, 'id' | 'ts' | 'read'>) {
    const item: NotificationItem = {
      ...n,
      id: Math.random().toString(36).slice(2),
      ts: Date.now(),
      read: false,
    };
    this.notifications = [item, ...this.notifications].slice(0, 30);
    bus.emit(Topics.Notification, this.notifications);
  }

  markAllRead() {
    this.notifications = this.notifications.map((n) => ({ ...n, read: true }));
    bus.emit(Topics.Notification, this.notifications);
  }

  setAdmin(patch: Partial<AdminConfig>) {
    this.admin = { ...this.admin, ...patch };
    bus.emit(Topics.AdminConfig, this.admin);
  }

  /** Get effective min/max bet for a specific game (falls back to global). */
  getGameLimits(gameKey: string): { min: number; max: number } {
    const override = this.admin.perGameLimits[gameKey];
    if (override) return { min: override.min, max: override.max };
    return { min: this.admin.minBet, max: this.admin.maxBet };
  }

  /** Set per-game bet limits. Pass null to clear override and use global. */
  setGameLimit(gameKey: string, limit: PerGameLimit | null) {
    const next = { ...this.admin.perGameLimits };
    if (limit === null) {
      delete next[gameKey];
    } else {
      next[gameKey] = limit;
    }
    this.setAdmin({ perGameLimits: next });
  }

  /**
   * Read (or lazily create) the admin handler config for an auto game.
   * The underlying engine is not affected — this simply persists the
   * admin's queued preferences so panels can display and edit them.
   */
  getGameHandler(gameKey: string): GameHandlerConfig {
    const existing = this.admin.gameHandlers[gameKey];
    if (existing) return existing;
    return {
      mode: 'AUTO',
      targetWinProbability: 50,
      houseEdge: 5,
      manualResult: '',
      manualTargetRoundId: null,
      quickStakes: [10, 100, 1000, 10000],
    };
  }

  /** Patch an auto-game's handler config. Additive — never removes fields. */
  setGameHandler(gameKey: string, patch: Partial<GameHandlerConfig>) {
    const current = this.getGameHandler(gameKey);
    const next = { ...this.admin.gameHandlers, [gameKey]: { ...current, ...patch } };
    this.setAdmin({ gameHandlers: next });
  }
  getGameRound(gameKey: string): number { return globalRounds[gameKey] ?? 1; }
  advanceGameRound(gameKey: string): number { if (globalRounds[gameKey] === undefined) globalRounds[gameKey] = 1; globalRounds[gameKey]++; bus.emit(Topics.GameRound, { gameKey, round: globalRounds[gameKey] }); return globalRounds[gameKey]; }
  resetGameRound(gameKey: string, to: number = 1) { globalRounds[gameKey] = to; bus.emit(Topics.GameRound, { gameKey, round: to }); }

  private currentUserHistoryMeta(): { userId: string; username: string } {
    const session = auth.getSession();
    if (session) return { userId: session.accountId, username: session.username };
    return { userId: getOrCreateAccountId(), username: 'player_' + getDeviceToken().slice(4, 10) };
  }

  pushBalanceHistory(rec: Omit<BalanceHistoryRecord, 'id' | 'ts'>) {
    const item: BalanceHistoryRecord = { ...rec, id: Math.random().toString(36).slice(2), ts: Date.now() };
    this.balanceHistory = [item, ...this.balanceHistory].slice(0, 500);
  }
  getBalanceHistory(opts: { search?: string } = {}): BalanceHistoryRecord[] {
    let rows = [...this.balanceHistory];
    if (opts.search) { const s = opts.search.toLowerCase(); rows = rows.filter((r) => r.username.toLowerCase().includes(s) || r.userId.includes(s)); }
    return rows.slice(0, 200);
  }
  private pushAdminHistory(rec: Omit<AdminHistoryRecord, 'id' | 'ts'>) {
    const item: AdminHistoryRecord = { ...rec, id: Math.random().toString(36).slice(2), ts: Date.now() };
    this.adminHistory = [item, ...this.adminHistory].slice(0, 500);
    bus.emit(Topics.AdminHistory, this.adminHistory);
  }

  getAdminHistory(opts: { game?: AdminHistoryGame | 'all'; search?: string; period?: 'all' | 'day' | 'week' | 'month' | 'year' } = {}): AdminHistoryRecord[] {
    let rows = [...this.adminHistory];
    if (opts.game && opts.game !== 'all') rows = rows.filter((r) => r.game === opts.game);
    if (opts.search) {
      const s = opts.search.toLowerCase();
      rows = rows.filter((r) => r.username.toLowerCase().includes(s) || r.userId.includes(s));
    }
    if (opts.period && opts.period !== 'all') {
      const period = opts.period;
      const now = Date.now();
      const ms = { day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 } as const;
      rows = rows.filter((r) => now - r.ts <= ms[period]);
    }
    return rows.slice(0, 200);
  }

  recordCrashBet(rec: Omit<CrashBetRecord, 'id' | 'ts'>) {
    const item: CrashBetRecord = { ...rec, id: Math.random().toString(36).slice(2), ts: Date.now() };
    this.crashMyBets = [item, ...this.crashMyBets].slice(0, 100);
    bus.emit(Topics.CrashMyBets, this.crashMyBets);
    const meta = this.currentUserHistoryMeta();
    this.pushAdminHistory({ userId: meta.userId, username: meta.username, game: 'crash', amount: rec.amount, win: rec.win, result: rec.cashOutAt ? `${rec.cashOutAt.toFixed(2)}x cashout` : `${rec.bustPoint.toFixed(2)}x bust` });
  }

  recordMinesRound(rec: Omit<MinesRoundRecord, 'id' | 'ts'>) {
    const item: MinesRoundRecord = { ...rec, id: Math.random().toString(36).slice(2), ts: Date.now() };
    this.minesMyHistory = [item, ...this.minesMyHistory].slice(0, 100);
    bus.emit(Topics.MinesMyHistory, this.minesMyHistory);
    const meta = this.currentUserHistoryMeta();
    this.pushAdminHistory({ userId: meta.userId, username: meta.username, game: 'mines', amount: rec.stake, win: rec.win, result: rec.busted ? 'busted' : `${rec.multiplier.toFixed(2)}x` });
  }

  recordSunMoonRound(rec: Omit<SunMoonRoundRecord, 'id' | 'ts'>) {
    const item: SunMoonRoundRecord = { ...rec, id: Math.random().toString(36).slice(2), ts: Date.now() };
    this.sunMoonHistory = [item, ...this.sunMoonHistory].slice(0, 100);
    bus.emit(Topics.SunMoonHistory, this.sunMoonHistory);
    const meta = this.currentUserHistoryMeta();
    this.pushAdminHistory({ userId: meta.userId, username: meta.username, game: 'sunvsmoon', amount: rec.stake, win: rec.win, result: `${rec.bet === 'tie' ? 'Eclipse' : rec.bet.toUpperCase()} → ${rec.result === 'tie' ? 'Eclipse' : rec.result.toUpperCase()}` });
  }

  recordTradingBet(rec: Omit<TradingBetRecord, 'id' | 'ts'>) {
    const item: TradingBetRecord = { ...rec, id: Math.random().toString(36).slice(2), ts: Date.now() };
    this.tradingHistory = [item, ...this.tradingHistory].slice(0, 100);
    bus.emit(Topics.TradingHistory, this.tradingHistory);
    const meta = this.currentUserHistoryMeta();
    this.pushAdminHistory({ userId: meta.userId, username: meta.username, game: 'trading', amount: rec.stake, win: rec.win, result: `${rec.symbol} ${rec.direction} · ${rec.won ? 'win' : 'loss'}` });
  }

  // ── Redeem Code system (per-user restriction) ──────────────────────────────
  /** Structured redeem codes with per-user tracking. */
  redeemCodes: Record<string, RedeemCode> = {
    WELCOME50: { code: 'WELCOME50', bonus: 50, maxUsesPerUser: 1, userLimit: 100, createdAt: Date.now(), usageByUser: {} },
    BONUS100:  { code: 'BONUS100',  bonus: 100, maxUsesPerUser: 1, userLimit: 100, createdAt: Date.now(), usageByUser: {} },
    MIXO200:   { code: 'MIXO200',   bonus: 200, maxUsesPerUser: 1, userLimit: 50, createdAt: Date.now(), usageByUser: {} },
    VIP500:    { code: 'VIP500',    bonus: 500, maxUsesPerUser: 1, userLimit: 10, createdAt: Date.now(), usageByUser: {} },
  };

  /**
   * Validate and apply a redeem code for a specific user.
   * Returns a status object describing the outcome so the UI can show a
   * clear Success / Used / Invalid message.
   */
  applyRedeemCode(
    code: string,
    accountId: string,
  ): { status: 'success' | 'used' | 'invalid'; bonus: number } {
    const upper = code.trim().toUpperCase();
    const entry = this.redeemCodes[upper];
    if (!entry) return { status: 'invalid', bonus: 0 };
    const uses = entry.usageByUser[accountId] ?? 0;
    if (uses >= entry.maxUsesPerUser) return { status: 'used', bonus: 0 };
    // Enforce total distinct-user limit.
    const distinctUsers = Object.keys(entry.usageByUser).length;
    if (uses === 0 && distinctUsers >= entry.userLimit) {
      return { status: 'used', bonus: 0 };
    }
    // Mark used
    entry.usageByUser[accountId] = uses + 1;
    this.credit(entry.bonus);
    this.pushNotification({
      title: 'Redeem Code Applied!',
      body: `Code ${upper} unlocked ${this.currency}${entry.bonus} bonus credits.`,
      kind: 'success',
    });
    bus.emit(Topics.RedeemCodes, this.listRedeemCodes());
    return { status: 'success', bonus: entry.bonus };
  }

  /** Legacy alias — kept for backward compat (uses 'u_self' as accountId). */
  applyPromoCode(code: string): number {
    return this.applyRedeemCode(code, 'u_self').bonus;
  }

  /** Admin: create or update a redeem code. */
  addRedeemCode(code: string, bonus: number, userLimit = 10, maxUsesPerUser = 1) {
    const upper = code.trim().toUpperCase();
    if (!upper) return;
    this.redeemCodes[upper] = {
      code: upper,
      bonus: Math.max(0, bonus),
      maxUsesPerUser: Math.max(1, maxUsesPerUser),
      userLimit: Math.max(1, userLimit),
      createdAt: Date.now(),
      usageByUser: {},
    };
    bus.emit(Topics.RedeemCodes, this.listRedeemCodes());
  }

  /** Admin: delete a redeem code. */
  deleteRedeemCode(code: string) {
    const upper = code.trim().toUpperCase();
    delete this.redeemCodes[upper];
    bus.emit(Topics.RedeemCodes, this.listRedeemCodes());
  }

  /** List all redeem codes (admin view). */
  listRedeemCodes(): RedeemCode[] {
    return Object.values(this.redeemCodes).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Legacy: list promo codes in old format (used by legacy PromoCodeSection). */
  listPromoCodes(): { code: string; bonus: number; redeemed: boolean }[] {
    return this.listRedeemCodes().map((rc) => ({
      code: rc.code,
      bonus: rc.bonus,
      redeemed: (rc.usageByUser['u_self'] ?? 0) >= rc.maxUsesPerUser,
    }));
  }

  // ── Signup bonus (admin-configurable) ─────────────────────────────────────
  private persistSignupBonus() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(Store.SIGNUP_BONUS_KEY, JSON.stringify(this.signupBonus));
        localStorage.setItem(Store.SIGNUP_BONUS_HISTORY_KEY, JSON.stringify(this.signupBonusHistory));
        localStorage.setItem(Store.SIGNUP_BONUS_GRANTED_KEY, JSON.stringify(this.signupBonusGranted));
      }
    } catch { /* ignore */ }
  }

  setSignupBonus(amount: number) {
    this.signupBonus = Math.max(0, Math.round(amount * 100) / 100);
    this.persistSignupBonus();
    bus.emit(Topics.SignupBonus, { amount: this.signupBonus, history: this.signupBonusHistory });
  }

  /** Credit the configured signup bonus to a newly-registered user (once). */
  grantSignupBonus(userId: string, username: string): number {
    if (!userId || !username) return 0;
    if (this.signupBonusGranted[userId]) return 0; // already granted
    const amount = this.signupBonus;
    if (amount <= 0) {
      this.signupBonusGranted[userId] = Date.now();
      this.persistSignupBonus();
      return 0;
    }
    this.creditUser(username, amount);
    const rec: SignupBonusRecord = {
      id: Math.random().toString(36).slice(2),
      userId,
      username,
      amount,
      ts: Date.now(),
    };
    this.signupBonusHistory = [rec, ...this.signupBonusHistory].slice(0, 1000);
    this.signupBonusGranted[userId] = rec.ts;
    this.pushBalanceHistory({ userId, username, type: 'credit', amount, reason: 'Signup bonus (auto)' });
    this.persistSignupBonus();
    bus.emit(Topics.SignupBonus, { amount: this.signupBonus, history: this.signupBonusHistory });
    return amount;
  }

  getSignupBonusHistory(opts: { search?: string; period?: 'all' | 'today' | 'day' | 'week' | 'month' | 'year' } = {}): SignupBonusRecord[] {
    let rows = [...this.signupBonusHistory];
    if (opts.search) {
      const s = opts.search.toLowerCase();
      rows = rows.filter((r) => r.username.toLowerCase().includes(s) || r.userId.toLowerCase().includes(s));
    }
    if (opts.period && opts.period !== 'all') {
      const now = Date.now();
      if (opts.period === 'today') {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        rows = rows.filter((r) => r.ts >= start.getTime());
      } else {
        const ms = { day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 } as const;
        rows = rows.filter((r) => now - r.ts <= ms[opts.period as 'day' | 'week' | 'month' | 'year']);
      }
    }
    return rows;
  }
}

export const store = new Store();


