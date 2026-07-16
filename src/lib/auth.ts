// Auth manager — handles user registration, login, logout, and forgot-password.
// Uses localStorage for persistence and the bus/cms pattern for reactive state.
// Password is hashed client-side (demo only — not production-grade security).

import { bus, Topics } from './bus';
import { store } from './store';
import { cms } from './cms';
import { generateAccountId } from './accountId';

const STORAGE_KEY_USERS = 'b4bet.users';
const STORAGE_KEY_SESSION = 'b4bet.session';
const STORAGE_KEY_RESET_CODES = 'b4bet.passwordResetCodes';
const STORAGE_KEY_BANS = 'b4bet.bannedUsers';
const STORAGE_KEY_CLIENT_IP = 'b4bet.clientIp';

export interface PasswordResetCode {
  email: string;
  code: string;
  expiresAt: number;
}

export interface AuthUser {
  id: string;
  accountId: string;
  username: string;
  email: string;
  mobile: string;
  passwordHash: string;
  referralCode: string | null;
  ownReferralCode?: string;
  createdAt: number;
  isActive: boolean;
  registrationIp?: string;
}

export interface AuthSession {
  userId: string;
  accountId: string;
  username: string;
  email: string;
  loggedInAt: number;
}

export interface BanRecord {
  userId: string;
  username: string;
  email: string;
  ip: string;
  banDate: number;
  banReason: string;
  bannedBy: 'system' | 'admin';
  unbanDate?: number;
  unbanReason?: string;
}

/** Simple FNV-1a hash — for demo only. Not cryptographically secure. */
function simpleHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Generate or retrieve a simulated client IP fingerprint stored in localStorage.
 *  This simulates IP detection in a pure frontend environment.
 */
function getOrCreateClientIp(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CLIENT_IP);
    if (stored) return stored;
    const ip = `${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
    localStorage.setItem(STORAGE_KEY_CLIENT_IP, ip);
    return ip;
  } catch {
    return '0.0.0.0';
  }
}

class AuthManager {
  private users: AuthUser[] = [];
  private session: AuthSession | null = null;
  private resetCodes: Record<string, PasswordResetCode> = {};
  private bannedUsers: BanRecord[] = [];

  constructor() {
    this.loadFromStorage();
    this.loadResetCodes();
    this.loadBans();
    this.applyPendingReferralRewards();

    bus.on(Topics.ReferralDepositApproved, (payload) => {
      const { username, amount } = payload as { username: string; amount: number };
      const user = this.getUserByUsername(username);
      if (user && user.referralCode) {
        this.processReferralReward(user, amount);
      }
    });
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_USERS);
      if (raw) this.users = JSON.parse(raw) as AuthUser[];
    } catch { /* ignore */ }
    // Backfill 6-digit accountId for any legacy users stored without one.
    let changed = false;
    this.users = this.users.map((u) => {
      if (!u.accountId) {
        changed = true;
        return { ...u, accountId: generateAccountId() };
      }
      return u;
    });
    if (changed) this.persistUsers();
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SESSION);
      if (raw) this.session = JSON.parse(raw) as AuthSession;
    } catch { /* ignore */ }
  }

  private persistUsers() {
    try {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(this.users));
    } catch { /* ignore */ }
  }

  private persistSession() {
    try {
      if (this.session) {
        localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(this.session));
      } else {
        localStorage.removeItem(STORAGE_KEY_SESSION);
      }
    } catch { /* ignore */ }
  }

  private loadResetCodes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_RESET_CODES);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, PasswordResetCode>;
        this.resetCodes = parsed;
      }
    } catch { /* ignore */ }
    this.cleanupResetCodes();
  }

  private persistResetCodes() {
    try {
      localStorage.setItem(STORAGE_KEY_RESET_CODES, JSON.stringify(this.resetCodes));
    } catch { /* ignore */ }
  }

  private cleanupResetCodes() {
    const now = Date.now();
    let changed = false;
    for (const email of Object.keys(this.resetCodes)) {
      if (this.resetCodes[email].expiresAt < now) {
        delete this.resetCodes[email];
        changed = true;
      }
    }
    if (changed) this.persistResetCodes();
  }

  private loadBans() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_BANS);
      if (raw) this.bannedUsers = JSON.parse(raw) as BanRecord[];
    } catch { /* ignore */ }
  }

  private persistBans() {
    try {
      localStorage.setItem(STORAGE_KEY_BANS, JSON.stringify(this.bannedUsers));
    } catch { /* ignore */ }
  }

  private emitState() {
    bus.emit(Topics.AuthState, this.session);
  }

  private emitBans() {
    bus.emit('auth:bans', this.bannedUsers);
  }

  getSession(): AuthSession | null {
    return this.session;
  }

  isLoggedIn(): boolean {
    return this.session !== null;
  }

  /** Return all currently active ban records (no unbanDate). */
  getBannedUsers(): BanRecord[] {
    return this.bannedUsers.filter((b) => !b.unbanDate);
  }

  /** Return full ban history including unbanned records. */
  getAllBanHistory(): BanRecord[] {
    return [...this.bannedUsers];
  }

  /** Ban a user by ID with a reason. Adds them to the Ban Section. */
  banUser(id: string, reason: string, bannedBy: 'system' | 'admin' = 'admin'): boolean {
    const user = this.users.find((u) => u.id === id);
    if (!user) return false;

    user.isActive = false;
    this.persistUsers();

    // Remove any prior active ban entry and add fresh one
    this.bannedUsers = this.bannedUsers.filter((b) => !(b.userId === id && !b.unbanDate));
    const record: BanRecord = {
      userId: user.id,
      username: user.username,
      email: user.email,
      ip: user.registrationIp ?? '—',
      banDate: Date.now(),
      banReason: reason,
      bannedBy,
    };
    this.bannedUsers.push(record);
    this.persistBans();
    this.emitBans();

    if (this.session?.userId === id) {
      this.logout();
    } else {
      bus.emit(Topics.AuthState, this.session);
    }
    return true;
  }

  /** Unban a user by ID with a mandatory reason. */
  unbanUser(id: string, reason: string): boolean {
    const user = this.users.find((u) => u.id === id);
    if (!user) return false;

    user.isActive = true;
    this.persistUsers();

    const activeBan = this.bannedUsers.find((b) => b.userId === id && !b.unbanDate);
    if (activeBan) {
      activeBan.unbanDate = Date.now();
      activeBan.unbanReason = reason;
    }
    this.persistBans();
    this.emitBans();
    bus.emit(Topics.AuthState, this.session);
    return true;
  }

  /** Register a new user. Auto-logs in on success. */
  register(
    username: string,
    email: string,
    password: string,
    referralCode: string,
    mobile: string,
  ): { ok: boolean; error?: string } {
    const uname = username.trim();
    const umail = email.trim().toLowerCase();
    const uref = referralCode.trim();
    const umobile = mobile.trim();

    if (!uname || !umail || !password || !umobile) {
      return { ok: false, error: 'Username, email, password and mobile number are required.' };
    }
    if (uname.length < 3) {
      return { ok: false, error: 'Username must be at least 3 characters.' };
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(umail)) {
      return { ok: false, error: 'Please enter a valid email address.' };
    }
    if (!/^\d{7,15}$/.test(umobile)) {
      return { ok: false, error: 'Please enter a valid mobile number (digits only).' };
    }
    if (password.length < 6) {
      return { ok: false, error: 'Password must be at least 6 characters.' };
    }
    if (this.users.find((u) => u.email === umail)) {
      return { ok: false, error: 'This email is already used. Please login.' };
    }
    if (this.users.find((u) => u.mobile === umobile)) {
      return { ok: false, error: 'This mobile number is already used. Please login.' };
    }

    // ── IP tracking (silent) ────────────────────────────────────────────────
    // The client IP is captured for every registration so admins can review
    // multi-account activity from the same device in the Ban Section > IP
    // Activity view. Registration is NEVER blocked here — the user is not
    // shown any IP-related message. Admins may ban manually from the panel.
    const clientIp = getOrCreateClientIp();
    // ────────────────────────────────────────────────────────────────────────

    const accId = generateAccountId();
    const user: AuthUser = {
      id: accId,
      accountId: accId,
      username: uname,
      email: umail,
      mobile: umobile,
      passwordHash: simpleHash(password),
      referralCode: uref || null,
      ownReferralCode: 'player_' + Math.random().toString(36).slice(2, 8),
      createdAt: Date.now(),
      isActive: true,
      registrationIp: clientIp,
    };

    this.users.push(user);
    this.persistUsers();
    // Grant the admin-configured signup bonus (once per new user).
    try { store.grantSignupBonus(user.accountId, user.username); } catch { /* ignore */ }
    // Notify listeners so IP Activity views refresh with the new registration.
    this.emitBans();

    // Record the referral relationship if the signup came through a valid referral link/code
    if (uref) {
      const referrer = this.users.find(
        (u) => u.id === uref || u.ownReferralCode === uref,
      );
      if (referrer) {
        user.referralCode = referrer.id;
        cms.recordReferralSignup(user, referrer.id);
        this.persistUsers();
      }
    }

    this.session = {
      userId: user.id,
      accountId: user.accountId,
      username: user.username,
      email: user.email,
      loggedInAt: Date.now(),
    };
    this.persistSession();
    this.emitState();
    this.applyPendingReferralRewards();

    cms.pushFromTemplate('nt_welcome', 'Welcome!', `Account created. Welcome, ${uname}!`, 'success');

    const smtp = cms.smtpConfig;
    if (smtp.active) {
      cms.toast({
        title: 'Welcome email sent',
        body: `Dispatched to ${umail} via ${smtp.host}.`,
        kind: 'info',
      });
    }

    return { ok: true };
  }

  /** Login with email or username + password. */
  login(identifier: string, password: string): { ok: boolean; error?: string } {
    const id = identifier.trim().toLowerCase();
    const user = this.users.find(
      (u) => u.email === id || u.username.toLowerCase() === id,
    );
    if (!user) {
      return { ok: false, error: 'No account found with that email or username.' };
    }
    if (user.isActive === false) {
      return { ok: false, error: 'This account has been banned. Contact support.' };
    }
    if (user.passwordHash !== simpleHash(password)) {
      return { ok: false, error: 'Incorrect password.' };
    }

    this.session = {
      userId: user.id,
      accountId: user.accountId,
      username: user.username,
      email: user.email,
      loggedInAt: Date.now(),
    };
    this.persistSession();
    this.emitState();
    this.applyPendingReferralRewards();

    cms.pushFromTemplate('nt_login', 'Logged In', `Welcome back, ${user.username}!`, 'success');

    return { ok: true };
  }

  /** Return all registered users (no password hashes). */
  getUsers(): Omit<AuthUser, 'passwordHash'>[] {
    return this.users.map(({ passwordHash: _, ...u }) => u);
  }

  getUserByUsername(username: string): AuthUser | undefined {
    return this.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  }

  getUserById(id: string): Omit<AuthUser, 'passwordHash'> | undefined {
    const u = this.users.find((x) => x.id === id);
    if (!u) return undefined;
    const { passwordHash: _, ...rest } = u;
    return rest;
  }

  getUserByAccountId(accountId: string): AuthUser | undefined {
    return this.users.find((u) => u.accountId === accountId);
  }

  /** Toggle a user's active status (ban/unban). */
  setUserStatus(id: string, isActive: boolean) {
    const user = this.users.find((u) => u.id === id);
    if (!user) return false;
    user.isActive = isActive;
    this.persistUsers();
    if (!isActive && this.session?.userId === id) {
      this.logout();
    }
    bus.emit(Topics.AuthState, this.session);
    return true;
  }

  /** Log out the current session. */
  logout() {
    this.session = null;
    this.persistSession();
    this.emitState();
    cms.pushFromTemplate('nt_logout', 'Logged Out', 'Your session has ended. See you next time!', 'info');
  }

  async forgotPassword(
    email: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const umail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(umail)) {
      return { ok: false, error: 'Please enter a valid email address.' };
    }

    const user = this.users.find((u) => u.email === umail);
    if (!user) {
      return { ok: false, error: 'No account found with that email address.' };
    }

    const smtp = cms.smtpConfig;
    if (!smtp.active) {
      return { ok: false, error: 'Email service is not configured. Please configure SMTP in the Admin Panel.' };
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.resetCodes[umail] = { email: umail, code, expiresAt: Date.now() + 15 * 60 * 1000 };
    this.persistResetCodes();
    this.cleanupResetCodes();

    try {
      const res = await fetch('/api/auth/reset-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: umail, code, smtp }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        delete this.resetCodes[umail];
        this.persistResetCodes();
        return { ok: false, error: data.error || 'Failed to send reset email.' };
      }
    } catch (e) {
      delete this.resetCodes[umail];
      this.persistResetCodes();
      return { ok: false, error: 'Network error while sending reset email.' };
    }

    cms.toast({
      title: 'Password reset sent',
      body: `A recovery code was sent to ${umail}. Check your inbox.`,
      kind: 'success',
    });

    return { ok: true };
  }

  resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): { ok: boolean; error?: string } {
    const umail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(umail)) {
      return { ok: false, error: 'Please enter a valid email address.' };
    }
    if (!newPassword || newPassword.length < 6) {
      return { ok: false, error: 'Password must be at least 6 characters.' };
    }

    this.cleanupResetCodes();
    const entry = this.resetCodes[umail];
    if (!entry) {
      return { ok: false, error: 'No reset request found for this email. Please request a new code.' };
    }
    if (Date.now() > entry.expiresAt) {
      delete this.resetCodes[umail];
      this.persistResetCodes();
      return { ok: false, error: 'Reset code has expired. Please request a new one.' };
    }
    if (entry.code !== code.trim()) {
      return { ok: false, error: 'Invalid reset code. Please try again.' };
    }

    const user = this.users.find((u) => u.email === umail);
    if (!user) {
      return { ok: false, error: 'No account found with that email address.' };
    }

    user.passwordHash = simpleHash(newPassword);
    this.persistUsers();
    delete this.resetCodes[umail];
    this.persistResetCodes();

    cms.pushFromTemplate('nt_password_reset', 'Password Reset Successful', 'Your password has been updated successfully.', 'success');

    return { ok: true };
  }

  changePassword(
    currentPassword: string,
    newPassword: string,
  ): { ok: boolean; error?: string } {
    if (!this.session) {
      return { ok: false, error: 'You must be logged in to change your password.' };
    }
    if (!newPassword || newPassword.length < 6) {
      return { ok: false, error: 'Password must be at least 6 characters.' };
    }

    const user = this.users.find((u) => u.id === this.session?.userId);
    if (!user) {
      return { ok: false, error: 'Account not found.' };
    }
    if (user.passwordHash !== simpleHash(currentPassword)) {
      return { ok: false, error: 'Current password is incorrect.' };
    }

    user.passwordHash = simpleHash(newPassword);
    this.persistUsers();

    cms.pushFromTemplate('nt_password_changed', 'Password Changed', 'Your password was updated successfully.', 'success');

    return { ok: true };
  }

  processReferralReward(user: AuthUser, amount: number) {
    const cfg = cms.referralConfig;
    const ref = cms.referrals.find(
      (r) => r.referredUserId === user.id && !r.firstDepositApproved,
    );
    if (!ref) return;

    if (amount < cfg.minDeposit) {
      ref.depositAmount = amount;
      bus.emit(Topics.Referrals, cms.referrals);
      return;
    }

    const totalRefs = cms.referrals.filter((r) => r.referrerId === ref.referrerId).length;
    const rewardAmount =
      totalRefs > cfg.tierThreshold
        ? Math.round((amount * cfg.tierPercent) / 100)
        : cfg.rewardAmount;

    ref.firstDepositApproved = true;
    ref.depositAmount = amount;
    ref.rewardAmount = rewardAmount;
    ref.rewardPaid = true;

    const session = this.getSession();
    if (session && session.userId === ref.referrerId) {
      store.credit(rewardAmount);
      ref.rewardCredited = true;
      ref.paidAt = Date.now();
      cms.pushFromTemplate('nt_referral_reward', 'Referral Reward', `${ref.referredUsername} deposited ${store.currency}${amount.toFixed(2)}. You earned ${store.currency}${rewardAmount.toFixed(2)}!`, 'success');
    } else {
      ref.rewardCredited = false;
    }

    bus.emit(Topics.Referrals, cms.referrals);
  }

  applyPendingReferralRewards() {
    const session = this.getSession();
    if (!session) return;
    let credited = 0;
    let total = 0;
    for (const ref of cms.referrals) {
      if (ref.referrerId !== session.userId) continue;
      if (!ref.firstDepositApproved || ref.rewardCredited) continue;
      total += ref.rewardAmount;
      store.credit(ref.rewardAmount);
      ref.rewardCredited = true;
      ref.paidAt = Date.now();
      credited++;
    }
    if (credited > 0) {
      bus.emit(Topics.Referrals, cms.referrals);
      cms.pushFromTemplate('nt_pending_rewards', 'Pending Rewards Credited', `${credited} referral(s) added ${store.currency}${total.toFixed(2)} to your balance.`, 'success');
    }
  }
}

export const auth = new AuthManager();
