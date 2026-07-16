import { useEffect, useState } from 'react';
import { bus, Topics } from './bus';
import { cms } from './cms';
import { getOrCreateAccountId } from './accountId';
import type { BannerSlide, DepositRequest, WithdrawalRequest, SupportMessage, StaffAccount, EmailTemplates, Country, ReferralConfig, Referral, AffiliateApplication, AutoGateway, ManualMethod, SupportTicket, DynamicPage } from './cms';


function useBusValue<T>(topic: string, initial: T): T {
  const [v, setV] = useState<T>(initial);
  useEffect(() => bus.on(topic, (p) => setV(p as T)), [topic]);
  return v;
}

export const useBanners = () => useBusValue<BannerSlide[]>(Topics.Banners, cms.banners);
export const useLogo = () => useBusValue<string | null>(Topics.Logo, cms.logoDataUrl);
export const useTextLogo = () => useBusValue<string | null>(Topics.TextLogo, cms.textLogoDataUrl);
export const useFavicon = () => useBusValue<string | null>(Topics.Favicon, cms.faviconDataUrl);
export const useUpiQr = () => useBusValue<string>(Topics.UpiQr, cms.upiQrDataUrl);
export const useDepositHtml = () => useBusValue<string>(Topics.DepositHtml, cms.depositPageHtml);
export const useWithdrawalHtml = () => useBusValue<string>(Topics.WithdrawalHtml, cms.withdrawalPageHtml);
export const useEmailTemplates = () => useBusValue<EmailTemplates>(Topics.EmailTemplates, cms.emailTemplates);
export const useCountries = () => useBusValue<Country[]>(Topics.Countries, cms.countries);
export const useReferralConfig = () => useBusValue<ReferralConfig>(Topics.ReferralConfig, cms.referralConfig);
export const useReferrals = () => useBusValue<Referral[]>(Topics.Referrals, cms.referrals);
export const useAffiliates = () => useBusValue<AffiliateApplication[]>(Topics.Affiliates, cms.affiliates);
export const useAutoGateways = () => useBusValue<AutoGateway[]>(Topics.AutoGateways, cms.autoGateways);
export const useManualMethods = () => useBusValue<ManualMethod[]>(Topics.ManualMethods, cms.manualMethods);
export const useDynamicPages = () => useBusValue<DynamicPage[]>(Topics.DynamicPages, cms.dynamicPages);
export const useTickets = () => useBusValue<SupportTicket[]>(Topics.Tickets, cms.tickets);


export function useFinance() {
  return useBusValue<{ deposits: DepositRequest[]; withdrawals: WithdrawalRequest[] }>(Topics.Finance, {
    deposits: cms.deposits,
    withdrawals: cms.withdrawals,
  });
}
export const useSupport = () => useBusValue<SupportMessage[]>(Topics.Support, cms.support);
export const useStaff = () => useBusValue<StaffAccount[]>(Topics.Staff, cms.staff);
export const useStaffSession = () => useBusValue<string | null>(Topics.StaffSession, cms.staffSessionId);

// ── Unread agent-message tracking ─────────────────────────────────────────────
const LAST_READ_KEY = 'b4bet.support.lastread.v1';
const CHAT_READ_TOPIC = 'support:chat:read';

/** Returns the timestamp when the user last viewed the support chat. */
export function getLastChatReadTs(): number {
  try { return parseInt(localStorage.getItem(LAST_READ_KEY) ?? '0', 10); } catch { return 0; }
}

/** Call this when the user opens SupportChat so the red-dot clears. */
export function markChatAsRead(): void {
  const now = Date.now();
  try { localStorage.setItem(LAST_READ_KEY, String(now)); } catch { /* noop */ }
  bus.emit(CHAT_READ_TOPIC, now);
}

/**
 * Returns true when the user's active ticket has at least one agent reply
 * that arrived after the user last opened the chat.
 */
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

/** File -> data URL helper for image uploads. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}
