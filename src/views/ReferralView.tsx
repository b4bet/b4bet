import { useMemo, useState } from 'react';
import { X, Copy, Check, Users, TrendingUp, Clock, UserPlus } from 'lucide-react';
import type { Route } from '../components/BottomNav';
import { cms } from '../lib/cms';
import { useAffiliates, useReferralConfig, useReferrals } from '../lib/cmsHooks';
import { useAuth } from '../lib/hooks';
import { store } from '../lib/store';
import { getReferralTab } from '../lib/referralTab';
import type { AuthSession } from '../lib/auth';

export default function ReferralView({ onNavigate, onOpenMenu }: { onNavigate: (r: Route) => void; onOpenMenu?: () => void }) {
  const session = useAuth();
  const cfg = useReferralConfig();
  const affiliates = useAffiliates();
  const myApp = useMemo(() => (session ? affiliates.find((a) => a.userId === session.userId) ?? null : null), [affiliates, session]);

  const initialTab = getReferralTab() || 'refer';
  const isAffiliate = initialTab === 'affiliate';

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display font-extrabold text-xl text-white">{isAffiliate ? 'Affiliate' : 'Refer & Earn'}</h1>
          <p className="text-xs text-slate-500">{isAffiliate ? 'Earn from traffic partners' : 'Invite friends and earn rewards'}</p>
        </div>
        <button onClick={() => onNavigate('home')} className="md:hidden w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center">
          <X className="w-5 h-5 text-slate-300" />
        </button>
      </div>

      {isAffiliate ? <AffiliatePanel session={session} app={myApp} /> : <ReferAndEarn userId={session?.userId} cfg={cfg} />}
    </div>
  );
}

function ReferAndEarn({ userId, cfg }: { userId: string | undefined; cfg: { rewardAmount: number; minDeposit: number; tierPercent: number; tierThreshold: number } }) {
  const allReferrals = useReferrals();
  const referrals = useMemo(() => (userId ? allReferrals.filter((r) => r.referrerId === userId) : []), [allReferrals, userId]);
  const link = userId ? `${window.location.origin}/register?ref=${userId}` : '';
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); } catch { /* noop */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const totalEarned = referrals.filter((r) => r.rewardCredited).reduce((s, r) => s + r.rewardAmount, 0);
  const pending = referrals.filter((r) => r.firstDepositApproved && !r.rewardCredited).length;

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

      {/* Referral History */}
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

function AffiliatePanel({ session, app }: { session: AuthSession | null; app: ReturnType<typeof useAffiliates>[number] | null }) {
  const [submitted, setSubmitted] = useState(false);
  const [website, setWebsite] = useState('');
  const [traffic, setTraffic] = useState('');

  if (!session) {
    return (
      <div className="panel p-6 text-center space-y-3">
        <Users className="w-10 h-10 text-slate-500 mx-auto" />
        <h3 className="font-display font-bold text-white">Login to apply</h3>
        <p className="text-xs text-slate-400">Sign in to apply for the affiliate program.</p>
      </div>
    );
  }

  const apply = () => {
    if (!website || !traffic) return;
    cms.submitAffiliateApplication({
      userId: session.userId,
      username: session.username,
      email: session.email,
      telegram: '',
      trafficSource: traffic,
      estimatedTraffic: '',
    });
    setSubmitted(true);
  };

  if (app) {
    return (
      <div className="panel p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-display font-bold text-white">Affiliate Application</p>
            <p className={`text-xs ${app.status === 'approved' ? 'text-emeraldwin-400' : 'text-neon-300'}`}>Status: {app.status}</p>
          </div>
        </div>
        <p className="text-xs text-slate-400">Traffic: {app.trafficSource}</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="panel p-5 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-emeraldwin-500/15 border border-emeraldwin-500/40 grid place-items-center mx-auto">
          <Check className="w-7 h-7 text-emeraldwin-400" />
        </div>
        <h3 className="font-display font-bold text-white">Application Submitted</h3>
        <p className="text-xs text-slate-400">Our team will review and approve your affiliate request.</p>
      </div>
    );
  }

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center">
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <p className="font-display font-bold text-white">Become Affiliate</p>
      </div>
      <p className="text-xs text-slate-400">Apply to promote B4BeT and earn commissions on qualified players.</p>
      <input className="input" placeholder="Website / Traffic source URL" value={website} onChange={(e) => setWebsite(e.target.value)} />
      <input className="input" placeholder="How do you drive traffic?" value={traffic} onChange={(e) => setTraffic(e.target.value)} />
      <button onClick={apply} className="btn-primary w-full py-2">Apply</button>
    </div>
  );
}

function ReferralRow({ refData }: { refData: any }) {
  const [open, setOpen] = useState(false);
  const statusColor = refData.rewardCredited ? 'text-emeraldwin-400' : refData.firstDepositApproved ? 'text-amberx-400' : 'text-slate-400';
  const statusText = refData.rewardCredited ? 'Rewarded' : refData.firstDepositApproved ? 'Pending' : 'Awaiting deposit';

  return (
    <>
      <div onClick={() => setOpen(true)} className="flex items-center justify-between bg-slatepanel-800 rounded-lg p-3 cursor-pointer hover:bg-slatepanel-700 transition-colors border border-borderline-800">
        <div className="flex items-center gap-2 min-w-0">
          <UserPlus className="w-4 h-4 text-neon-300 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-white truncate">{refData.referredName || refData.referredId}</p>
            <p className="text-[10px] text-slate-500">ID: {refData.referredId}</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-xs font-bold ${statusColor}`}>{statusText}</p>
          {refData.rewardCredited && <p className="text-[10px] text-emeraldwin-300">+{store.currency}{refData.rewardAmount}</p>}
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
              <DetailRow label="Referred User" value={refData.referredName || refData.referredId} />
              <DetailRow label="User ID" value={refData.referredId} />
              <DetailRow label="Date" value={new Date(refData.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
              <DetailRow label="Status" value={statusText} />
              <DetailRow label="First Deposit" value={refData.firstDepositApproved ? 'Approved' : 'Pending'} />
              <DetailRow label="Reward Amount" value={refData.rewardCredited ? `${store.currency}${refData.rewardAmount}` : 'Pending'} />
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
