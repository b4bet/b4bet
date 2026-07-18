import { useState } from 'react';
import { X, User, ChevronRight, ShieldCheck, Headphones, Hash, LogIn, UserPlus, FileText, Wallet, Users, TrendingUp, TicketPercent, History, LogOut, ArrowUpCircle } from 'lucide-react';
import { useAuth, useBalance } from '../lib/hooks';
import { useDynamicPages, useHasUnreadAgentMessage, useSocialLinks } from '../lib/cmsHooks';
import { store } from '../lib/store';
import { getOrCreateAccountId } from '../lib/accountId';
import { auth } from '../lib/auth';
import DynamicPagePopup from './DynamicPagePopup';
import PaymentMethodFlow from './PaymentMethodFlow';
import { RedeemCodeSection } from '../views/ProfileView';
import type { Route } from './BottomNav';
import type { AuthModalMode } from './AuthModal';
import type { DynamicPage } from '../lib/cms';

// Social brand icons as SVGs (inline, no external dep)
const SOCIAL_ICONS: Record<string, { svg: string; bg: string; label: string }> = {
  instagram: {
    label: 'Instagram',
    bg: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',
    svg: '<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>',
  },
  twitter: {
    label: 'X (Twitter)',
    bg: '#000000',
    svg: '<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  },
  telegram: {
    label: 'Telegram',
    bg: '#229ED9',
    svg: '<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
  },
  pinterest: {
    label: 'Pinterest',
    bg: '#E60023',
    svg: '<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>',
  },
  youtube: {
    label: 'YouTube',
    bg: '#FF0000',
    svg: '<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
  },
  whatsapp: {
    label: 'WhatsApp',
    bg: '#25D366',
    svg: '<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>',
  },
};

interface SocialLink { url: string; enabled: boolean; }
type SocialLinks = Record<string, SocialLink>;

function SocialIconsRow({ links }: { links: SocialLinks }) {
  const active = Object.entries(links).filter(([, v]) => v.enabled && v.url);
  if (active.length === 0) return null;
  return (
    <div className="px-3 pb-3 pt-1">
      <div className="flex flex-wrap gap-2">
        {active.map(([key, val]) => {
          const icon = SOCIAL_ICONS[key];
          if (!icon) return null;
          return (
            <a key={key} href={val.url} target="_blank" rel="noopener noreferrer"
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:scale-110 transition-transform"
              style={{ background: icon.bg }}
              title={icon.label}
              dangerouslySetInnerHTML={{ __html: `<span style="width:18px;height:18px;display:block">${icon.svg}</span>` }}
            />
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (r: Route) => void;
  onOpenSupport: () => void;
  onOpenAuthModal?: (mode: AuthModalMode) => void;
}

export default function ProfileDrawer({ open, onClose, onNavigate, onOpenSupport, onOpenAuthModal }: Props) {
  const session = useAuth();
  const balance = useBalance();
  const accountId = session ? session.accountId : getOrCreateAccountId();
  const dynamicPages = useDynamicPages();
  const hasUnreadChat = useHasUnreadAgentMessage();
  const socialLinks = useSocialLinks();
  const [selectedPage, setSelectedPage] = useState<DynamicPage | null>(null);
  const [pagePopupOpen, setPagePopupOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);

  const go = (r: Route) => { onClose(); onNavigate(r); };

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />}
      <div className={`fixed right-0 top-0 bottom-0 w-80 max-w-[92vw] bg-slatepanel-900 border-l border-borderline-900 z-50 flex flex-col transition-transform duration-300 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* ── FIXED TOP: Header + Profile card ── */}
        <div className="shrink-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-borderline-900">
            <span className="font-bold text-white text-sm">Menu</span>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60 transition-colors">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Profile card — always visible at top */}
          {session ? (
            <div className="mx-3 mt-3 mb-2 rounded-2xl bg-slatepanel-800 border border-borderline-900 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center shrink-0">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-sm truncate">{session.username}</span>
                    <span className="text-[10px] bg-emeraldwin-500/15 text-emeraldwin-400 border border-emeraldwin-500/40 px-1.5 py-0.5 rounded-full">Verified</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-slate-500 text-xs"><Hash className="w-3 h-3 inline" /> {accountId}</span>
                    <span className="text-emeraldwin-400 text-xs font-bold">{store.currency}{balance.toFixed(2)}</span>
                  </div>
                </div>
                <button onClick={() => { onClose(); auth.logout(); onNavigate('home'); }}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md bg-coral-500/15 border border-coral-500/40 hover:bg-coral-500/25 transition-colors text-coral-400 text-xs font-bold px-1.5 py-1">
                  <LogOut className="w-3 h-3" /> Logout
                </button>
              </div>
            </div>
          ) : (
            <div className="mx-3 mt-3 mb-2 rounded-2xl bg-slatepanel-800 border border-borderline-900 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slatepanel-700 grid place-items-center shrink-0">
                  <User className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">Not logged in</p>
                  <p className="text-slate-500 text-xs">Sign in to access your account</p>
                </div>
              </div>
              <button onClick={() => { onClose(); onOpenAuthModal?.('login'); }}
                className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm">
                <LogIn className="w-4 h-4" /> Login
              </button>
              <button onClick={() => { onClose(); onOpenAuthModal?.('signup'); }}
                className="w-full py-2.5 rounded-xl bg-slatepanel-700 border border-borderline-900 hover:border-neon-400/60 transition-colors text-white font-bold text-sm flex items-center justify-center gap-2">
                <UserPlus className="w-4 h-4" /> Sign Up
              </button>
            </div>
          )}
        </div>

        {/* ── SCROLLABLE MIDDLE: Menu items ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="rounded-2xl mx-3 mb-2 bg-slatepanel-800 border border-borderline-900 overflow-hidden">
            {session && (
              <>
                <button onClick={() => go('profile')} className="w-full flex items-center gap-3 p-4 hover:bg-slatepanel-700 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-neon-500/20 grid place-items-center"><User className="w-4 h-4 text-neon-400" /></div>
                  <span className="text-white text-sm font-medium">My Profile</span>
                  <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
                </button>
                <div className="border-t border-borderline-900" />
                <button onClick={() => go('history')} className="w-full flex items-center gap-3 p-4 hover:bg-slatepanel-700 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-slatepanel-700 grid place-items-center"><History className="w-4 h-4 text-slate-400" /></div>
                  <span className="text-white text-sm font-medium">History</span>
                  <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
                </button>
                <div className="border-t border-borderline-900" />
                <button onClick={() => { setWithdrawalOpen(true); }} className="w-full flex items-center gap-3 p-4 hover:bg-slatepanel-700 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-slatepanel-700 grid place-items-center"><Wallet className="w-4 h-4 text-slate-400" /></div>
                  <span className="text-white text-sm font-medium">Withdrawal</span>
                  <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
                </button>
                <div className="border-t border-borderline-900" />
                <button onClick={() => setRedeemOpen(s => !s)} className="w-full flex items-center gap-3 p-4 hover:bg-slatepanel-700 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-slatepanel-700 grid place-items-center"><TicketPercent className="w-4 h-4 text-slate-400" /></div>
                  <span className="text-white text-sm font-medium">Redeem Code</span>
                  <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
                </button>
                {redeemOpen && (
                  <div className="px-4 pb-3">
                    <RedeemCodeSection />
                  </div>
                )}
                <div className="border-t border-borderline-900" />
                <button onClick={() => go('referral')} className="w-full flex items-center gap-3 p-4 hover:bg-slatepanel-700 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-slatepanel-700 grid place-items-center"><Users className="w-4 h-4 text-slate-400" /></div>
                  <span className="text-white text-sm font-medium">Refer &amp; Earn</span>
                  <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
                </button>
                <div className="border-t border-borderline-900" />
              </>
            )}

            {/* Affiliate — always visible (guest + logged in) */}
            <button onClick={() => go('affiliate')} className="w-full flex items-center gap-3 p-4 hover:bg-slatepanel-700 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 grid place-items-center"><TrendingUp className="w-4 h-4 text-purple-400" /></div>
              <span className="text-white text-sm font-medium">Affiliate</span>
              <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
            </button>

            {/* Dynamic Pages — always visible */}
            {dynamicPages.map((page, idx) => (
              <div key={page.id}>
                <div className="border-t border-borderline-900" />
                <button onClick={() => { setSelectedPage(page); setPagePopupOpen(true); }}
                  className="w-full flex items-center gap-3 p-4 hover:bg-slatepanel-700 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-slatepanel-700 grid place-items-center"><FileText className="w-4 h-4 text-slate-400" /></div>
                  <span className="text-white text-sm font-medium">{page.title}</span>
                  <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── FIXED BOTTOM: Social icons + Support 24/7 ── */}
        <div className="shrink-0 border-t border-borderline-900">
          {/* Social icons row */}
          <SocialIconsRow links={socialLinks} />

          {/* Support 24/7 */}
          <button onClick={() => { onClose(); onOpenSupport(); }}
            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-slatepanel-800 transition-colors">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-500 to-neon-700 grid place-items-center">
                <Headphones className="w-5 h-5 text-white" />
              </div>
              {hasUnreadChat && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-coral-500 rounded-full border-2 border-slatepanel-900" />
              )}
            </div>
            <div className="text-left">
              <p className="text-white font-bold text-sm">Support 24/7</p>
              <p className="text-slate-500 text-xs">Chat with our team anytime</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
          </button>
        </div>
      </div>

      <DynamicPagePopup page={selectedPage} open={pagePopupOpen} onClose={() => setPagePopupOpen(false)} />
      <PaymentMethodFlow mode="withdrawal" open={withdrawalOpen} onClose={() => setWithdrawalOpen(false)} />
    </>
  );
}
