import { useState, useEffect } from 'react';
import { Gift, History, RefreshCw } from 'lucide-react';
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
            onChange={(e) => cms.updateReferralConfig({ rewardAmount: Number(e.target.value) || 0 })}
            className="input tabular w-full mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Minimum Deposit Required (₹)</label>
          <input
            type="number"
            value={cfg.minDeposit}
            onChange={(e) => cms.updateReferralConfig({ minDeposit: Number(e.target.value) || 0 })}
            className="input tabular w-full mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Tier Threshold (referrals)</label>
          <input
            type="number"
            value={cfg.tierThreshold}
            onChange={(e) => cms.updateReferralConfig({ tierThreshold: Number(e.target.value) || 0 })}
            className="input tabular w-full mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Tier Commission (%)</label>
          <input
            type="number"
            value={cfg.tierPercent}
            onChange={(e) => cms.updateReferralConfig({ tierPercent: Number(e.target.value) || 0 })}
            className="input tabular w-full mt-1"
          />
        </div>
      </div>
      <p className="text-xs text-slate-500">Reward credits instantly when the referred user's first approved deposit reaches the minimum.</p>
    </div>
  );
}

// ---- Live referral history from Supabase referrals table (admin) ----
interface AdminReferral {
  id: string;
  referrer_id: string;
  referred_id: string;
  bonus_amount: number;
  status: string;
  created_at: string;
  referrer_username?: string;
  referred_username?: string;
  referrer_account_id?: string; // 6-digit
  referred_account_id?: string; // 6-digit
}

function ReferralHistoryAdmin() {
  const allRefs = useReferrals(); // in-memory (recorded during this session)
  const [liveRefs, setLiveRefs] = useState<AdminReferral[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchReferrals = () => {
    setLoading(true);
    // Use SECURITY DEFINER RPC — bypasses RLS so admin can see all referrals
    supabase
      .rpc('admin_get_referrals', { p_limit: 500 })
      .then(({ data, error }) => {
        if (error) {
          console.error('[MarketingTab] admin_get_referrals error:', error);
        }
        if (data) {
          setLiveRefs(
            (data as AdminReferral[]).map((r) => ({
              id: r.id,
              referrer_id: String(r.referrer_id),
              referred_id: String(r.referred_id),
              bonus_amount: Number(r.bonus_amount),
              status: r.status,
              created_at: r.created_at,
              referrer_username: r.referrer_username ?? undefined,
              referred_username: r.referred_username ?? undefined,
              referrer_account_id: r.referrer_account_id ?? undefined,
              referred_account_id: r.referred_account_id ?? undefined,
            })),
          );
        }
        setLoading(false);
      });
  };

  useEffect(() => { fetchReferrals(); }, []);

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
      referrer_account_id: undefined as string | undefined,
      referred_account_id: undefined as string | undefined,
    })),
  ].filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);

  const filtered = search.trim()
    ? combined.filter(
        (r) =>
          r.referrer_id.includes(search) ||
          (r.referrer_account_id || '').includes(search) ||
          (r.referred_account_id || '').includes(search) ||
          (r.referrer_username || '').toLowerCase().includes(search.toLowerCase()) ||
          (r.referred_username || '').toLowerCase().includes(search.toLowerCase()),
      )
    : combined;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username or 6-digit ID..."
          className="input text-sm flex-1"
        />
        <button
          onClick={fetchReferrals}
          disabled={loading}
          className="w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/40 transition-colors flex-shrink-0 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="text-xs text-slate-500 px-1">
        {filtered.length} referral{filtered.length !== 1 ? 's' : ''} found
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead>
            <tr className="border-b border-borderline-900 text-slate-500">
              <th className="text-left px-3 py-2.5">Referrer</th>
              <th className="text-left px-3 py-2.5">Referrer ID</th>
              <th className="text-left px-3 py-2.5">Referred User</th>
              <th className="text-left px-3 py-2.5">Referred ID</th>
              <th className="text-left px-3 py-2.5">Date</th>
              <th className="text-left px-3 py-2.5">Status</th>
              <th className="text-left px-3 py-2.5">Reward</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-500">Loading from Supabase…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-500">No referral history found</td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-borderline-900 hover:bg-slatepanel-800">
                  {/* Referrer username */}
                  <td className="px-3 py-2.5 text-white font-medium">
                    {r.referrer_username || <span className="text-slate-500 italic">Unknown</span>}
                  </td>
                  {/* Referrer 6-digit account ID */}
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-neon-300 text-[11px] bg-neon-400/10 px-1.5 py-0.5 rounded">
                      {r.referrer_account_id || r.referrer_id.slice(0, 8)}
                    </span>
                  </td>
                  {/* Referred username */}
                  <td className="px-3 py-2.5 text-slate-300">
                    {r.referred_username || <span className="text-slate-500 italic">Unknown</span>}
                  </td>
                  {/* Referred 6-digit account ID */}
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-amberx-300 text-[11px] bg-amberx-400/10 px-1.5 py-0.5 rounded">
                      {r.referred_account_id || r.referred_id.slice(0, 8)}
                    </span>
                  </td>
                  {/* Date */}
                  <td className="px-3 py-2.5 text-slate-500">
                    {new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                  {/* Status */}
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
                  {/* Reward */}
                  <td className="px-3 py-2.5 text-emeraldwin-400 font-medium">
                    {r.bonus_amount > 0 ? `₹${r.bonus_amount}` : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
