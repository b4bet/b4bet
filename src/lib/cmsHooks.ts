import { useEffect, useState } from 'react';
import { bus, Topics } from './bus';
import { cms } from './cms';
import { getOrCreateAccountId } from './accountId';
import { supabase } from '../integrations/supabase/client';
import type { BannerSlide, DepositRequest, WithdrawalRequest, SupportMessage, StaffAccount, EmailTemplates, Country, ReferralConfig, Referral, AffiliateApplication, AutoGateway, ManualMethod, SupportTicket, DynamicPage } from './cms';

function useBusValue<T>(topic: string, getCurrent: () => T): T {
  // Use a function to get the current value at the time the hook is called
  // This avoids stale-closure issues where the value was loaded before the hook ran
  const [v, setV] = useState<T>(getCurrent);
  useEffect(() => {
    // On mount, sync with latest in-memory value (in case bus event fired before mount)
    setV(getCurrent());
    return bus.on(topic, (p) => setV(p as T));
  // getCurrent is intentionally excluded from deps to avoid infinite loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);
  return v;
}

export const useBanners = () => useBusValue<BannerSlide[]>(Topics.Banners, () => cms.banners);
export const useLogo = () => useBusValue<string>(Topics.Logo, () => cms.logoDataUrl);
export const useTextLogo = () => useBusValue<string>(Topics.TextLogo, () => cms.textLogoDataUrl);
export const useFavicon = () => useBusValue<string>(Topics.Favicon, () => cms.faviconDataUrl);
export const useUpiQr = () => useBusValue<string>(Topics.UpiQr, () => cms.upiQrDataUrl);
export const useDepositHtml = () => useBusValue<string>(Topics.DepositHtml, () => cms.depositPageHtml);
export const useWithdrawalHtml = () => useBusValue<string>(Topics.WithdrawalHtml, () => cms.withdrawalPageHtml);
export const useEmailTemplates = () => useBusValue<EmailTemplates>(Topics.EmailTemplates, () => cms.emailTemplates);
export const useCountries = () => useBusValue<Country[]>(Topics.Countries, () => cms.countries);
export const useReferralConfig = () => useBusValue<ReferralConfig>(Topics.ReferralConfig, () => cms.referralConfig);
export const useReferrals = () => useBusValue<Referral[]>(Topics.Referrals, () => cms.referrals);
export const useAffiliates = () => useBusValue<AffiliateApplication[]>(Topics.Affiliates, () => cms.affiliates);
export const useAutoGateways = () => useBusValue<AutoGateway[]>(Topics.AutoGateways, () => cms.autoGateways);
export const useDynamicPages = () => useBusValue<DynamicPage[]>(Topics.DynamicPages, () => cms.dynamicPages);
export const useTickets = () => useBusValue<SupportTicket[]>(Topics.Tickets, () => cms.tickets);

/**
 * useManualMethods — subscribes to payment methods from Supabase via cms.
 * On mount, triggers a fresh fetch so the deposit page always shows latest methods.
 */
export function useManualMethods(): ManualMethod[] {
  const [methods, setMethods] = useState<ManualMethod[]>(() => cms.manualMethods);

  useEffect(() => {
    // Always sync on mount — avoids race where Supabase loaded before component mounted
    setMethods(cms.manualMethods);

    // If still empty after mount, trigger a fresh fetch
    if (cms.manualMethods.length === 0) {
      void cms.syncPaymentMethodsFromSupabase();
    }

    // Listen for future updates (realtime or admin changes)
    return bus.on(Topics.ManualMethods, (p) => setMethods(p as ManualMethod[]));
  }, []);

  return methods;
}

export function useFinance() {
  return useBusValue<{ deposits: DepositRequest[]; withdrawals: WithdrawalRequest[] }>(Topics.Finance, () => ({
    deposits: cms.deposits,
    withdrawals: cms.withdrawals,
  }));
}
export const useSupport = () => useBusValue<SupportMessage[]>(Topics.Support, () => cms.support);
export const useStaff = () => useBusValue<StaffAccount[]>(Topics.Staff, () => cms.staff);
export const useStaffSession = () => useBusValue<string | null>(Topics.StaffSession, () => cms.staffSessionId);

// ── Social links from Supabase settings ────────────────────────────────────────────
type SocialLinkMap = Record<string, { url: string; enabled: boolean }>;

export function useSocialLinks(): SocialLinkMap {
  const [links, setLinks] = useState<SocialLinkMap>({});
  useEffect(() => {
    supabase.rpc('admin_get_settings').then(({ data }) => {
      const rows = (data ?? []) as { key: string; value: unknown }[];
      const row = rows.find(r => r.key === 'social_links');
      if (row?.value) setLinks(row.value as SocialLinkMap);
    });
    const off = bus.on('social_links:updated', (v) => setLinks(v as SocialLinkMap));
    return off;
  }, []);
  return links;
}

// ── Unread agent-message tracking ─────────────────────────────────────────────
const LAST_READ_KEY = 'b4bet.support.lastread.v1';
const CHAT_READ_TOPIC = 'support:chat:read';

export function getLastChatReadTs(): number {
  try { return parseInt(localStorage.getItem(LAST_READ_KEY) ?? '0', 10); } catch { return 0; }
}

export function markChatAsRead(): void {
  const now = Date.now();
  try { localStorage.setItem(LAST_READ_KEY, String(now)); } catch { /* noop */ }
  bus.emit(CHAT_READ_TOPIC, now);
}

export function useHasUnreadAgentMessage(): boolean {
  const accountId = getOrCreateAccountId();
  const tickets = useTickets();
  const [lastRead, setLastRead] = useState(() => getLastChatReadTs());

  useEffect(() => {
    return bus.on(CHAT_READ_TOPIC, (ts) => setLastRead(ts as number));
  }, []);

  const ticket = tickets.find((t) => t.accountId === accountId && t.status !== 'closed') ?? null;
  if (!ticket) return false;
  return ticket.messages.some((m) => m.role === 'agent' && m.ts > lastRead);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}
