// Patch: Restore missing Cms methods deleted in commit 30f1ced.
// Imported once in main.tsx AFTER cms initialises.
// Monkey-patches the cms singleton so callers don't crash at runtime.

import { supabase } from '@/integrations/supabase/client';
import { bus, Topics } from './bus';
import { cms } from './cms';
import type { Country, Referral, AffiliateApplication, AutoGateway, SupportTicket, TicketMessage, StaffDM } from './cms';

type CmsAny = typeof cms & Record<string, unknown>;
const c = cms as CmsAny;

// ---- isGeoBlocked / detectedCountry ----
// Called by GeoBlockOverlay on every render — MUST exist or app crashes
if (!c['isGeoBlocked']) {
  c['isGeoBlocked'] = function (): boolean {
    const country = (cms.countries as Country[]).find((x: Country) => x.id === cms.detectedCountryId);
    return !!(country && !country.isActive);
  };
}

if (!c['detectedCountry']) {
  c['detectedCountry'] = function (): Country | undefined {
    return (cms.countries as Country[]).find((x: Country) => x.id === cms.detectedCountryId);
  };
}

// ---- hashPassword ----
// Called by ManageProfileTab
if (!c['hashPassword']) {
  c['hashPassword'] = async function (plain: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  };
}

// ---- recordReferralSignup ----
// Called by auth.ts register()
if (!c['recordReferralSignup']) {
  c['recordReferralSignup'] = function (referrerId: string, referredUserId: string, referredUsername: string): void {
    // Just log it; the actual Supabase insert is done by the caller in auth.ts
    console.log('[cms] recordReferralSignup', { referrerId, referredUserId, referredUsername });
  };
}

// ---- updateCountry ----
if (!c['updateCountry']) {
  c['updateCountry'] = function (id: string, patch: Partial<Country>): void {
    (cms as { countries: Country[] }).countries = (cms.countries as Country[]).map((x: Country) => x.id === id ? { ...x, ...patch } : x);
    bus.emit(Topics.Countries, cms.countries);
  };
}

// ---- loadReferrals ----
if (!c['loadReferrals']) {
  c['loadReferrals'] = async function (): Promise<void> {
    try {
      const { data, error } = await supabase.rpc('admin_get_referrals');
      if (error) return;
      if (data && Array.isArray(data)) {
        (cms as { referrals: Referral[] }).referrals = data as Referral[];
        bus.emit(Topics.Referrals, cms.referrals);
      }
    } catch { /* ignore */ }
  };
}

// ---- syncReferralsFromSupabase (alias) ----
if (!c['syncReferralsFromSupabase']) {
  c['syncReferralsFromSupabase'] = c['loadReferrals'];
}

// ---- loadAffiliates ----
if (!c['loadAffiliates']) {
  c['loadAffiliates'] = async function (): Promise<void> {
    try {
      const { data, error } = await supabase.from('affiliate_applications').select('*').order('created_at', { ascending: false });
      if (error) return;
      if (data && Array.isArray(data)) {
        (cms as { affiliates: AffiliateApplication[] }).affiliates = data as unknown as AffiliateApplication[];
        bus.emit(Topics.Affiliates, cms.affiliates);
      }
    } catch { /* ignore */ }
  };
}

// ---- syncAffiliatesFromSupabase (alias) ----
if (!c['syncAffiliatesFromSupabase']) {
  c['syncAffiliatesFromSupabase'] = c['loadAffiliates'];
}

// ---- updateAffiliate ----
if (!c['updateAffiliate']) {
  c['updateAffiliate'] = async function (id: string, patch: Partial<AffiliateApplication>): Promise<void> {
    try {
      await supabase.from('affiliate_applications').update(patch).eq('id', id);
      (cms as { affiliates: AffiliateApplication[] }).affiliates = (cms.affiliates as AffiliateApplication[]).map(
        (a: AffiliateApplication) => a.id === id ? { ...a, ...patch } : a,
      );
      bus.emit(Topics.Affiliates, cms.affiliates);
    } catch { /* ignore */ }
  };
}

// ---- getAffiliateByUserId ----
if (!c['getAffiliateByUserId']) {
  c['getAffiliateByUserId'] = function (userId: string): AffiliateApplication | undefined {
    return (cms.affiliates as AffiliateApplication[]).find((a: AffiliateApplication) => a.userId === userId);
  };
}

// ---- addAutoGateway ----
if (!c['addAutoGateway']) {
  c['addAutoGateway'] = async function (gw: Omit<AutoGateway, 'id'>): Promise<void> {
    const newGw: AutoGateway = { ...gw, id: Math.random().toString(36).slice(2) };
    (cms as { autoGateways: AutoGateway[] }).autoGateways = [...(cms.autoGateways as AutoGateway[]), newGw];
    bus.emit(Topics.AutoGateways, cms.autoGateways);
    await supabase.rpc('admin_update_setting', { p_key: 'auto_gateways', p_value: cms.autoGateways as unknown as string }).catch(() => {});
  };
}

// ---- updateAutoGateway ----
if (!c['updateAutoGateway']) {
  c['updateAutoGateway'] = async function (id: string, patch: Partial<AutoGateway>): Promise<void> {
    (cms as { autoGateways: AutoGateway[] }).autoGateways = (cms.autoGateways as AutoGateway[]).map(
      (g: AutoGateway) => g.id === id ? { ...g, ...patch } : g,
    );
    bus.emit(Topics.AutoGateways, cms.autoGateways);
    await supabase.rpc('admin_update_setting', { p_key: 'auto_gateways', p_value: cms.autoGateways as unknown as string }).catch(() => {});
  };
}

// ---- removeAutoGateway ----
if (!c['removeAutoGateway']) {
  c['removeAutoGateway'] = async function (id: string): Promise<void> {
    (cms as { autoGateways: AutoGateway[] }).autoGateways = (cms.autoGateways as AutoGateway[]).filter((g: AutoGateway) => g.id !== id);
    bus.emit(Topics.AutoGateways, cms.autoGateways);
    await supabase.rpc('admin_update_setting', { p_key: 'auto_gateways', p_value: cms.autoGateways as unknown as string }).catch(() => {});
  };
}

// ---- updateReferralReward ----
if (!c['updateReferralReward']) {
  c['updateReferralReward'] = async function (patch: Record<string, unknown>): Promise<void> {
    Object.assign(cms.referralConfig, patch);
    bus.emit(Topics.ReferralConfig, cms.referralConfig);
    await supabase.rpc('admin_update_setting', { p_key: 'referral_config', p_value: cms.referralConfig as unknown as string }).catch(() => {});
  };
}

// ---- getOrCreateDM ----
if (!c['getOrCreateDM']) {
  c['getOrCreateDM'] = function (staffIdA: string, staffIdB: string): StaffDM[] {
    const dms = (cms as { staffDMs: StaffDM[] }).staffDMs;
    return dms.filter((m: StaffDM) => (m.fromId === staffIdA && m.toId === staffIdB) || (m.fromId === staffIdB && m.toId === staffIdA));
  };
}

// ---- sendDM ----
if (!c['sendDM']) {
  c['sendDM'] = function (fromId: string, toId: string, body: string): void {
    const dm: StaffDM = { id: Math.random().toString(36).slice(2), fromId, toId, body, ts: Date.now(), read: false };
    (cms as { staffDMs: StaffDM[] }).staffDMs = [...(cms as { staffDMs: StaffDM[] }).staffDMs, dm];
    bus.emit(Topics.StaffDM, (cms as { staffDMs: StaffDM[] }).staffDMs);
  };
}

// ---- markDMRead ----
if (!c['markDMRead']) {
  c['markDMRead'] = function (toId: string): void {
    (cms as { staffDMs: StaffDM[] }).staffDMs = (cms as { staffDMs: StaffDM[] }).staffDMs.map(
      (m: StaffDM) => m.toId === toId ? { ...m, read: true } : m,
    );
    bus.emit(Topics.StaffDM, (cms as { staffDMs: StaffDM[] }).staffDMs);
  };
}

// ---- updateTicket ----
if (!c['updateTicket']) {
  c['updateTicket'] = async function (ticketId: string, patch: { assignedStaffId?: string | null; status?: SupportTicket['status'] }): Promise<void> {
    (cms as { tickets: SupportTicket[] }).tickets = (cms.tickets as SupportTicket[]).map(
      (t: SupportTicket) => t.id === ticketId ? { ...t, ...patch } : t,
    );
    bus.emit(Topics.Tickets, cms.tickets);
    const update: Record<string, unknown> = {};
    if (patch.assignedStaffId !== undefined) update.assigned_staff_id = patch.assignedStaffId;
    if (patch.status !== undefined) update.status = patch.status === 'closed' ? 'closed' : patch.status === 'assigned' ? 'assigned' : 'open';
    if (Object.keys(update).length > 0) {
      await supabase.from('support_tickets').update(update).eq('id', ticketId).catch(() => {});
    }
  };
}

// ---- sendTicketMessage ----
if (!c['sendTicketMessage']) {
  c['sendTicketMessage'] = async function (ticketId: string, staffId: string, body: string): Promise<void> {
    const newMsg: TicketMessage = {
      id: Math.random().toString(36).slice(2), role: 'agent',
      agentId: staffId, body, ts: Date.now(),
    };
    (cms as { tickets: SupportTicket[] }).tickets = (cms.tickets as SupportTicket[]).map((t: SupportTicket) =>
      t.id === ticketId ? { ...t, messages: [...t.messages, newMsg] } : t,
    );
    bus.emit(Topics.Tickets, cms.tickets);
    await supabase.from('ticket_messages').insert({
      ticket_id: ticketId, sender_type: 'staff', sender_id: staffId, message: body,
    }).catch(() => {});
    await supabase.from('support_tickets').update({ status: 'assigned', assigned_staff_id: staffId }).eq('id', ticketId).catch(() => {});
  };
}

// ---- updateUserProfile ----
if (!c['updateUserProfile']) {
  c['updateUserProfile'] = async function (userId: string, patch: { username?: string; email?: string; phone?: string; vipLevel?: number; isActive?: boolean }): Promise<void> {
    const update: Record<string, unknown> = {};
    if (patch.username !== undefined) update.username = patch.username;
    if (patch.email !== undefined) update.email = patch.email;
    if (patch.phone !== undefined) update.phone = patch.phone;
    if (patch.vipLevel !== undefined) update.vip_level = patch.vipLevel;
    if (patch.isActive !== undefined) update.is_active = patch.isActive;
    if (Object.keys(update).length > 0) {
      await supabase.from('profiles').update(update).eq('id', userId).catch(() => {});
    }
    const { adminUsers } = cms as { adminUsers: { id: string; vipLevel: number; isAdmin: boolean; balance: number; totalDeposit: number; totalWithdrawal: number; username: string; createdAt: string }[] };
    (cms as { adminUsers: typeof adminUsers }).adminUsers = adminUsers.map(u =>
      u.id === userId ? { ...u, ...Object.fromEntries(Object.entries(patch).filter(([k]) => !['isActive'].includes(k))) } : u,
    );
    bus.emit(Topics.AdminUsers, cms.adminUsers);
  };
}

console.log('[patch] cms missing methods restored ✓');
