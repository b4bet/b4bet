// Auth manager â€” Supabase Auth backend
// Handles user registration, login, logout, and forgot-password via Supabase.

import { supabase } from '@/integrations/supabase/client';
import { bus, Topics } from './bus';
import { store } from './store';
import { cms } from './cms';

export interface AuthUser {
  id: string;
  accountId: string;
  username: string;
  email: string;
  mobile: string;
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

/** Generate 6-digit numeric account ID */
function generateAccountId(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Get or create simulated client IP fingerprint stored in localStorage */
function getOrCreateClientIp(): string {
  try {
    const stored = localStorage.getItem('b4bet.clientIp');
    if (stored) return stored;
    const ip = `${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
    localStorage.setItem('b4bet.clientIp', ip);
    return ip;
  } catch {
    return '0.0.0.0';
  }
}

class AuthManager {
  private session: AuthSession | null = null;
  private usersCache: AuthUser[] = [];
  private bannedUsers: BanRecord[] = [];

  constructor() {
    this.loadSession();
    this.applyPendingReferralRewards();

    bus.on(Topics.ReferralDepositApproved, (payload) => {
      const { username, amount } = payload as { username: string; amount: number };
      const user = this.usersCache.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (user && user.referralCode) {
        this.processReferralReward(user, amount);
      }
    });
  }

  private async loadSession() {
    // Restore session from localStorage
    try {
      const raw = localStorage.getItem('b4bet.session');
      if (raw) this.session = JSON.parse(raw) as AuthSession;
    } catch { /* ignore */ }

    // Verify session is still valid with Supabase
    if (this.session) {
      const { data: { session: supabaseSession } } = await supabase.auth.getSession();
      if (supabaseSession) {
        this.session = {
          userId: supabaseSession.user.id,
          accountId: supabaseSession.user.user_metadata.accountId || '',
          username: supabaseSession.user.user_metadata.username || supabaseSession.user.email || '',
          email: supabaseSession.user.email || '',
          loggedInAt: Date.now(),
        };
        this.persistSession();
      } else {
        this.session = null;
        this.persistSession();
      }
    }
    this.emitState();
  }

  private persistSession() {
    try {
      if (this.session) {
        localStorage.setItem('b4bet.session', JSON.stringify(this.session));
      } else {
        localStorage.removeItem('b4bet.session');
      }
    } catch { /* ignore */ }
  }

  private emitState() {
    bus.emit(Topics.AuthState, this.session);
  }

  getSession(): AuthSession | null {
    return this.session;
  }

  isLoggedIn(): boolean {
    return this.session !== null;
  }

  async register(
    username: string,
    email: string,
    password: string,
    referralCode: string,
    mobile: string,
  ): Promise<{ ok: boolean; error?: string }> {
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

    const clientIp = getOrCreateClientIp();
    const accountId = generateAccountId();

    // Sign up with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email: umail,
      password,
      options: {
        data: {
          username: uname,
          accountId,
          mobile: umobile,
          referralCode: uref || null,
          registrationIp: clientIp,
        },
      },
    });

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already exists')) {
        return { ok: false, error: 'This email is already registered. Please login.' };
      }
      return { ok: false, error: error.message };
    }

    if (!data.user) {
      return { ok: false, error: 'Registration failed. Please try again.' };
    }

    // Create profile in profiles table
    const ownRef = 'player_' + Math.random().toString(36).slice(2, 10);
    await supabase.from('profiles').upsert({
      id: data.user.id,
      username: uname,
      display_name: uname,
      phone: umobile,
      balance: 0,
      total_deposit: 0,
      total_withdrawal: 0,
      vip_level: 0,
      is_admin: false,
    });

    // Grant signup bonus
    try { store.grantSignupBonus(data.user.id, uname); } catch { /* ignore */ }

    // Set session
    this.session = {
      userId: data.user.id,
      accountId,
      username: uname,
      email: umail,
      loggedInAt: Date.now(),
    };
    this.persistSession();
    this.emitState();

    if (uref) {
      // Record referral
      const { data: profiles } = await supabase.from('profiles').select('id').eq('username', uref);
      if (profiles && profiles.length > 0) {
        cms.recordReferralSignup(
          { id: data.user.id, accountId, username: uname, email: umail, mobile: umobile, referralCode: uref, createdAt: Date.now(), isActive: true },
          profiles[0].id
        );
      }
    }

    cms.pushFromTemplate('nt_welcome', 'Welcome!', `Account created. Welcome, ${uname}!`, 'success');
    return { ok: true };
  }

  async login(identifier: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const id = identifier.trim().toLowerCase();

    // Try Supabase sign-in
    const { data, error } = await supabase.auth.signInWithPassword({
      email: id.includes('@') ? id : `${id}@b4bet.local`,
      password,
    });

    if (error) {
      // Fallback: try using email from profiles
      const { data: profileData } = await supabase.from('profiles').select('id').eq('username', id).single();
      if (profileData) {
        const { data: d2, error: e2 } = await supabase.auth.signInWithPassword({
          email: id.includes('@') ? id : `${id}@placeholder.local`,
          password,
        });
        if (e2) {
          return { ok: false, error: 'Invalid email/username or password.' };
        }
        if (d2.user) {
          this.session = {
            userId: d2.user.id,
            accountId: d2.user.user_metadata.accountId || '',
            username: d2.user.user_metadata.username || id,
            email: d2.user.email || '',
            loggedInAt: Date.now(),
          };
          this.persistSession();
          this.emitState();
          this.applyPendingReferralRewards();
          cms.pushFromTemplate('nt_login', 'Logged In', `Welcome back, ${this.session.username}!`, 'success');
          return { ok: true };
        }
      }
      return { ok: false, error: 'Invalid email/username or password.' };
    }

    if (!data.user) {
      return { ok: false, error: 'Login failed.' };
    }

    this.session = {
      userId: data.user.id,
      accountId: data.user.user_metadata.accountId || '',
      username: data.user.user_metadata.username || id,
      email: data.user.email || '',
      loggedInAt: Date.now(),
    };
    this.persistSession();
    this.emitState();
    this.applyPendingReferralRewards();

    cms.pushFromTemplate('nt_login', 'Logged In', `Welcome back, ${this.session.username}!`, 'success');
    return { ok: true };
  }

  async logout() {
    await supabase.auth.signOut();
    this.session = null;
    this.persistSession();
    this.emitState();
    cms.pushFromTemplate('nt_logout', 'Logged Out', 'Your session has ended. See you next time!', 'info');
  }

  async forgotPassword(email: string): Promise<{ ok: boolean; error?: string }> {
    const umail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(umail)) {
      return { ok: false, error: 'Please enter a valid email address.' };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(umail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    cms.toast({
      title: 'Password reset sent',
      body: `A recovery link was sent to ${umail}. Check your inbox.`,
      kind: 'success',
    });
    return { ok: true };
  }

  async resetPassword(code: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
    if (!newPassword || newPassword.length < 6) {
      return { ok: false, error: 'Password must be at least 6 characters.' };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      return { ok: false, error: error.message };
    }

    cms.pushFromTemplate('nt_password_reset', 'Password Reset Successful', 'Your password has been updated successfully.', 'success');
    return { ok: true };
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.session) {
      return { ok: false, error: 'You must be logged in to change your password.' };
    }
    if (!newPassword || newPassword.length < 6) {
      return { ok: false, error: 'Password must be at least 6 characters.' };
    }

    // Verify current password by re-authenticating
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: this.session.email,
      password: currentPassword,
    });
    if (reauthErr) {
      return { ok: false, error: 'Current password is incorrect.' };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return { ok: false, error: error.message };
    }

    cms.pushFromTemplate('nt_password_changed', 'Password Changed', 'Your password was updated successfully.', 'success');
    return { ok: true };
  }

  getUsers(): Omit<AuthUser, 'passwordHash'>[] {
    return this.usersCache.map(({ /* omit sensitive */ ...u }) => u as any);
  }

  getUserByUsername(username: string): AuthUser | undefined {
    return this.usersCache.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  getUserById(id: string): Omit<AuthUser, 'passwordHash'> | undefined {
    const u = this.usersCache.find(x => x.id === id);
    if (!u) return undefined;
    return u as any;
  }

  getUserByAccountId(accountId: string): AuthUser | undefined {
    return this.usersCache.find(u => u.accountId === accountId);
  }

  setUserStatus(id: string, isActive: boolean) {
    const user = this.usersCache.find(u => u.id === id);
    if (!user) return false;
    user.isActive = isActive;
    if (!isActive && this.session?.userId === id) {
      this.logout();
    }
    bus.emit(Topics.AuthState, this.session);
    return true;
  }

  banUser(id: string, reason: string, bannedBy: 'system' | 'admin' = 'admin'): boolean {
    const user = this.usersCache.find(u => u.id === id);
    if (!user) return false;
    user.isActive = false;
    const record: BanRecord = {
      userId: user.id,
      username: user.username,
      email: user.email,
      ip: user.registrationIp ?? '\u2014',
      banDate: Date.now(),
      banReason: reason,
      bannedBy,
    };
    this.bannedUsers.push(record);
    if (this.session?.userId === id) this.logout();
    else bus.emit(Topics.AuthState, this.session);
    return true;
  }

  unbanUser(id: string, reason: string): boolean {
    const user = this.usersCache.find(u => u.id === id);
    if (!user) return false;
    user.isActive = true;
    const activeBan = this.bannedUsers.find(b => b.userId === id && !b.unbanDate);
    if (activeBan) {
      activeBan.unbanDate = Date.now();
      activeBan.unbanReason = reason;
    }
    bus.emit(Topics.AuthState, this.session);
    return true;
  }

  getBannedUsers(): BanRecord[] {
    return this.bannedUsers.filter(b => !b.unbanDate);
  }

  getAllBanHistory(): BanRecord[] {
    return [...this.bannedUsers];
  }

  private processReferralReward(user: AuthUser, amount: number) {
    const cfg = cms.referralConfig;
    const ref = cms.referrals.find(r => r.referredUserId === user.id && !r.firstDepositApproved);
    if (!ref) return;
    if (amount < cfg.minDeposit) {
      ref.depositAmount = amount;
      bus.emit(Topics.Referrals, cms.referrals);
      return;
    }
    const totalRefs = cms.referrals.filter(r => r.referrerId === ref.referrerId).length;
    const rewardAmount = totalRefs > cfg.tierThreshold
      ? Math.round((amount * cfg.tierPercent) / 100)
      : cfg.rewardAmount;
    ref.firstDepositApproved = true;
    ref.depositAmount = amount;
    ref.rewardAmount = rewardAmount;
    ref.rewardPaid = true;
    const sess = this.getSession();
    if (sess && sess.userId === ref.referrerId) {
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
    const sess = this.getSession();
    if (!sess) return;
    let credited = 0;
    let total = 0;
    for (const ref of cms.referrals) {
      if (ref.referrerId !== sess.userId) continue;
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