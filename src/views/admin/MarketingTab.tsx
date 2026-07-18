import { useState } from 'react';
import { Gift, History } from 'lucide-react';
import { cms } from '../../lib/cms';
import { useReferralConfig, useReferrals } from '../../lib/cmsHooks';
import { supabase } from '../../integrations/supabase/client';

export default function MarketingTab() {
  const [sub, setSub] = useState<'refer' | 'refHistory'>('refer');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-neon-500/20 grid place-items-center">
          <Gift className="w-5 h-5 text-neon-400" />
        </div>
        <div>
          <h2 className="font-bold text-white">Marketing Controls</h2>
          <p className="text-slate-500 text-xs">Configure referral rewards. Affiliate management is in the Affiliates tab.</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-borderline-900 pb-0">
        <SubBtn active={sub === 'refer'} onClick={() => setSub('refer')} icon={Gift} label="Refer & Earn Config" />
        <SubBtn active={sub === 'refHistory'} onClick={() => setSub('refHistory')} icon={History} label="Referral History" />
      </div>

      {sub === 'refer' && <ReferConfig />}
      {sub === 'refHistory' && <ReferralHistoryAdmin />}
    </div>
  );
}

function SubBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Gift; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition border-b-2 ${active ? 'text-neon-300 border-neon-400' : 'text-slate-500 hover:text-white border-transparent'}`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

function ReferConfig() {
  const cfg = useReferralConfig();
  return (
    <div className="panel p-4 space-y-4 max-w-lg">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Config is persisted to Supabase settings on every change.</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-400">Referral Reward Amount (₹)</label>
          <input
            type="number"
            value={cfg.rewardAmount}
            onChange={(e) => cms.setReferralConfig({ rewardAmount: Number(e.target.value) || 0 })}
            className="input tabular w-full mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Minimum Deposit Required (₹)</label>
          <input
            type="number"
            value={cfg.minDeposit}
            onChange={(e) => cms.setReferralConfig({ minDeposit: Number(e.target.value) || 0 })}
            className="input tabular w-full mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Tier Threshold (referrals)</label>
          <input
            type="number"
            value={cfg.tierThreshold}
            onChange={(e) => cms.setReferralConfig({ tierThreshold: Number(e.target.value) || 0 })}
            className="input tabular w-full mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Tier Commission (%)</label>
          <input
            type="number"
            value={cfg.tierPercent}
            onChange={(e) => cms.setReferralConfig({ tierPercent: Number(e.target.value) || 0 })}
            className="input tabular w-full mt-1"
          />
        </div>
      </div>
      <p className="text-xs text-slate-500">Reward credits instantly when the referred user's first approved deposit reaches the minimum.</p>
    </div>
  );
}

// ---- Live referral history from Supabase referrals table ----
interface SupabaseReferral {
  id: string;
  referrer_id: string;
  referred_id: string;
  bonus_amount: number;
  status: string;
  created_at: string;
  referrer_username?: string;
  referred_username?: string;
}

function ReferralHistoryAdmin() {
  const allRefs = useReferrals(); // in-memory (recorded during this session)
  const [liveRefs, setLiveRefs] = useState<SupabaseReferral[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');

  if (!loaded) {
    setLoaded(true);
    // Load live referrals from Supabase with profile join
    supabase
      .from('referrals')
      .select('id, referrer_id, referred_id, bonus_amount, status, created_at, referrer:profiles!referrals_referrer_id_fkey(username), referred:profiles!referrals_referred_id_fkey(username)')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (data) {
          setLiveRefs((data as unknown as Array<Record<string, unknown>>).map((r) => ({
            id: r.id as string,
            referrer_id: r.referrer_id as string,
            referred_id: r.referred_id as string,
            bonus_amount: Number(r.bonus_amount),
            status: r.status as string,
            created_at: r.created_at as string,
            referrer_username: (r.referrer as { username?: string } | null)?.username,
            referred_username: (r.referred as { username?: string } | null)?.username,
          })));
        }
      });
  }

  // Merge in-memory and live, deduplicate by id
  const combined = [
    ...liveRefs,
    ...allRefs.map((r) => ({
      id: r.id,
      referrer_id: r.referrerId,
      referred_id: r.referredUserId,
      bonus_amount: r.rewardAmount,
      status: r.rewardCredited ? 'credited' : 'pending',
      created_at: new Date(r.createdAt).toISOString(),
      referrer_username: undefined as string | undefined,
      referred_username: r.referredUsername,
    })),
  ].filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);

  const filtered = search.trim()
    ? combined.filter(
        (r) =>
          r.referrer_id.includes(search) ||
          (r.referrer_username || '').toLowerCase().includes(search.toLowerCase()) ||
          (r.referred_username || '').toLowerCase().includes(search.toLowerCase()),
      )
    : combined;

  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by Referrer ID or Username..."
        className="input text-sm"
      />
      <div className="panel overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-borderline-900 text-slate-500">
              <th className="text-left px-3 py-2.5">Referrer</th>
              <th className="text-left px-3 py-2.5">Referred User</th>
              <th className="text-left px-3 py-2.5">Date</th>
              <th className="text-left px-3 py-2.5">Status</th>
              <th className="text-left px-3 py-2.5">Reward</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-500">No referral history found</td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-borderline-900 hover:bg-slatepanel-800">
                  <td className="px-3 py-2.5 text-slate-300">{r.referrer_username || r.referrer_id.slice(0, 8)}</td>
                  <td className="px-3 py-2.5">{r.referred_username || r.referred_id.slice(0, 8)}</td>
                  <td className="px-3 py-2.5 text-slate-500">
                    {new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`chip ${
                        r.status === 'credited'
                          ? 'bg-emeraldwin-500/15 text-emeraldwin-400'
                          : 'bg-slatepanel-700 text-slate-400'
                      }`}
                    >
                      {r.status === 'credited' ? 'Rewarded' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{r.bonus_amount > 0 ? `₹${r.bonus_amount}` : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
