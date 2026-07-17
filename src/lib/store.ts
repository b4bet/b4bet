// Store â€” Supabase-backed balance, transactions, bets, game state
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
  currency = '\u20B9'; // â‚¹

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
          this.balance = profile.balance || 0;
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
      if (raw) this.balancesByUser = JSON.parse(raw);
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
    if (globalRounds[gameKey] === undefined) globalRounds[gameKey] = 1;
    globalRounds[gameKey]++;
    bus.emit(Topics.GameRound, { gameKey, round: globalRounds[gameKey] });
    return globalRounds[gameKey];
  }
  resetGameRound(gameKey: string, to: number = 1) {
    globalRounds[gameKey] = to;
    bus.emit(Topics.GameRound, { gameKey, round: to });
  }

  // ---- History ----
  private currentUserHistoryMeta(): { userId: string; username: string } {
    const session = auth.getSession();
    if (session) return { userId: session.userId, username: session.username };
    return { userId: 'anon', username: 'player_anon' };
  }

  pushBalanceHistory(rec: Omit<BalanceHistoryRecord, 'id' | 'ts'>) {
    const item: BalanceHistoryRecord = { ...rec, id: Math.random().toString(36).slice(2), ts: Date.now() };
    this.balanceHistory = [item, ...this.balanceHistory].slice(0, 500);
    // Also insert into Supabase
    supabase.from('transactions').insert({
      user_id: rec.userId, type: rec.type, amount: rec.amount, status: 'completed',
      balance_before: this.balance, balance_after: this.balance, reference: rec.reason,
    }).then(() => {}).catch(() => {});
  }

  getBalanceHistory(opts: { search?: string } = {}): BalanceHistoryRecord[] {
    let rows = [...this.balanceHistory];
    if (opts.search) { const s = opts.search.toLowerCase(); rows = rows.filter(r => r.username.toLowerCase().includes(s) || r.userId.includes(s)); }
    return rows.slice(0, 200);
  }

  private pushAdminHistory(rec: Omit<AdminHistoryRecord, 'id' | 'ts'>) {
    const item: AdminHistoryRecord = { ...rec, id: Math.random().toString(36).slice(2), ts: Date.now() };
    this.adminHistory = [item, ...this.adminHistory].slice(0, 500);
    bus.emit(Topics.AdminHistory, this.adminHistory);
  }

  getAdminHistory(opts: { game?: AdminHistoryGame | 'all'; search?: string; period?: 'all' | 'day' | 'week' | 'month' | 'year' } = {}): AdminHistoryRecord[] {
    let rows = [...this.adminHistory];
    if (opts.game && opts.game !== 'all') rows = rows.filter(r => r.game === opts.game);
    if (opts.search) { const s = opts.search.toLowerCase(); rows = rows.filter(r => r.username.toLowerCase().includes(s) || r.userId.includes(s)); }
    if (opts.period && opts.period !== 'all') {
      const now = Date.now();
      const ms = { day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 } as const;
      rows = rows.filter(r => now - r.ts <= ms[opts.period as 'day' | 'week' | 'month' | 'year']);
    }
    return rows.slice(0, 200);
  }

  // ---- Bet Recording ----
  recordCrashBet(rec: Omit<CrashBetRecord, 'id' | 'ts'>) {
    const item: CrashBetRecord = { ...rec, id: Math.random().toString(36).slice(2), ts: Date.now() };
    this.crashMyBets = [item, ...this.crashMyBets].slice(0, 100);
    bus.emit(Topics.CrashMyBets, this.crashMyBets);
    const meta = this.currentUserHistoryMeta();
    this.pushAdminHistory({ userId: meta.userId, username: meta.username, game: 'crash', amount: rec.amount, win: rec.win,
      result: rec.cashOutAt ? `${rec.cashOutAt.toFixed(2)}x cashout` : `${rec.bustPoint.toFixed(2)}x bust` });
    // Record bet in Supabase
    supabase.from('bets').insert({
      user_id: meta.userId, bet_amount: rec.amount, win_amount: rec.win,
      multiplier: rec.cashOutAt || rec.bustPoint, status: rec.win > 0 ? 'won' : 'lost',
      bet_details: { cashOutAt: rec.cashOutAt, bustPoint: rec.bustPoint },
    }).then(() => {}).catch(() => {});
  }

  recordMinesRound(rec: Omit<MinesRoundRecord, 'id' | 'ts'>) {
    const item: MinesRoundRecord = { ...rec, id: Math.random().toString(36).slice(2), ts: Date.now() };
    this.minesMyHistory = [item, ...this.minesMyHistory].slice(0, 100);
    bus.emit(Topics.MinesMyHistory, this.minesMyHistory);
    const meta = this.currentUserHistoryMeta();
    this.pushAdminHistory({ userId: meta.userId, username: meta.username, game: 'mines', amount: rec.stake, win: rec.win,
      result: rec.busted ? 'busted' : `${rec.multiplier.toFixed(2)}x` });
    supabase.from('bets').insert({
      user_id: meta.userId, bet_amount: rec.stake, win_amount: rec.win,
      multiplier: rec.multiplier, status: rec.busted ? 'lost' : 'won',
      bet_details: { mines: rec.mines, gems: rec.gems },
    }).then(() => {}).catch(() => {});
  }

  recordSunMoonRound(rec: Omit<SunMoonRoundRecord, 'id' | 'ts'>) {
    const item: SunMoonRoundRecord = { ...rec, id: Math.random().toString(36).slice(2), ts: Date.now() };
    this.sunMoonHistory = [item, ...this.sunMoonHistory].slice(0, 100);
    bus.emit(Topics.SunMoonHistory, this.sunMoonHistory);
    const meta = this.currentUserHistoryMeta();
    this.pushAdminHistory({ userId: meta.userId, username: meta.username, game: 'sunvsmoon', amount: rec.stake, win: rec.win,
      result: `${rec.bet === 'tie' ? 'Eclipse' : rec.bet.toUpperCase()} \u2192 ${rec.result === 'tie' ? 'Eclipse' : rec.result.toUpperCase()}` });
    supabase.from('bets').insert({
      user_id: meta.userId, bet_amount: rec.stake, win_amount: rec.win,
      multiplier: rec.payout, status: rec.win > 0 ? 'won' : 'lost',
      bet_details: { bet: rec.bet, result: rec.result },
    }).then(() => {}).catch(() => {});
  }

  recordTradingBet(rec: Omit<TradingBetRecord, 'id' | 'ts'>) {
    const item: TradingBetRecord = { ...rec, id: Math.random().toString(36).slice(2), ts: Date.now() };
    this.tradingHistory = [item, ...this.tradingHistory].slice(0, 100);
    bus.emit(Topics.TradingHistory, this.tradingHistory);
    const meta = this.currentUserHistoryMeta();
    this.pushAdminHistory({ userId: meta.userId, username: meta.username, game: 'trading', amount: rec.stake, win: rec.win,
      result: `${rec.symbol} ${rec.direction} \u00B7 ${rec.won ? 'win' : 'loss'}` });
    supabase.from('bets').insert({
      user_id: meta.userId, bet_amount: rec.stake, win_amount: rec.win,
      multiplier: rec.payout, status: rec.won ? 'won' : 'lost',
      bet_details: { symbol: rec.symbol, direction: rec.direction, entryPrice: rec.entryPrice, exitPrice: rec.exitPrice },
    }).then(() => {}).catch(() => {});
  }

  // ---- Redeem Codes ----
  applyRedeemCode(code: string, accountId: string): { status: 'success' | 'used' | 'invalid'; bonus: number } {
    const upper = code.trim().toUpperCase();
    const entry = this.redeemCodes[upper];
    if (!entry) return { status: 'invalid', bonus: 0 };
    const uses = entry.usageByUser[accountId] ?? 0;
    if (uses >= entry.maxUsesPerUser) return { status: 'used', bonus: 0 };
    entry.usageByUser[accountId] = uses + 1;
    this.credit(entry.bonus);
    this.pushNotification({ title: 'Redeem Code Applied!', body: `Code ${upper} unlocked ${this.currency}${entry.bonus} bonus credits.`, kind: 'success' });
    bus.emit(Topics.RedeemCodes, this.listRedeemCodes());
    return { status: 'success', bonus: entry.bonus };
  }

  applyPromoCode(code: string): number {
    return this.applyRedeemCode(code, 'u_self').bonus;
  }

  addRedeemCode(code: string, bonus: number, userLimit = 10, maxUsesPerUser = 1) {
    const upper = code.trim().toUpperCase();
    if (!upper) return;
    this.redeemCodes[upper] = { code: upper, bonus: Math.max(0, bonus), maxUsesPerUser: Math.max(1, maxUsesPerUser), userLimit: Math.max(1, userLimit), createdAt: Date.now(), usageByUser: {} };
    bus.emit(Topics.RedeemCodes, this.listRedeemCodes());
  }

  deleteRedeemCode(code: string) {
    delete this.redeemCodes[code.trim().toUpperCase()];
    bus.emit(Topics.RedeemCodes, this.listRedeemCodes());
  }

  listRedeemCodes(): RedeemCode[] {
    return Object.values(this.redeemCodes).sort((a, b) => b.createdAt - a.createdAt);
  }

  listPromoCodes(): { code: string; bonus: number; redeemed: boolean }[] {
    return this.listRedeemCodes().map(rc => ({
      code: rc.code, bonus: rc.bonus,
      redeemed: (rc.usageByUser['u_self'] ?? 0) >= rc.maxUsesPerUser,
    }));
  }

  // ---- Signup Bonus ----
  private persistSignupBonus() {
    try {
      localStorage.setItem(Store.SIGNUP_BONUS_KEY, JSON.stringify(this.signupBonus));
      localStorage.setItem(Store.SIGNUP_BONUS_HISTORY_KEY, JSON.stringify(this.signupBonusHistory));
      localStorage.setItem(Store.SIGNUP_BONUS_GRANTED_KEY, JSON.stringify(this.signupBonusGranted));
    } catch { /* ignore */ }
  }

  private restoreSignupBonus() {
    try {
      const b = localStorage.getItem(Store.SIGNUP_BONUS_KEY);
      if (b) this.signupBonus = Math.max(0, Number(JSON.parse(b)) || 0);
      const h = localStorage.getItem(Store.SIGNUP_BONUS_HISTORY_KEY);
      if (h) this.signupBonusHistory = JSON.parse(h);
      const g = localStorage.getItem(Store.SIGNUP_BONUS_GRANTED_KEY);
      if (g) this.signupBonusGranted = JSON.parse(g);
    } catch { /* ignore */ }
  }

  setSignupBonus(amount: number) {
    this.signupBonus = Math.max(0, Math.round(amount * 100) / 100);
    this.persistSignupBonus();
    bus.emit(Topics.SignupBonus, { amount: this.signupBonus, history: this.signupBonusHistory });
  }

  grantSignupBonus(userId: string, username: string): number {
    if (!userId || !username) return 0;
    if (this.signupBonusGranted[userId]) return 0;
    const amount = this.signupBonus;
    if (amount <= 0) {
      this.signupBonusGranted[userId] = Date.now();
      this.persistSignupBonus();
      return 0;
    }
    this.creditUser(username, amount);
    const rec: SignupBonusRecord = { id: Math.random().toString(36).slice(2), userId, username, amount, ts: Date.now() };
    this.signupBonusHistory = [rec, ...this.signupBonusHistory].slice(0, 1000);
    this.signupBonusGranted[userId] = rec.ts;
    this.pushBalanceHistory({ userId, username, type: 'credit', amount, reason: 'Signup bonus (auto)' });
    this.persistSignupBonus();
    bus.emit(Topics.SignupBonus, { amount: this.signupBonus, history: this.signupBonusHistory });
    return amount;
  }

  getSignupBonusHistory(opts: { search?: string; period?: 'all' | 'today' | 'day' | 'week' | 'month' | 'year' } = {}): SignupBonusRecord[] {
    let rows = [...this.signupBonusHistory];
    if (opts.search) { const s = opts.search.toLowerCase(); rows = rows.filter(r => r.username.toLowerCase().includes(s) || r.userId.toLowerCase().includes(s)); }
    if (opts.period && opts.period !== 'all') {
      const now = Date.now();
      if (opts.period === 'today') {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        rows = rows.filter(r => r.ts >= start.getTime());
      } else {
        const ms = { day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 } as const;
        rows = rows.filter(r => now - r.ts <= ms[opts.period as 'day' | 'week' | 'month' | 'year']);
      }
    }
    return rows;
  }
}

export const store = new Store();