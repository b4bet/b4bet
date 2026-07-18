import { useState } from 'react';
import { Gift, History, Users2 } from 'lucide-react';
import { cms } from '../../lib/cms';
import { useReferralConfig, useReferrals } from '../../lib/cmsHooks';

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
    <button onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition border-b-2 ${
        active ? 'text-neon-300 border-neon-400' : 'text-slate-500 hover:text-white border-transparent'
      }`}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

function ReferConfig() {
  const cfg = useReferralConfig();
  return (
    <div className="panel p-4 space-y-4 max-w-lg">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-400">Referral Reward Amount (₹)</label>
          <input type="number" value={cfg.rewardAmount} onChange={e => cms.setReferralConfig({ rewardAmount: Number(e.target.value) || 0 })}
            className="input tabular w-full mt-1" />
        </div>
        <div>
          <label className="text-xs text-slate-400">Minimum Deposit Required (₹)</label>
          <input type="number" value={cfg.minDeposit} onChange={e => cms.setReferralConfig({ minDeposit: Number(e.target.value) || 0 })}
            className="input tabular w-full mt-1" />
        </div>
        <div>
          <label className="text-xs text-slate-400">Tier Threshold (referrals)</label>
          <input type="number" value={cfg.tierThreshold} onChange={e => cms.setReferralConfig({ tierThreshold: Number(e.target.value) || 0 })}
            className="input tabular w-full mt-1" />
        </div>
        <div>
          <label className="text-xs text-slate-400">Tier Commission (%)</label>
          <input type="number" value={cfg.tierPercent} onChange={e => cms.setReferralConfig({ tierPercent: Number(e.target.value) || 0 })}
            className="input tabular w-full mt-1" />
        </div>
      </div>
      <p className="text-xs text-slate-500">Reward credits instantly when the referred user's first approved deposit reaches the minimum.</p>
    </div>
  );
}

function ReferralHistoryAdmin() {
  const allRefs = useReferrals();
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? allRefs.filter(r => r.referrerId.includes(search) || (r.referredUsername || '').toLowerCase().includes(search.toLowerCase()))
    : allRefs;
  return (
    <div className="space-y-3">
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by Referrer ID or Username..." className="input text-sm" />
      <div className="panel overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-borderline-900 text-slate-500">
              <th className="text-left px-3 py-2.5">Referrer ID</th>
              <th className="text-left px-3 py-2.5">Referred User</th>
              <th className="text-left px-3 py-2.5">Date</th>
              <th className="text-left px-3 py-2.5">Status</th>
              <th className="text-left px-3 py-2.5">Reward</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-slate-500">No referral history found</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-borderline-900 hover:bg-slatepanel-800">
                  <td className="px-3 py-2.5 text-slate-300">{r.referrerId}</td>
                  <td className="px-3 py-2.5">{r.referredUsername || r.referredUserId}</td>
                  <td className="px-3 py-2.5 text-slate-500">{new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                  <td className="px-3 py-2.5">
                    <span className={`chip ${
                      r.rewardCredited ? 'bg-emeraldwin-500/15 text-emeraldwin-400' :
                      r.firstDepositApproved ? 'bg-amberx-500/10 text-amberx-400' : 'bg-slatepanel-700 text-slate-400'
                    }`}>{r.rewardCredited ? 'Rewarded' : r.firstDepositApproved ? 'Pending' : 'Waiting'}</span>
                  </td>
                  <td className="px-3 py-2.5">{r.rewardCredited ? `₹${r.rewardAmount}` : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
