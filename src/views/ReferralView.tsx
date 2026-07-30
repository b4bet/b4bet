import { useMemo, useState, useEffect } from 'react';
import { X, Copy, Check, Users, TrendingUp, UserPlus } from 'lucide-react';
import type { Route } from '../components/BottomNav';
import { cms } from '../lib/cms';
import { useAffiliates, useReferralConfig, useReferrals } from '../lib/cmsHooks';
import { useAuth } from '../lib/hooks';
import { store } from '../lib/store';
import type { AuthSession } from '../lib/auth';

export default function ReferralView({ onNavigate, onOpenMenu }: { onNavigate: (r: Route) => void; onOpenMenu?: () => void }) {
  const session = useAuth();
  const cfg = useReferralConfig();
  const affiliates = useAffiliates();
  const myApp = useMemo(() => (session ? affiliates.find((a) => a.userId === session.userId) ?? null : null), [affiliates, session]);

  // Mobile back button support — go back to menu (ProfileDrawer)
  useEffect(() => {
    window.history.pushState({ referralView: true }, '');
    const handlePopstate = () => {
      onNavigate('home');
      // Re-open the menu/drawer after navigating home
      onOpenMenu?.();
    };
    window.addEventListener('popstate', handlePopstate);
    return () => { window.removeEventListener('popstate', handlePopstate); };
  }, [onNavigate, onOpenMenu]);

  return (
    <div className="space-y-4 animate-fade-in px-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display font-extrabold text-xl text-white">Refer &amp; Earn</h1>
          <p className="text-xs text-slate-500">Invite friends and earn rewards</p>
        </div>
        <button onClick={() => { onNavigate('home'); onOpenMenu?.(); }} className="md:hidden w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center">
          <X className="w-5 h-5 text-slate-300" />
        </button>
      </div>

      <ReferAndEarn userId={session?.userId} accountId={session?.accountId} cfg={cfg} />
    </div>
  );
}

function ReferAndEarn({ userId, accountId, cfg }: { userId: string | undefined; accountId: string | undefined; cfg: { rewardAmount: number; minDeposit: number; tierPercent: number; tierThreshold: number } }) {
  const allReferrals = useReferrals();
  const referrals = useMemo(() => (userId ? allReferrals.filter((r) => r.referrerId === userId) : []), [allReferrals, userId]);
  // Use 6-digit accountId as the referral code in the link (short & clean)
  const link = accountId ? `${window.location.origin}/register?ref=${accountId}` : '';
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); } catch { /* noop */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const totalEarned = referrals.filter((r) => r.rewardCredited).reduce((s, r) => s + r.rewardAmount, 0);

  if (!userId) {
    return (
      <div className="panel p-6 text-center space-y-3">
        <Users className="w-10 h-10 text-slate-500 mx-auto" />
        <h3 className="font-display font-bold text-white">Login to refer friends</h3>
        <p className="text-xs text-slate-400">Sign in to get your unique referral link and track your rewards.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="panel p-4">
        <h3 className="font-display font-bold text-white text-sm mb-2">Your unique referral link</h3>
        <div className="flex items-center gap-2">
          <input readOnly value={link} className="input flex-1 text-xs font-mono" />
          <button onClick={copy} className="btn-primary px-3 py-2">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Reward / Referral" value={`${store.currency}${cfg.rewardAmount}`} accent="text-emeraldwin-400" />
        <Metric label="Min. Deposit" value={`${store.currency}${cfg.minDeposit}`} accent="text-neon-300" />
        <Metric label="Tier Threshold" value={`${cfg.tierThreshold}`} accent="text-amberx-400" />
        <Metric label="Tier Commission" value={`${cfg.tierPercent}%`} accent="text-coral-400" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="panel p-3 text-center">
          <p className="text-[11px] text-slate-400 mb-1">Total Referrals</p>
          <p className="font-display font-extrabold text-lg text-white">{referrals.length}</p>
        </div>
        <div className="panel p-3 text-center">
          <p className="text-[11px] text-slate-400 mb-1">Total Earned</p>
          <p className="font-display font-extrabold text-lg text-emeraldwin-400">{store.currency}{totalEarned.toFixed(2)}</p>
        </div>
      </div>

      <div className="panel p-4 space-y-3">
        <h3 className="font-display font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-neon-300" /> Referral History</h3>
        {referrals.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">No referrals yet</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {referrals.map((r, i) => (
              <ReferralRow key={i} refData={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="panel p-3 text-center">
      <p className="text-[11px] text-slate-400 mb-1">{label}</p>
      <p className={`font-display font-extrabold text-lg ${accent}`}>{value}</p>
    </div>
  );
}

function ReferralRow({ refData }: { refData: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const rewardCredited = !!refData.rewardCredited;
  const firstDepositApproved = !!refData.firstDepositApproved;
  const statusColor = rewardCredited ? 'text-emeraldwin-400' : firstDepositApproved ? 'text-amberx-400' : 'text-slate-400';
  const statusText = rewardCredited ? 'Rewarded' : firstDepositApproved ? 'Pending' : 'Awaiting deposit';
  const referredName = refData.referredName as string | undefined;
  const referredId = refData.referredId as string | undefined;
  const rewardAmount = refData.rewardAmount as number | undefined;
  const timestamp = refData.timestamp as number | undefined;

  return (
    <>
      <div onClick={() => setOpen(true)} className="flex items-center justify-between bg-slatepanel-800 rounded-lg p-3 cursor-pointer hover:bg-slatepanel-700 transition-colors border border-borderline-800">
        <div className="flex items-center gap-2 min-w-0">
          <UserPlus className="w-4 h-4 text-neon-300 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-white truncate">{referredName || referredId}</p>
            <p className="text-[10px] text-slate-500">ID: {referredId}</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-xs font-bold ${statusColor}`}>{statusText}</p>
          {rewardCredited && <p className="text-[10px] text-emeraldwin-300">+{store.currency}{rewardAmount}</p>}
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="bg-slatepanel-900 border border-borderline-900 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-white">Referral Details</h3>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-slatepanel-800"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <DetailRow label="Referred User" value={referredName || referredId || '—'} />
              <DetailRow label="User ID" value={referredId || '—'} />
              <DetailRow label="Date" value={timestamp ? new Date(timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
              <DetailRow label="Status" value={statusText} />
              <DetailRow label="First Deposit" value={firstDepositApproved ? 'Approved' : 'Pending'} />
              <DetailRow label="Reward Amount" value={rewardCredited ? `${store.currency}${rewardAmount}` : 'Pending'} />
            </div>
            <button onClick={() => setOpen(false)} className="btn-primary w-full py-2 mt-4">Close</button>
          </div>
        </div>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className="text-white font-semibold text-xs">{value}</span>
    </div>
  );
}
