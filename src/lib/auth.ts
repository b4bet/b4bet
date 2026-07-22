// Auth manager - Supabase Auth backend
import { supabase } from '@/integrations/supabase/client';
import { bus, Topics } from './bus';
import { store } from './store';
import { cms } from './cms';
import { logUserIp } from './supabaseIntegration';

export interface AuthUser {
  id: string; accountId: string; username: string; email: string; mobile: string;
  referralCode: string | null; ownReferralCode?: string;
  createdAt: number; isActive: boolean; registrationIp?: string;
}

export interface AuthSession {
  userId: string; accountId: string; username: string; email: string; loggedInAt: number;
}

export interface BanRecord {
  userId: string; username: string; email: string; ip: string;
  banDate: number; banReason: string; bannedBy: 'system' | 'admin';
  unbanDate?: number; unbanReason?: string;
}

function generateAccountId(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Fetch the real client IP from a public API, fall back to a random local IP */
async function getClientIp(): Promise<string> {
  try {
    const stored = localStorage.getItem('b4bet.clientIp');
    if (stored) return stored;
    // Try to get real IP
    const res = await fetch('https://api.ipify.org?format=json');
    if (res.ok) {
      const json = await res.json() as { ip: string };
      const ip = json.ip;
      localStorage.setItem('b4bet.clientIp', ip);
      return ip;
    }
  } catch { /* fall through */ }
  // Fallback: stable random IP stored in localStorage
  try {
    const fallback = `${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
    localStorage.setItem('b4bet.clientIp', fallback);
    return fallback;
  } catch { return '0.0.0.0'; }
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
      if (user && user.referralCode) this.processReferralReward(user, amount);
    });
  }

  private async loadSession() {
    try {
      const raw = localStorage.getItem('b4bet.session');
      if (raw) this.session = JSON.parse(raw) as AuthSession;
    } catch { /* ignore */ }
    if (this.session) {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s) {
        this.session = {
          userId: s.user.id,
          accountId: (s.user.user_metadata['accountId'] as string) || '',
          username: (s.user.user_metadata['username'] as string) || s.user.email || '',
          email: s.user.email || '',
          loggedInAt: Date.now(),
        };
        this.persistSession();
      } else { this.session = null; this.persistSession(); }
    }
    this.emitState();
  }

  private persistSession() {
    try {
      if (this.session) localStorage.setItem('b4bet.session', JSON.stringify(this.session));
      else localStorage.removeItem('b4bet.session');
    } catch { /* ignore */ }
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

    // Get real client IP before registration
    const clientIp = await getClientIp();
    const accountId = generateAccountId();

    const { data, error } = await supabase.auth.signUp({
      email: umail, password,
      options: { data: { username: uname, accountId, mobile: umobile, referralCode: uref || null, registrationIp: clientIp } },
    });
    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already exists'))
        return { ok: false, error: 'This email is already registered. Please login.' };
      return { ok: false, error: error.message };
    }
    if (!data.user) return { ok: false, error: 'Registration failed. Please try again.' };

    // Save profile with registration_ip
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
      registration_ip: clientIp,
    });

    // Log IP to ip_logs table for tracking
    void logUserIp(data.user.id, clientIp, 'signup');

    try { store.grantSignupBonus(data.user.id, uname); } catch { /* ignore */ }
    this.session = { userId: data.user.id, accountId, username: uname, email: umail, loggedInAt: Date.now() };
    this.persistSession();
    this.emitState();
    if (uref) {
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
    const { data, error } = await supabase.auth.signInWithPassword({
      email: id.includes('@') ? id : `${id}@b4bet.local`, password,
    });
    if (error) {
      const { data: profileData } = await supabase.from('profiles').select('id').eq('username', id).single();
      if (profileData) {
        const { data: d2, error: e2 } = await supabase.auth.signInWithPassword({
          email: id.includes('@') ? id : `${id}@placeholder.local`, password,
        });
        if (e2) return { ok: false, error: 'Invalid email/username or password.' };
        if (d2.user) {
          this.session = {
            userId: d2.user.id,
            accountId: (d2.user.user_metadata['accountId'] as string) || '',
            username: (d2.user.user_metadata['username'] as string) || id,
            email: d2.user.email || '', loggedInAt: Date.now(),
          };
          this.persistSession(); this.emitState(); this.applyPendingReferralRewards();
          // Log IP on successful login
          void getClientIp().then((ip) => logUserIp(d2.user.id, ip, 'login'));
          cms.pushFromTemplate('nt_login', 'Logged In', `Welcome back, ${this.session.username}!`, 'success');
          return { ok: true };
        }
      }
      return { ok: false, error: 'Invalid email/username or password.' };
    }
    if (!data.user) return { ok: false, error: 'Login failed.' };
    this.session = {
      userId: data.user.id,
      accountId: (data.user.user_metadata['accountId'] as string) || '',
      username: (data.user.user_metadata['username'] as string) || id,
      email: data.user.email || '', loggedInAt: Date.now(),
    };
    this.persistSession(); this.emitState(); this.applyPendingReferralRewards();
    // Log IP on successful login
    void getClientIp().then((ip) => logUserIp(data.user.id, ip, 'login'));
    cms.pushFromTemplate('nt_login', 'Logged In', `Welcome back, ${this.session.username}!`, 'success');
    return { ok: true };
  }

  async logout() {
    await supabase.auth.signOut();
    this.session = null; this.persistSession(); this.emitState();
    cms.pushFromTemplate('nt_logout', 'Logged Out', 'Your session has ended. See you next time!', 'info');
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
  getUserByUsername(username: string): AuthUser | undefined {
    return this.usersCache.find(u => u.username.toLowerCase() === username.toLowerCase());
  }
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
    if (!user) return false;
    user.isActive = false;
    this.bannedUsers.push({
      userId: user.id, username: user.username, email: user.email,
      ip: user.registrationIp ?? '0.0.0.0',
      banDate: Date.now(), banReason: reason, bannedBy,
    });
    this.persistBans();
    bus.emit('auth:bans', this.bannedUsers);
    if (this.session?.userId === id) void this.logout();
    return true;
  }

  unbanUser(id: string, reason: string): boolean {
    const rec = this.bannedUsers.find(b => b.userId === id && !b.unbanDate);
    if (!rec) return false;
    rec.unbanDate = Date.now();
    rec.unbanReason = reason;
    const user = this.usersCache.find(u => u.id === id);
    if (user) user.isActive = true;
    this.persistBans();
    bus.emit('auth:bans', this.bannedUsers);
    return true;
  }

  getBannedUsers(): BanRecord[] {
    return this.bannedUsers.filter(b => !b.unbanDate);
  }

  getAllBanHistory(): BanRecord[] {
    return [...this.bannedUsers];
  }

  private persistBans() {
    try { localStorage.setItem('b4bet.bans', JSON.stringify(this.bannedUsers)); } catch { /* ignore */ }
  }

  private applyPendingReferralRewards() { /* stub */ }
  private processReferralReward(_user: AuthUser, _amount: number) { /* stub */ }
}

export const auth = new AuthManager();
