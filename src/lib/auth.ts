// Auth manager - Supabase Auth backend
import { supabase } from '@/integrations/supabase/client';
import { bus, Topics } from './bus';
import { store } from './store';
import { cms } from './cms';
import { logUserIp } from './supabaseIntegration';
import { emailService } from './emailService';

export interface AuthUser {
  id: string; accountId: string; username: string; email: string; mobile: string;
  referralCode: string | null; ownReferralCode?: string;
  createdAt: number; isActive: boolean; registrationIp?: string;
}

export interface AuthSession {
  userId: string; accountId: string; username: string; email: string; loggedInAt: number;
}

export interface BanRecord {
  id?: string;
  userId: string; username: string; email: string; ip: string;
  banDate: number; banReason: string; bannedBy: 'system' | 'admin';
  unbanDate?: number; unbanReason?: string;
}

function generateAccountId(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function getClientIp(): Promise<string> {
  const sessionIp = sessionStorage.getItem('b4bet.clientIp');
  if (sessionIp) return sessionIp;
  const services: Array<() => Promise<string>> = [
    async () => { const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) }); const j = await r.json() as { ip: string }; return j.ip; },
    async () => { const r = await fetch('https://api64.ipify.org?format=json', { signal: AbortSignal.timeout(3000) }); const j = await r.json() as { ip: string }; return j.ip; },
    async () => { const r = await fetch('https://api.my-ip.io/v1/ip.json', { signal: AbortSignal.timeout(3000) }); const j = await r.json() as { ip: string }; return j.ip; },
    async () => { const r = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) }); const j = await r.json() as { ip: string }; return j.ip; },
  ];
  for (const fn of services) {
    try { const ip = await fn(); if (ip && ip.length > 3) { sessionStorage.setItem('b4bet.clientIp', ip); return ip; } } catch { /* try next */ }
  }
  return '';
}

async function recordSignupIp(accessToken: string, action: 'signup' | 'login' = 'signup'): Promise<string> {
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/record-ip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) return '';
    const json = await res.json();
    return (json?.ip as string) ?? '';
  } catch { return ''; }
}

async function logIpWithFallback(userId: string, accessToken: string | undefined, action: 'signup' | 'login'): Promise<string> {
  if (accessToken) {
    const serverIp = await recordSignupIp(accessToken, action);
    if (serverIp) { void logUserIp(userId, serverIp, action); sessionStorage.setItem('b4bet.clientIp', serverIp); return serverIp; }
  }
  const clientIp = await getClientIp();
  if (clientIp) { void logUserIp(userId, clientIp, action); return clientIp; }
  return '';
}

class AuthManager {
  private session: AuthSession | null = null;
  private usersCache: AuthUser[] = [];
  private bannedUsers: BanRecord[] = [];
  private bansLoaded = false;

  constructor() {
    this.loadSession();
    this.applyPendingReferralRewards();
    void this.loadBansFromSupabase();
    bus.on(Topics.ReferralDepositApproved, (payload) => {
      const { username, amount } = payload as { username: string; amount: number };
      const user = this.usersCache.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (user && user.referralCode) this.processReferralReward(user, amount);
    });
  }

  async loadBansFromSupabase() {
    try {
      const { data, error } = await supabase.rpc('admin_get_bans');
      if (error) throw error;
      const rows = (data ?? []) as { id: string; user_id: string; username: string; email: string; ip: string; ban_reason: string; banned_by: string; ban_date: string; unban_date: string | null; unban_reason: string | null; }[];
      this.bannedUsers = rows.map(r => ({ id: r.id, userId: r.user_id, username: r.username, email: r.email, ip: r.ip, banReason: r.ban_reason, bannedBy: (r.banned_by === 'system' ? 'system' : 'admin') as 'system' | 'admin', banDate: new Date(r.ban_date).getTime(), unbanDate: r.unban_date ? new Date(r.unban_date).getTime() : undefined, unbanReason: r.unban_reason ?? undefined }));
      this.bansLoaded = true;
      bus.emit('auth:bans', this.bannedUsers);
    } catch (e) { console.error('[auth] loadBansFromSupabase error:', e); }
  }

  private async loadSession() {
    try { const raw = localStorage.getItem('b4bet.session'); if (raw) this.session = JSON.parse(raw) as AuthSession; } catch { /* ignore */ }
    if (this.session) {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s) {
        this.session = { userId: s.user.id, accountId: (s.user.user_metadata['accountId'] as string) || '', username: (s.user.user_metadata['username'] as string) || s.user.email || '', email: s.user.email || '', loggedInAt: Date.now() };
        this.persistSession();
      } else { this.session = null; this.persistSession(); }
    }
    this.emitState();
  }

  private persistSession() {
    try { if (this.session) localStorage.setItem('b4bet.session', JSON.stringify(this.session)); else localStorage.removeItem('b4bet.session'); } catch { /* ignore */ }
  }

  private emitState() { bus.emit(Topics.AuthState, this.session); }
  getSession(): AuthSession | null { return this.session; }
  isLoggedIn(): boolean { return this.session !== null; }

  async register(username: string, email: string, password: string, referralCode: string, mobile: string): Promise<{ ok: boolean; error?: string }> {
    const uname = username.trim();
    const umail = email.trim().toLowerCase();
    const uref = referralCode.trim();
    const umobile = mobile.trim();
    if (!uname || !umail || !password || !umobile) return { ok: false, error: 'Username, email, password and mobile number are required.' };
    if (uname.length < 3) return { ok: false, error: 'Username must be at least 3 characters.' };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(umail)) return { ok: false, error: 'Please enter a valid email address.' };
    if (!/^\d{7,15}$/.test(umobile)) return { ok: false, error: 'Please enter a valid mobile number (digits only).' };
    if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };

    // If referral code provided, validate it BEFORE signup to show clear error
    let referrerId: string | null = null;
    if (uref) {
      try {
        // Try account_id match first (6-digit short code used in referral links)
        const { data: byAccountId } = await supabase
          .from('profiles')
          .select('id')
          .eq('account_id', uref)
          .maybeSingle();
        if (byAccountId) {
          referrerId = byAccountId.id as string;
        } else {
          // Fallback: try username match (legacy links)
          const { data: byUsername } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', uref)
            .maybeSingle();
          if (byUsername) referrerId = byUsername.id as string;
        }
        if (!referrerId) {
          return { ok: false, error: 'Invalid referral code. Please check and try again.' };
        }
      } catch (e) {
        console.warn('[auth] referral lookup failed, ignoring:', e);
        // Don't block signup if referral lookup fails due to network
        referrerId = null;
      }
    }

    const accountId = generateAccountId();
    const { data, error } = await supabase.auth.signUp({
      email: umail, password,
      options: { data: { username: uname, accountId, mobile: umobile, referralCode: uref || null } },
    });
    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already exists'))
        return { ok: false, error: 'This email is already registered. Please login.' };
      return { ok: false, error: error.message };
    }
    if (!data.user) return { ok: false, error: 'Registration failed. Please try again.' };

    // Set session immediately so user is logged in
    this.session = { userId: data.user.id, accountId, username: uname, email: umail, loggedInAt: Date.now() };
    this.persistSession();
    this.emitState();

    // All post-signup steps are non-blocking — wrapped in try/catch so they
    // NEVER prevent the signup from succeeding or the modal from closing.
    void (async () => {
      try {
        // IP logging — fire and forget
        const ipPromise = logIpWithFallback(data.user!.id, data.session?.access_token, 'signup');

        // IMPORTANT: Upsert profile FIRST and await it.
        // referrals table has a FK on profiles.id — inserting referral before
        // profile exists causes a FK violation and silently drops the referral.
        const { error: profileErr } = await supabase.from('profiles').upsert({
          id: data.user!.id, username: uname, display_name: uname, phone: umobile,
          balance: 0, total_deposit: 0, total_withdrawal: 0, vip_level: 0, is_admin: false,
          account_id: accountId, is_active: true, signup_bonus_granted: false,
          registration_ip: null,
        });
        if (profileErr) console.error('[auth] profile upsert error:', profileErr);

        // Update registration_ip in background once IP resolves
        ipPromise.then((realIp) => {
          if (realIp) {
            void supabase.from('profiles').update({ registration_ip: realIp }).eq('id', data.user!.id).catch(() => {});
            void logUserIp(data.user!.id, realIp, 'signup').catch?.(() => {});
          }
        }).catch(() => {});

        // Grant signup bonus
        void store.grantSignupBonusAsync(data.user!.id, uname);

        // Send welcome email
        emailService.sendWelcome(umail, uname);

        // Record referral AFTER profile is upserted (FK constraint on referrals.referred_id → profiles.id)
        if (uref && referrerId) {
          // cms.recordReferralSignup(referrerId, referredUserId, referredUsername)
          cms.recordReferralSignup(referrerId, data.user!.id, uname);

          const { error: refErr } = await supabase.rpc('record_referral', {
            p_referrer_id: referrerId,
            p_referred_id: data.user!.id,
            p_bonus_amount: 0,
            p_status: 'pending',
          });
          if (refErr) console.error('[auth] record_referral error:', refErr);
        }

        cms.pushFromTemplate('nt_welcome', 'Welcome!', `Account created. Welcome, ${uname}!`, 'success');
      } catch (e) {
        // Post-signup steps failed — log but don't surface to user
        console.error('[auth] post-signup background error:', e);
      }
    })();

    return { ok: true };
  }

  async login(identifier: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const id = identifier.trim();
    const idLower = id.toLowerCase();

    const isMobile = /^[\d\s+\-()]{7,15}$/.test(id.replace(/[\s+\-()]/g, ''));

    if (isMobile) {
      const mobileClean = id.replace(/\D/g, '');
      try {
        const { data: profileData } = await supabase.from('profiles').select('id, username').eq('phone', mobileClean).maybeSingle();
        if (profileData) {
          const username = profileData.username as string;
          for (const suffix of ['@b4bet.local', '@placeholder.local']) {
            const { data: d, error: e } = await supabase.auth.signInWithPassword({ email: `${username}${suffix}`, password });
            if (!e && d.user) {
              const accountId = (d.user.user_metadata['accountId'] as string) || '';
              this.session = { userId: d.user.id, accountId, username: (d.user.user_metadata['username'] as string) || username, email: d.user.email || '', loggedInAt: Date.now() };
              this.persistSession(); this.emitState(); this.applyPendingReferralRewards();
              if (accountId) void supabase.from('profiles').update({ account_id: accountId }).eq('id', d.user.id).then(() => {}).catch(() => {});
              void logIpWithFallback(d.user.id, d.session?.access_token, 'login');
              cms.pushFromTemplate('nt_login', 'Logged In', `Welcome back, ${this.session.username}!`, 'success');
              return { ok: true };
            }
          }
        }
      } catch { /* fall through */ }
      return { ok: false, error: 'Invalid mobile number or password.' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: idLower.includes('@') ? idLower : `${idLower}@b4bet.local`, password,
    });
    if (error) {
      const { data: profileData } = await supabase.from('profiles').select('id').eq('username', idLower).single();
      if (profileData) {
        const { data: d2, error: e2 } = await supabase.auth.signInWithPassword({
          email: idLower.includes('@') ? idLower : `${idLower}@placeholder.local`, password,
        });
        if (e2) return { ok: false, error: 'Invalid email or password.' };
        if (d2.user) {
          const accountId = (d2.user.user_metadata['accountId'] as string) || '';
          this.session = { userId: d2.user.id, accountId, username: (d2.user.user_metadata['username'] as string) || idLower, email: d2.user.email || '', loggedInAt: Date.now() };
          this.persistSession(); this.emitState(); this.applyPendingReferralRewards();
          if (accountId) void supabase.from('profiles').update({ account_id: accountId }).eq('id', d2.user.id).then(() => {}).catch(() => {});
          void logIpWithFallback(d2.user.id, d2.session?.access_token, 'login');
          cms.pushFromTemplate('nt_login', 'Logged In', `Welcome back, ${this.session.username}!`, 'success');
          return { ok: true };
        }
      }
      return { ok: false, error: 'Invalid email or password.' };
    }
    if (!data.user) return { ok: false, error: 'Login failed.' };
    const accountId = (data.user.user_metadata['accountId'] as string) || '';
    this.session = { userId: data.user.id, accountId, username: (data.user.user_metadata['username'] as string) || idLower, email: data.user.email || '', loggedInAt: Date.now() };
    this.persistSession(); this.emitState(); this.applyPendingReferralRewards();
    if (accountId) void supabase.from('profiles').update({ account_id: accountId }).eq('id', data.user.id).then(() => {}).catch(() => {});
    void logIpWithFallback(data.user.id, data.session?.access_token, 'login');
    cms.pushFromTemplate('nt_login', 'Logged In', `Welcome back, ${this.session.username}!`, 'success');
    return { ok: true };
  }

  private isLoggingOut = false;

  async logout() {
    if (this.isLoggingOut) return;
    this.isLoggingOut = true;
    try {
      await supabase.auth.signOut();
      this.session = null; this.persistSession(); this.emitState();
      cms.pushFromTemplate('nt_logout', 'Logged Out', 'Your session has ended. See you next time!', 'info');
    } finally { this.isLoggingOut = false; }
  }

  async forgotPassword(email: string): Promise<{ ok: boolean; error?: string }> {
    const umail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(umail)) return { ok: false, error: 'Please enter a valid email address.' };
    const { error } = await supabase.auth.resetPasswordForEmail(umail, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) return { ok: false, error: error.message };
    cms.toast({ title: 'Password reset sent', body: `A recovery link was sent to ${umail}. Check your inbox.`, kind: 'success' });
    return { ok: true };
  }

  async resetPassword(_code: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
    if (!newPassword || newPassword.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    cms.pushFromTemplate('nt_password_reset', 'Password Reset Successful', 'Your password has been updated successfully.', 'success');
    return { ok: true };
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.session) return { ok: false, error: 'You must be logged in to change your password.' };
    if (!newPassword || newPassword.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
    const { error: reauthErr } = await supabase.auth.signInWithPassword({ email: this.session.email, password: currentPassword });
    if (reauthErr) return { ok: false, error: 'Current password is incorrect.' };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    cms.pushFromTemplate('nt_password_changed', 'Password Changed', 'Your password was updated successfully.', 'success');
    return { ok: true };
  }

  getUsers(): AuthUser[] { return [...this.usersCache]; }
  getUserByUsername(username: string): AuthUser | undefined { return this.usersCache.find(u => u.username.toLowerCase() === username.toLowerCase()); }
  getUserById(id: string): AuthUser | undefined { return this.usersCache.find(x => x.id === id); }
  getUserByAccountId(accountId: string): AuthUser | undefined { return this.usersCache.find(u => u.accountId === accountId); }

  setUserStatus(id: string, isActive: boolean) {
    const user = this.usersCache.find(u => u.id === id);
    if (!user) return false;
    user.isActive = isActive;
    if (!isActive && this.session?.userId === id) void this.logout();
    bus.emit(Topics.AuthState, this.session);
    return true;
  }

  banUser(id: string, reason: string, bannedBy: 'system' | 'admin' = 'admin'): boolean {
    const user = this.usersCache.find(u => u.id === id);
    const username = user?.username ?? id;
    const email = user?.email ?? '';
    const ip = user?.registrationIp ?? sessionStorage.getItem('b4bet.clientIp') ?? '';
    void supabase.rpc('admin_ban_user', { p_user_id: id, p_username: username, p_email: email, p_ip: ip, p_reason: reason, p_banned_by: bannedBy })
      .then(() => { void this.loadBansFromSupabase(); }).catch(e => console.error('[auth] banUser error:', e));
    if (user) user.isActive = false;
    this.bannedUsers.push({ userId: id, username, email, ip, banDate: Date.now(), banReason: reason, bannedBy });
    bus.emit('auth:bans', this.bannedUsers);
    if (this.session?.userId === id) void this.logout();
    return true;
  }

  unbanUser(userId: string, reason: string): boolean {
    const banRecord = this.bannedUsers.find(b => b.userId === userId && !b.unbanDate);
    if (!banRecord) return false;
    const banId = banRecord.id;
    if (banId) {
      void supabase.rpc('admin_unban_user', { p_ban_id: banId, p_reason: reason })
        .then(() => void this.loadBansFromSupabase()).catch(e => console.error('[auth] unbanUser error:', e));
    }
    banRecord.unbanDate = Date.now(); banRecord.unbanReason = reason;
    const user = this.usersCache.find(u => u.id === userId);
    if (user) user.isActive = true;
    bus.emit('auth:bans', this.bannedUsers);
    return true;
  }

  getBannedUsers(): BanRecord[] { return this.bannedUsers.filter(b => !b.unbanDate); }
  getAllBanHistory(): BanRecord[] { return [...this.bannedUsers]; }

  private processReferralReward(user: AuthUser, amount: number) {
    const cfg = cms.referralConfig;
    if (!cfg || !user.referralCode) return;
    let reward = 0;
    if (cfg.model === 'CPA') reward = cfg.cpaAmount ?? 0;
    else if (cfg.model === 'RevShare') reward = Math.round(amount * ((cfg.revSharePercent ?? 0) / 100) * 100) / 100;
    else if (cfg.model === 'Hybrid') { reward = (cfg.cpaAmount ?? 0) + Math.round(amount * ((cfg.revSharePercent ?? 0) / 100) * 100) / 100; }
    if (reward > 0) {
      store.creditUser(user.referralCode, reward);
      store.pushNotification({ title: 'Referral Reward', body: `You earned ${store.currency}${reward.toFixed(2)} from a referral deposit.`, kind: 'success' });
    }
  }

  private pendingReferralRewards: Array<{ username: string; amount: number }> = [];

  private applyPendingReferralRewards() {
    for (const r of this.pendingReferralRewards) {
      const user = this.usersCache.find(u => u.username.toLowerCase() === r.username.toLowerCase());
      if (user && user.referralCode) this.processReferralReward(user, r.amount);
    }
    this.pendingReferralRewards = [];
  }
}

export const auth = new AuthManager();
