// Store — Supabase-backed balance, transactions, bets, game state
// Replaces the old localStorage-only mock store.

import { supabase } from '@/integrations/supabase/client';
import { bus, Topics } from './bus';
import { auth } from './auth';

export interface PerGameLimit {
  min: number;
  max: number;
}

export interface GameHandlerConfig {
  mode: 'AUTO' | 'MANUAL';
  targetWinProbability: number;
  houseEdge: number;
  manualResult: string;
  manualTargetRoundId: number | null;
  quickStakes: number[];
}

export interface AdminConfig {
  mode: 'AUTO' | 'MANUAL';
  targetWinProbability: number;
  manualCrashPoint: number;
  houseEdge: number;
  crashQuickStakes: number[];
  manualTargetRoundId: number | null;
  minBet: number;
  maxBet: number;
  perGameLimits: Partial<Record<string, PerGameLimit>>;
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
  win: number;
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
  payout: number;
  win: number;
  ts: number;
}

export interface TradingBetRecord {
  id: string;
  symbol: string;
  direction: 'UP' | 'DOWN';
  stake: number;
  duration: number;
  entryPrice: number;
  exitPrice: number;
  payout: number;
  win: number;
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
  maxUsesPerUser: number;
  userLimit: number;
  createdAt: number;
  usageByUser: Record<string, number>;
}

export const globalRounds: Record<string, number> = { wingo: 1, k3: 1, fived: 1, sunvsmoon: 1 };

function seedLeaderboard(prefix: string): { user: string; earnings: number; ts: number }[] {
  const names = ['NeonHawk','PixelFox','CyberLynx','QuantumOwl','AstroBee','NovaWolf','EchoFalcon','TurboKoi','GlitchRavn','PrismTiger','OrbitMoth','VoltGecko'];
  const now = Date.now();
  const rows: { user: string; earnings: number; ts: number }[] = [];
  for (let i = 0; i < 40; i++) {
    rows.push({
      user: names[i % names.length] + (Math.floor(i / names.length) || ''),
      earnings: Math.round((Math.random() * 9000 + 500) * 100) / 100,
      ts: now - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000),
    });
  }
  return rows.map(r => ({ ...r, user: r.user + (prefix === 'mines' ? '\u00B7M' : '') }));
}

class Store {
  balance = 0;
  currency = '\u20B9'; // ₹

  notifications: NotificationItem[] = [];

  admin: AdminConfig = {
    mode: 'AUTO', targetWinProbability: 55, manualCrashPoint: 2.0, houseEdge: 4,
    crashQuickStakes: [200, 500, 1000, 2000], manualTargetRoundId: null, minBet: 10, maxBet: 100000,
    perGameLimits: {},
    gameHandlers: {
      aviator: { mode: 'AUTO', targetWinProbability: 55, houseEdge: 4, manualResult: '2.00', manualTargetRoundId: null, quickStakes: [10, 50, 100, 500] },
      wingo: { mode: 'AUTO', targetWinProbability: 50, houseEdge: 5, manualResult: '5', manualTargetRoundId: null, quickStakes: [10, 100, 1000, 10000] },
      k3: { mode: 'AUTO', targetWinProbability: 50, houseEdge: 5, manualResult: '3,3,3', manualTargetRoundId: null, quickStakes: [10, 100, 1000, 10000] },
      fived: { mode: 'AUTO', targetWinProbability: 50, houseEdge: 5, manualResult: '00000', manualTargetRoundId: null, quickStakes: [10, 100, 1000, 10000] },
      sunvsmoon: { mode: 'AUTO', targetWinProbability: 50, houseEdge: 6, manualResult: 'sun', manualTargetRoundId: null, quickStakes: [10, 50, 100, 500] },
    },
  };

  // Per-user history (mock single-user app)
  crashMyBets: CrashBetRecord[] = [];
  minesMyHistory: MinesRoundRecord[] = [];
  sunMoonHistory: SunMoonRoundRecord[] = [];
  tradingHistory: TradingBetRecord[] = [];

  crashLeaderboard = seedLeaderboard('crash');
  minesLeaderboard = seedLeaderboard('mines');

  adminHistory: AdminHistoryRecord[] = [];
  balanceHistory: BalanceHistoryRecord[] = [];

  private balancesByUser: Record<string, number> = {};
  private static BALANCES_KEY = 'b4bet.balances';

  signupBonus = 100;
  signupBonusHistory: SignupBonusRecord[] = [];
  private static SIGNUP_BONUS_KEY = 'b4bet.signupBonus';
  private static SIGNUP_BONUS_HISTORY_KEY = 'b4bet.signupBonusHistory';
  private static SIGNUP_BONUS_GRANTED_KEY = 'b4bet.signupBonusGranted';
  private signupBonusGranted: Record<string, number> = {};

  redeemCodes: Record<string, RedeemCode> = {
    WELCOME50: { code: 'WELCOME50', bonus: 50, maxUsesPerUser: 1, userLimit: 100, createdAt: Date.now(), usageByUser: {} },
    BONUS100: { code: 'BONUS100', bonus: 100, maxUsesPerUser: 1, userLimit: 100, createdAt: Date.now(), usageByUser: {} },
  };

  constructor() {
    this.restoreBalances();
    this.restoreSignupBonus();

    bus.on(Topics.AuthState, async (payload: unknown) => {
      const session = payload as { username?: string } | null;
      if (session && session.username) {
        // Load balance from Supabase
        const { data: profile } = await supabase.from('profiles')
          .select('balance').eq('username', session.username).single();
        if (profile) {
          this.balance = (profile as { balance: number }).balance || 0;
        }
      } else {
        this.balance = 0;
      }
      bus.emit(Topics.Balance, this.balance);
    });
  }

  // ---- Balance ----
  private restoreBalances() {
    try {
      const raw = localStorage.getItem(Store.BALANCES_KEY);
      if (raw) this.balancesByUser = JSON.parse(raw) as Record<string, number>;
    } catch { /* ignore */ }
    try {
      const session = auth.getSession();
      if (session) {
        const key = session.username.toLowerCase();
        this.balance = this.balancesByUser[key] ?? 0;
      }
    } catch { /* ignore */ }
  }

  private persistBalances() {
    try { localStorage.setItem(Store.BALANCES_KEY, JSON.stringify(this.balancesByUser)); } catch { /* ignore */ }
  }

  getUserBalance(username: string): number {
    return this.balancesByUser[username.toLowerCase()] ?? 0;
  }

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
    // Also update Supabase profile
    supabase.from('profiles').update({ balance: next }).eq('username', username).then(() => {}).catch(() => {});
  }

  setBalance(next: number) {
    this.balance = Math.max(0, Math.round(next * 100) / 100);
    try {
      const session = auth.getSession();
      if (session) {
        this.balancesByUser[session.username.toLowerCase()] = this.balance;
        this.persistBalances();
        // Update Supabase
        supabase.from('profiles').update({ balance: this.balance }).eq('username', session.username).then(() => {}).catch(() => {});
      }
    } catch { /* ignore */ }
    bus.emit(Topics.Balance, this.balance);
  }

  credit(amount: number) { this.setBalance(this.balance + amount); }

  debit(amount: number): boolean {
    if (!auth.getSession()) {
      bus.emit(Topics.AuthOpenModal, 'login');
      return false;
    }
    if (amount > this.balance) return false;
    this.setBalance(this.balance - amount);
    return true;
  }

  /**
   * Deduct balance locally (in-memory + localStorage) WITHOUT writing to Supabase.
   *
   * Use this when the server-side Edge Function (e.g. aviator_place_bet) is
   * responsible for deducting from the database. Calling the regular debit()
   * here would cause a double-deduction: once client-side and once server-side.
   *
   * Returns true if balance was sufficient and deduction succeeded.
   * Returns false if balance is insufficient (no deduction performed).
   */
  debitLocalOnly(amount: number): boolean {
    if (!auth.getSession()) {
      bus.emit(Topics.AuthOpenModal, 'login');
      return false;
    }
    if (amount > this.balance) return false;
    const next = Math.max(0, Math.round((this.balance - amount) * 100) / 100);
    this.balance = next;
    try {
      const session = auth.getSession();
      if (session) {
        this.balancesByUser[session.username.toLowerCase()] = next;
        this.persistBalances();
        // Do NOT write to Supabase — the Edge Function handles the DB deduction
      }
    } catch { /* ignore */ }
    bus.emit(Topics.Balance, this.balance);
    return true;
  }

  addBalance(amount: number) { this.credit(amount); }
  deductBalance(amount: number): boolean { return this.debit(amount); }

  // ---- Notifications ----
  pushNotification(n: Omit<NotificationItem, 'id' | 'ts' | 'read'>) {
    const item: NotificationItem = { ...n, id: Math.random().toString(36).slice(2), ts: Date.now(), read: false };
    this.notifications = [item, ...this.notifications].slice(0, 30);
    bus.emit(Topics.Notification, this.notifications);
  }

  markAllRead() {
    this.notifications = this.notifications.map(n => ({ ...n, read: true }));
    bus.emit(Topics.Notification, this.notifications);
  }

  // ---- Admin Config ----
  setAdmin(patch: Partial<AdminConfig>) {
    this.admin = { ...this.admin, ...patch };
    bus.emit(Topics.AdminConfig, this.admin);
  }

  getGameLimits(gameKey: string): { min: number; max: number } {
    const override = this.admin.perGameLimits[gameKey];
    if (override) return { min: override.min, max: override.max };
    return { min: this.admin.minBet, max: this.admin.maxBet };
  }

  setGameLimit(gameKey: string, limit: PerGameLimit | null) {
    const next = { ...this.admin.perGameLimits };
    if (limit === null) { delete next[gameKey]; }
    else { next[gameKey] = limit; }
    this.setAdmin({ perGameLimits: next });
  }

  getGameHandler(gameKey: string): GameHandlerConfig {
    const existing = this.admin.gameHandlers[gameKey];
    if (existing) return existing;
    return { mode: 'AUTO', targetWinProbability: 50, houseEdge: 5, manualResult: '', manualTargetRoundId: null, quickStakes: [10, 100, 1000, 10000] };
  }

  setGameHandler(gameKey: string, patch: Partial<GameHandlerConfig>) {
    const current = this.getGameHandler(gameKey);
    const next = { ...this.admin.gameHandlers, [gameKey]: { ...current, ...patch } };
    this.setAdmin({ gameHandlers: next });
  }

  getGameRound(gameKey: string): number { return globalRounds[gameKey] ?? 1; }
  advanceGameRound(gameKey: string): number {
    globalRounds[gameKey] = (globalRounds[gameKey] ?? 1) + 1;
    return globalRounds[gameKey];
  }

  // ---- Crash bets ----
  addCrashBet(bet: CrashBetRecord) {
    this.crashMyBets = [bet, ...this.crashMyBets].slice(0, 50);
  }

  // ---- Mines history ----
  addMinesRound(round: MinesRoundRecord) {
    this.minesMyHistory = [round, ...this.minesMyHistory].slice(0, 50);
  }

  // ---- Sun/Moon history ----
  addSunMoonRound(round: SunMoonRoundRecord) {
    this.sunMoonHistory = [round, ...this.sunMoonHistory].slice(0, 50);
  }

  // ---- Trading history ----
  addTradingBet(bet: TradingBetRecord) {
    this.tradingHistory = [bet, ...this.tradingHistory].slice(0, 50);
  }

  // ---- Admin history ----
  addAdminHistory(record: AdminHistoryRecord) {
    this.adminHistory = [record, ...this.adminHistory].slice(0, 200);
    bus.emit(Topics.AdminHistory, this.adminHistory);
  }

  addBalanceHistory(record: BalanceHistoryRecord) {
    this.balanceHistory = [record, ...this.balanceHistory].slice(0, 200);
  }

  // ---- Signup bonus ----
  private restoreSignupBonus() {
    try {
      const raw = localStorage.getItem(Store.SIGNUP_BONUS_KEY);
      if (raw) this.signupBonus = JSON.parse(raw) as number;
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(Store.SIGNUP_BONUS_HISTORY_KEY);
      if (raw) this.signupBonusHistory = JSON.parse(raw) as SignupBonusRecord[];
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(Store.SIGNUP_BONUS_GRANTED_KEY);
      if (raw) this.signupBonusGranted = JSON.parse(raw) as Record<string, number>;
    } catch { /* ignore */ }
  }

  setSignupBonus(amount: number) {
    this.signupBonus = amount;
    try { localStorage.setItem(Store.SIGNUP_BONUS_KEY, JSON.stringify(amount)); } catch { /* ignore */ }
    bus.emit(Topics.AdminConfig, this.admin);
  }

  grantSignupBonus(userId: string, username: string): boolean {
    const alreadyGranted = this.signupBonusGranted[userId] ?? 0;
    if (alreadyGranted > 0) return false;
    this.signupBonusGranted[userId] = this.signupBonus;
    try { localStorage.setItem(Store.SIGNUP_BONUS_GRANTED_KEY, JSON.stringify(this.signupBonusGranted)); } catch { /* ignore */ }
    const record: SignupBonusRecord = {
      id: Math.random().toString(36).slice(2),
      userId,
      username,
      amount: this.signupBonus,
      ts: Date.now(),
    };
    this.signupBonusHistory = [record, ...this.signupBonusHistory].slice(0, 200);
    try { localStorage.setItem(Store.SIGNUP_BONUS_HISTORY_KEY, JSON.stringify(this.signupBonusHistory)); } catch { /* ignore */ }
    return true;
  }

  hasSignupBonusBeenGranted(userId: string): boolean {
    return (this.signupBonusGranted[userId] ?? 0) > 0;
  }

  // ---- Redeem codes ----
  createRedeemCode(code: string, bonus: number, maxUsesPerUser: number, userLimit: number) {
    this.redeemCodes[code] = { code, bonus, maxUsesPerUser, userLimit, createdAt: Date.now(), usageByUser: {} };
  }

  deleteRedeemCode(code: string) {
    delete this.redeemCodes[code];
  }

  redeemCode(code: string, userId: string): { success: boolean; bonus: number; error?: string } {
    const rc = this.redeemCodes[code];
    if (!rc) return { success: false, bonus: 0, error: 'Invalid code' };
    const used = rc.usageByUser[userId] ?? 0;
    if (used >= rc.maxUsesPerUser) return { success: false, bonus: 0, error: 'Code already used' };
    const totalUsed = Object.values(rc.usageByUser).reduce((a, b) => a + b, 0);
    if (totalUsed >= rc.userLimit) return { success: false, bonus: 0, error: 'Code limit reached' };
    rc.usageByUser[userId] = used + 1;
    return { success: true, bonus: rc.bonus };
  }
}

export const store = new Store();
