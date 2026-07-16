import { useState } from 'react';
import { Megaphone, Gift, Users2, Check, X, Percent, Search, History, Activity } from 'lucide-react';
import { cms } from '../../lib/cms';
import { useAffiliates, useReferralConfig, useReferrals } from '../../lib/cmsHooks';

export default function MarketingTab() {
  const [sub, setSub] = useState<'refer' | 'affHistory' | 'affiliates' | 'refHistory'>('refer');
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-neon-300" /> Marketing Controls
        </h2>
        <p className="text-xs text-slate-500">Configure referral rewards and approve affiliate partners.</p>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <SubBtn active={sub === 'refer'} onClick={() => setSub('refer')} icon={Gift} label="Refer & Earn Config" />
        <SubBtn active={sub === 'affHistory'} onClick={() => setSub('affHistory')} icon={Activity} label="Affiliate History" />
        <SubBtn active={sub === 'affiliates'} onClick={() => setSub('affiliates')} icon={Users2} label="Affiliate Management" />
        <SubBtn active={sub === 'refHistory'} onClick={() => setSub('refHistory')} icon={History} label="Referral History" />
      </div>

      {sub === 'refer' && <ReferConfig />}
      {sub === 'affHistory' && <AffiliateHistory />}
      {sub === 'affiliates' && <AffiliateManagement />}
      {sub === 'refHistory' && <ReferralHistoryAdmin />}
    </div>
  );
}

function SubBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Gift; label: string }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${active ? 'bg-gradient-to-br from-neon-400 to-neon-600 text-white shadow-neon-glow' : 'bg-slatepanel-800 border border-borderline-900 text-slate-400'}`}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

function ReferConfig() {
  const cfg = useReferralConfig();
  return (
    <div className="panel p-4 space-y-3">
      <div>
        <label className="text-xs text-slate-400 font-semibold">Referral Reward Amount (₹)</label>
        <input type="number" value={cfg.rewardAmount}
          onChange={(e) => cms.setReferralConfig({ rewardAmount: Number(e.target.value) || 0 })}
          className="input tabular w-full mt-1" />
      </div>
      <div>
        <label className="text-xs text-slate-400 font-semibold">Minimum Deposit Required (₹)</label>
        <input type="number" value={cfg.minDeposit}
          onChange={(e) => cms.setReferralConfig({ minDeposit: Number(e.target.value) || 0 })}
          className="input tabular w-full mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 font-semibold">Tier Threshold (referrals)</label>
          <input type="number" value={cfg.tierThreshold}
            onChange={(e) => cms.setReferralConfig({ tierThreshold: Number(e.target.value) || 0 })}
            className="input tabular w-full mt-1" />
        </div>
        <div>
          <label className="text-xs text-slate-400 font-semibold">Tier Commission (%)</label>
          <input type="number" value={cfg.tierPercent}
            onChange={(e) => cms.setReferralConfig({ tierPercent: Number(e.target.value) || 0 })}
            className="input tabular w-full mt-1" />
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        Reward credits instantly when the referred user's first approved deposit reaches the minimum. After crossing the threshold, commission is paid as a percentage of the deposit amount.
      </p>
    </div>
  );
}

function AffiliateHistory() {
  const apps = useAffiliates();
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? apps.filter((a) => (a.username || '').toLowerCase().includes(search.toLowerCase()) || (a.email || '').toLowerCase().includes(search.toLowerCase()))
    : apps;
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by affiliate name or email..." className="input pl-10 text-sm" />
      </div>
      <div className="panel overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-midnight-850 border-b border-borderline-900 sticky top-0">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="p-3">Affiliate</th>
                <th className="p-3">Date</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Clicks</th>
                <th className="p-3 text-right">Signups</th>
                <th className="p-3 text-right">Deposits</th>
                <th className="p-3 text-right">RevShare %</th>
                <th className="p-3 text-right">Earnings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline-900">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-slate-500 text-sm">No affiliate history found</td></tr>
              ) : (
                filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slatepanel-800/50">
                    <td className="p-3">
                      <div className="text-white font-semibold text-xs">{a.username}</div>
                      <div className="text-[10px] text-slate-500">{a.email}</div>
                    </td>
                    <td className="p-3 text-[11px] text-slate-400">{new Date(a.ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                    <td className="p-3">
                      <span className={`chip text-[10px] ${a.status === 'approved' ? 'bg-emeraldwin-500/20 text-emeraldwin-300' : a.status === 'rejected' ? 'bg-coral-500/20 text-coral-300' : 'bg-amberx-500/20 text-amberx-300'}`}>{a.status}</span>
                    </td>
                    <td className="p-3 text-right tabular text-slate-200">{a.stats?.clicks ?? 0}</td>
                    <td className="p-3 text-right tabular text-slate-200">{a.stats?.registered ?? 0}</td>
                    <td className="p-3 text-right tabular text-slate-200">{a.stats?.deposits ?? 0}</td>
                    <td className="p-3 text-right tabular text-neon-300">{a.revSharePct}%</td>
                    <td className="p-3 text-right tabular font-bold text-emeraldwin-300">₹{(a.stats?.revenueShare ?? 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


function AffiliateManagement() {
  const apps = useAffiliates();
  return (
    <div className="space-y-2">
      {apps.length === 0 && <div className="panel p-4 text-sm text-slate-500">No affiliate applications yet.</div>}
      {apps.map((a) => (
        <div key={a.id} className="panel p-3 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-semibold text-white">{a.username} <span className="text-[10px] text-slate-500">({a.email})</span></div>
              <div className="text-[11px] text-slate-400">{a.telegram} · {a.trafficSource} · ~{a.estimatedTraffic}</div>
            </div>
            <span className={`chip text-[10px] ${a.status === 'approved' ? 'bg-emeraldwin-500/20 text-emeraldwin-300' : a.status === 'rejected' ? 'bg-coral-500/20 text-coral-300' : 'bg-amberx-500/20 text-amberx-300'}`}>{a.status}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-400 flex items-center gap-1"><Percent className="w-3 h-3" /> RevShare %</label>
            <input type="number" value={a.revSharePct}
              onChange={(e) => cms.setAffiliateRevShare(a.id, Number(e.target.value) || 0)}
              className="input tabular w-20 py-1 text-xs" />
            {a.status === 'pending' && (
              <>
                <button onClick={() => cms.setAffiliateStatus(a.id, 'approved')} className="btn-emerald px-2 py-1 text-xs"><Check className="w-3.5 h-3.5" /> Approve</button>
                <button onClick={() => cms.setAffiliateStatus(a.id, 'rejected')} className="btn-coral px-2 py-1 text-xs"><X className="w-3.5 h-3.5" /> Reject</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}


function ReferralHistoryAdmin() {
  const allRefs = useReferrals();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  
  const filtered = search.trim() 
    ? allRefs.filter((r) => r.referrerId.includes(search) || (r.referredUsername || '').toLowerCase().includes(search.toLowerCase()))
    : allRefs;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by Referrer ID or Referred Name..." className="input pl-10 text-sm" />
      </div>
      <div className="panel overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-midnight-850 border-b border-borderline-900 sticky top-0">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="p-3">Referrer ID</th>
                <th className="p-3">Referred User</th>
                <th className="p-3">Date</th>
                <th className="p-3">Status</th>
                <th className="p-3">Reward</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline-900">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500 text-sm">No referral history found</td></tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={i} className="hover:bg-slatepanel-800/50 cursor-pointer" onClick={() => setSelected(r)}>
                    <td className="p-3 font-mono text-xs text-neon-200">{r.referrerId}</td>
                    <td className="p-3 text-white font-semibold">{r.referredUsername || r.referredUserId}</td>
                    <td className="p-3 text-[11px] text-slate-400">{new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                    <td className="p-3">
                      <span className={`chip text-[10px] ${r.rewardCredited ? 'bg-emeraldwin-500/15 text-emeraldwin-400' : r.firstDepositApproved ? 'bg-amberx-500/15 text-amberx-400' : 'bg-slate-800 text-slate-400'}`}>
                        {r.rewardCredited ? 'Rewarded' : r.firstDepositApproved ? 'Pending' : 'Waiting'}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-sm text-slate-200">{r.rewardCredited ? `\u20b9${r.rewardAmount}` : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="bg-slatepanel-900 border border-borderline-900 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-white">Referral Details</h3>
              <button onClick={() => setSelected(null)} className="p-1 rounded-lg hover:bg-slatepanel-800"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <Detail label="Referrer ID" value={selected.referrerId} />
              <Detail label="Referred User" value={selected.referredUsername || selected.referredUserId} />
              <Detail label="Referred ID" value={selected.referredUserId} />
              <Detail label="Date" value={new Date(selected.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
              <Detail label="First Deposit" value={selected.firstDepositApproved ? 'Approved' : 'Pending'} />
              <Detail label="Reward" value={selected.rewardCredited ? `\u20b9${selected.rewardAmount}` : 'Pending'} />
            </div>
            <button onClick={() => setSelected(null)} className="btn-primary w-full py-2 mt-4">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className="text-white font-semibold text-xs">{value}</span>
    </div>
  );
}
