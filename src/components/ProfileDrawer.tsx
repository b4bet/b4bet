import { useState } from 'react';
import { X, User, ChevronRight, ShieldCheck, Headphones, Hash, LogIn, UserPlus, FileText, Wallet, Users, TrendingUp, TicketPercent, History, LogOut, ArrowUpCircle } from 'lucide-react';
import { useAuth, useBalance } from '../lib/hooks';
import { useDynamicPages, useHasUnreadAgentMessage } from '../lib/cmsHooks';
import { store } from '../lib/store';
import { getOrCreateAccountId } from '../lib/accountId';
import { auth } from '../lib/auth';
import { setReferralTab } from '../lib/referralTab';
import DynamicPagePopup from './DynamicPagePopup';
import PaymentMethodFlow from './PaymentMethodFlow';
import { RedeemCodeSection } from '../views/ProfileView';
import type { Route } from './BottomNav';
import type { AuthModalMode } from './AuthModal';
import type { DynamicPage } from '../lib/cms';

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
  const [selectedPage, setSelectedPage] = useState<DynamicPage | null>(null);
  const [pagePopupOpen, setPagePopupOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);

  const go = (r: Route) => { onClose(); onNavigate(r); };

  const handleReferral = (tab: 'refer' | 'affiliate') => {
    setReferralTab(tab);
    go('referral');
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-50 bg-midnight-950/60 backdrop-blur-sm" onClick={onClose} />}
      <div className={`fixed top-0 left-0 bottom-0 z-50 w-full max-w-sm bg-slatepanel-900 border-r border-borderline-900 transform transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="flex items-center justify-between p-4 border-b border-borderline-900">
          <h2 className="font-display font-bold text-lg text-white">Menu</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center">
            <X className="w-4 h-4 text-slate-300" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">

          {session ? (
            /* ── Logged-in account card (read-only) ── */
            <div className="panel p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center flex-shrink-0 shadow-neon-glow">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold text-white truncate">{session.username}</div>
                  <span className="inline-flex items-center gap-1 chip mt-1 bg-emeraldwin-500/15 border border-emeraldwin-500/40 text-emeraldwin-400 text-[10px]">
                    <ShieldCheck className="w-3 h-3" /> Verified
                  </span>
                </div>
                {/* Logout — sized to text, aligned to the right of the Username/ID box */}
                <button
                  onClick={() => { onClose(); auth.logout(); onNavigate('home'); }}
                  className="flex-shrink-0 inline-flex items-center gap-1 leading-none rounded-md bg-coral-500/15 border border-coral-500/40 hover:bg-coral-500/25 hover:border-coral-500/70 transition-colors text-coral-400 text-xs font-bold px-1.5 py-1 active:scale-95"
                >
                  <LogOut className="w-3 h-3" /> Logout
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-xl bg-midnight-850 border border-borderline-900 p-3">
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <Hash className="w-3 h-3 text-neon-300" />
                  <span className="tabular tracking-wider font-semibold text-neon-200">ID #{accountId}</span>
                </div>
                <div className="flex items-center justify-end gap-2 text-sm font-semibold text-emeraldwin-400">
                  <Wallet className="w-4 h-4 text-emeraldwin-300" />
                  <span className="tabular">{store.currency}{balance.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ) : (
            /* ── Logged-out card ── */
            <div className="panel p-5 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-slatepanel-800 border border-borderline-900 grid place-items-center">
                <User className="w-8 h-8 text-slate-500" />
              </div>
              <div className="text-center space-y-0.5">
                <p className="font-display font-bold text-white text-sm">Not logged in</p>
                <p className="text-xs text-slate-400">Sign in to access your account</p>
              </div>
              <div className="w-full space-y-2">
                <button
                  onClick={() => { onClose(); onOpenAuthModal?.('login'); }}
                  className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm"
                >
                  <LogIn className="w-4 h-4" /> Login
                </button>
                <button
                  onClick={() => { onClose(); onOpenAuthModal?.('signup'); }}
                  className="w-full py-2.5 rounded-xl bg-slatepanel-800 border border-borderline-900 hover:border-neon-400/60 transition-colors text-white font-bold text-sm flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" /> Sign Up
                </button>
              </div>
            </div>
          )}

          {/* Menu — account options visible when hamburger opens */}
          <div className="panel">
            <button onClick={() => go('profile')} className="w-full flex items-center gap-3 p-4 hover:bg-slatepanel-800 transition-colors rounded-t-2xl">
              <User className="w-5 h-5 text-slate-400" />
              <span className="flex-1 text-left text-sm font-semibold text-white">My Profile</span>
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>

            <button onClick={() => go('history')} className="w-full flex items-center gap-3 p-4 hover:bg-slatepanel-800 transition-colors border-t border-borderline-900">
              <History className="w-5 h-5 text-slate-400" />
              <span className="flex-1 text-left text-sm font-semibold text-white">History</span>
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>

            {session && (
              <button onClick={() => { setWithdrawalOpen(true); }} className="w-full flex items-center gap-3 p-4 hover:bg-slatepanel-800 transition-colors border-t border-borderline-900">
                <ArrowUpCircle className="w-5 h-5 text-coral-400" />
                <span className="flex-1 text-left text-sm font-semibold text-white">Withdrawal</span>
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            )}

            <button onClick={() => setRedeemOpen((s) => !s)} className="w-full flex items-center gap-3 p-4 hover:bg-slatepanel-800 transition-colors border-t border-borderline-900">
              <TicketPercent className="w-5 h-5 text-slate-400" />
              <span className="flex-1 text-left text-sm font-semibold text-white">Redeem Code</span>
              <ChevronRight className={`w-4 h-4 text-slate-600 transition-transform ${redeemOpen ? 'rotate-90' : ''}`} />
            </button>

            {redeemOpen && (
              <div className="p-4 border-t border-borderline-900 bg-midnight-850/50">
                <RedeemCodeSection />
              </div>
            )}

            <button onClick={() => handleReferral('refer')} className="w-full flex items-center gap-3 p-4 hover:bg-slatepanel-800 transition-colors border-t border-borderline-900">
              <Users className="w-5 h-5 text-slate-400" />
              <span className="flex-1 text-left text-sm font-semibold text-white">Refer & Earn</span>
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>

            <button onClick={() => handleReferral('affiliate')} className="w-full flex items-center gap-3 p-4 hover:bg-slatepanel-800 transition-colors border-t border-borderline-900">
              <TrendingUp className="w-5 h-5 text-slate-400" />
              <span className="flex-1 text-left text-sm font-semibold text-white">Affiliate</span>
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>

          </div>

          {/* Dynamic Pages */}
          {dynamicPages.length > 0 && (
            <div className="panel divide-y divide-borderline-900">
              {dynamicPages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => {
                    setSelectedPage(page);
                    setPagePopupOpen(true);
                  }}
                  className="w-full flex items-center gap-3 p-4 hover:bg-slatepanel-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                >
                  <FileText className="w-5 h-5 text-slate-400" />
                  <span className="flex-1 text-left text-sm font-semibold text-white">{page.title}</span>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </button>
              ))}
            </div>
          )}

          <button
            onClick={onOpenSupport}
            className="relative w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-neon-500/20 to-neon-600/20 border border-neon-400/40 hover:border-neon-300 transition-colors"
          >
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center">
              <Headphones className="w-5 h-5 text-white" />
              {hasUnreadChat && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-coral-500 border-2 border-slatepanel-900 animate-pulse" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="font-display font-bold text-sm text-white flex items-center gap-2">
                Support 24/7
              </p>
              <p className="text-[11px] text-slate-400">Chat with our team anytime</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>


        </div>
      </div>




      <DynamicPagePopup page={selectedPage} open={pagePopupOpen} onClose={() => setPagePopupOpen(false)} />
      <PaymentMethodFlow flow="withdrawal" open={withdrawalOpen} onClose={() => setWithdrawalOpen(false)} />
    </>
  );
}
