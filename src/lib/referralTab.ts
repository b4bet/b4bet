/** Temporary UI state for which Referral tab to open. */
let pendingTab: 'refer' | 'affiliate' | null = null;

export function setReferralTab(tab: 'refer' | 'affiliate') {
  pendingTab = tab;
}

export function getReferralTab(): 'refer' | 'affiliate' | null {
  const t = pendingTab;
  pendingTab = null;
  return t;
}
