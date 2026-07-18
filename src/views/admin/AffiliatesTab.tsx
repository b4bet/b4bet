import { useState, useEffect } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { CheckCircle, XCircle, Clock, DollarSign, Users, TrendingUp, Eye, Edit2, Plus } from 'lucide-react';

interface Affiliate {
  id: string; name: string; email: string; company_name?: string; website?: string;
  traffic_source?: string; commission_model: string; cpa_amount: number;
  revshare_percent: number; hybrid_cpa_amount: number; hybrid_revshare_percent: number;
  status: string; affiliate_code: string;
  total_referrals: number; total_depositors: number;
  total_commission: number; unpaid_commission: number;
  admin_notes?: string; approved_at?: string; created_at: string;
}

interface Payout {
  id: string; affiliate_id: string; affiliate_name: string; affiliate_email: string;
  amount: number; payment_method: string; payment_details: Record<string, string>;
  status: string; admin_notes?: string; created_at: string;
}

type SubTab = 'list' | 'payouts' | 'conversions';

export default function AffiliatesTab() {
  const [subTab, setSubTab] = useState<SubTab>('list');
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Affiliate | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editCpa, setEditCpa] = useState('');
  const [editRevshare, setEditRevshare] = useState('');
  const [editModel, setEditModel] = useState('cpa');
  const [manualAmount, setManualAmount] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: aff }, { data: py }] = await Promise.all([
      supabase.rpc('admin_get_affiliates'),
      supabase.rpc('admin_get_affiliate_payouts'),
    ]);
    setAffiliates((aff ?? []) as Affiliate[]);
    setPayouts((py ?? []) as Payout[]);
    setLoading(false);
  }

  async function updateStatus(id: string, status: string, notes?: string) {
    setSaving(true);
    await supabase.rpc('admin_update_affiliate_status', {
      p_affiliate_id: id, p_status: status,
      p_notes: notes || null,
      p_cpa_amount: editCpa ? Math.round(parseFloat(editCpa) * 100) : null,
      p_revshare_percent: editRevshare ? parseFloat(editRevshare) : null,
      p_commission_model: editModel || null,
    });
    setSaving(false);
    setEditOpen(false);
    await loadData();
  }

  async function addManualCommission() {
    if (!selected || !manualAmount) return;
    setSaving(true);
    await supabase.rpc('admin_add_affiliate_commission', {
      p_affiliate_id: selected.id,
      p_amount: Math.round(parseFloat(manualAmount) * 100),
      p_description: manualDesc || 'Manual commission',
    });
    setManualAmount(''); setManualDesc('');
    setSaving(false);
    await loadData();
  }

  async function processPayout(id: string, status: string, notes?: string) {
    await supabase.rpc('admin_process_affiliate_payout', {
      p_payout_id: id, p_status: status, p_notes: notes || null,
    });
    await loadData();
  }

  const fmt = (n: number) => `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const statusBadge = (s: string) => ({
    pending: 'bg-amber-500/20 text-amber-400',
    approved: 'bg-neon-500/20 text-neon-400',
    rejected: 'bg-red-500/20 text-red-400',
    suspended: 'bg-orange-500/20 text-orange-400',
    processing: 'bg-blue-500/20 text-blue-400',
    paid: 'bg-green-500/20 text-green-400',
  }[s] ?? 'bg-slate-500/20 text-slate-400');

  const filtered = affiliates.filter(a => filterStatus === 'all' || a.status === filterStatus);
  const pendingCount = affiliates.filter(a => a.status === 'pending').length;
  const pendingPayouts = payouts.filter(p => p.status === 'pending').length;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-neon-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Affiliates', value: affiliates.length, icon: Users, color: 'blue' },
          { label: 'Pending Approval', value: pendingCount, icon: Clock, color: 'amber' },
          { label: 'Pending Payouts', value: pendingPayouts, icon: DollarSign, color: 'neon' },
          { label: 'Total Paid', value: fmt(affiliates.reduce((s, a) => s + a.total_commission, 0)), icon: TrendingUp, color: 'green' },
        ].map(s => (
          <div key={s.label} className="bg-slatepanel-800 rounded-xl p-4">
            <s.icon className={`w-5 h-5 text-${s.color}-400 mb-2`} />
            <div className={`text-xl font-bold text-${s.color}-300`}>{s.value}</div>
            <div className="text-slate-500 text-xs">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Sub tabs */}
      <div className="flex gap-2 border-b border-slatepanel-700">
        {([['list', 'Affiliates'], ['payouts', `Payouts${pendingPayouts > 0 ? ` (${pendingPayouts})` : ''}`], ['conversions', 'Conversions']] as [SubTab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setSubTab(k)}
            className={`px-4 py-2 text-sm font-semibold transition ${
              subTab === k ? 'text-neon-300 border-b-2 border-neon-400' : 'text-slate-500 hover:text-white'
            }`}>{l}</button>
        ))}
      </div>

      {subTab === 'list' && (
        <>
          {/* Filter */}
          <div className="flex gap-2">
            {['all', 'pending', 'approved', 'rejected', 'suspended'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition ${
                  filterStatus === s ? 'bg-neon-500/20 text-neon-300' : 'bg-slatepanel-700 text-slate-400 hover:text-white'
                }`}>{s}</button>
            ))}
          </div>

          <div className="space-y-2">
            {filtered.map(a => (
              <div key={a.id} className="bg-slatepanel-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{a.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${statusBadge(a.status)}`}>{a.status}</span>
                      <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full text-xs uppercase">{a.commission_model}</span>
                    </div>
                    <div className="text-slate-400 text-xs mt-1">{a.email} {a.company_name && `· ${a.company_name}`} {a.website && `· ${a.website}`}</div>
                    <div className="text-slate-500 text-xs">Code: <span className="text-neon-400 font-mono">{a.affiliate_code}</span> · Traffic: {a.traffic_source}</div>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="text-slate-400">Referrals: <b className="text-white">{a.total_referrals}</b></span>
                      <span className="text-slate-400">Depositors: <b className="text-white">{a.total_depositors}</b></span>
                      <span className="text-slate-400">Earned: <b className="text-neon-300">{fmt(a.total_commission)}</b></span>
                      <span className="text-slate-400">Unpaid: <b className="text-amber-300">{fmt(a.unpaid_commission)}</b></span>
                    </div>
                    {a.commission_model === 'cpa' && <div className="text-xs text-slate-500 mt-1">CPA: {fmt(a.cpa_amount)} per depositor</div>}
                    {a.commission_model === 'revshare' && <div className="text-xs text-slate-500 mt-1">RevShare: {a.revshare_percent}% net revenue</div>}
                    {a.commission_model === 'hybrid' && <div className="text-xs text-slate-500 mt-1">Hybrid: {fmt(a.hybrid_cpa_amount)} CPA + {a.hybrid_revshare_percent}% RevShare</div>}
                    {a.admin_notes && <div className="text-xs text-slate-500 mt-1">Notes: {a.admin_notes}</div>}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => { setSelected(a); setEditNotes(a.admin_notes ?? ''); setEditCpa(String(a.cpa_amount / 100)); setEditRevshare(String(a.revshare_percent)); setEditModel(a.commission_model); setEditOpen(true); }}
                      className="p-2 bg-slatepanel-700 hover:bg-slatepanel-600 rounded-lg transition"><Edit2 className="w-4 h-4 text-slate-300" /></button>
                    {a.status === 'pending' && (
                      <>
                        <button onClick={() => updateStatus(a.id, 'approved')} className="p-2 bg-neon-500/20 hover:bg-neon-500/30 rounded-lg transition"><CheckCircle className="w-4 h-4 text-neon-400" /></button>
                        <button onClick={() => updateStatus(a.id, 'rejected')} className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition"><XCircle className="w-4 h-4 text-red-400" /></button>
                      </>
                    )}
                    {a.status === 'approved' && (
                      <button onClick={() => updateStatus(a.id, 'suspended')} className="p-2 bg-orange-500/20 hover:bg-orange-500/30 rounded-lg transition"><XCircle className="w-4 h-4 text-orange-400" /></button>
                    )}
                    {(a.status === 'suspended' || a.status === 'rejected') && (
                      <button onClick={() => updateStatus(a.id, 'approved')} className="p-2 bg-neon-500/20 hover:bg-neon-500/30 rounded-lg transition"><CheckCircle className="w-4 h-4 text-neon-400" /></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="text-center py-12 text-slate-500">No affiliates found.</div>}
          </div>
        </>
      )}

      {subTab === 'payouts' && (
        <div className="space-y-2">
          {payouts.map(p => (
            <div key={p.id} className="bg-slatepanel-800 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{p.affiliate_name}</div>
                  <div className="text-slate-400 text-xs">{p.affiliate_email} · {p.payment_method.toUpperCase()}</div>
                  {p.payment_details && <div className="text-slate-500 text-xs">{JSON.stringify(p.payment_details)}</div>}
                  <div className="text-slate-500 text-xs">{new Date(p.created_at).toLocaleString()}</div>
                </div>
                <div className="text-right space-y-2">
                  <div className="text-xl font-bold text-neon-300">{fmt(p.amount)}</div>
                  <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${statusBadge(p.status)}`}>{p.status}</span>
                  {p.status === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => processPayout(p.id, 'paid')} className="px-3 py-1 bg-neon-500/20 text-neon-400 hover:bg-neon-500/30 rounded-lg text-xs">Mark Paid</button>
                      <button onClick={() => processPayout(p.id, 'rejected')} className="px-3 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs">Reject</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {payouts.length === 0 && <div className="text-center py-12 text-slate-500">No payout requests.</div>}
        </div>
      )}

      {subTab === 'conversions' && (
        <div className="text-center py-12 text-slate-500">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Select an affiliate to view their conversions.</p>
        </div>
      )}

      {/* Edit Modal */}
      {editOpen && selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slatepanel-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-bold text-lg">Edit Affiliate: {selected.name}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Commission Model</label>
                <select value={editModel} onChange={e => setEditModel(e.target.value)}
                  className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-3 py-2 text-sm text-white">
                  <option value="cpa">CPA</option>
                  <option value="revshare">RevShare</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">CPA Amount (₹)</label>
                <input value={editCpa} onChange={e => setEditCpa(e.target.value)} type="number"
                  className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">RevShare %</label>
                <input value={editRevshare} onChange={e => setEditRevshare(e.target.value)} type="number" step="0.5"
                  className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Admin Notes</label>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                  className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-3 py-2 text-sm text-white" />
              </div>
              <div className="border-t border-slatepanel-600 pt-3">
                <label className="text-xs text-slate-400 mb-2 block">Add Manual Commission</label>
                <div className="flex gap-2">
                  <input value={manualAmount} onChange={e => setManualAmount(e.target.value)} type="number" placeholder="₹ Amount"
                    className="flex-1 bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-3 py-2 text-sm text-white" />
                  <input value={manualDesc} onChange={e => setManualDesc(e.target.value)} placeholder="Reason"
                    className="flex-1 bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-3 py-2 text-sm text-white" />
                  <button onClick={addManualCommission} disabled={saving}
                    className="px-3 py-2 bg-neon-500/20 text-neon-400 rounded-xl hover:bg-neon-500/30 transition">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditOpen(false)} className="flex-1 py-2 bg-slatepanel-700 rounded-xl text-sm">Cancel</button>
              <button onClick={() => updateStatus(selected.id, selected.status, editNotes)} disabled={saving}
                className="flex-1 py-2 bg-neon-500 hover:bg-neon-400 text-black font-bold rounded-xl transition disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
