import { useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import { auth } from '../lib/auth';
import {
  TrendingUp, Users, DollarSign, Copy, CheckCircle, ExternalLink,
  Clock, ChevronRight, AlertCircle, Wallet, BarChart3, Link, ArrowLeft,
  Gift, Star, Zap
} from 'lucide-react';

interface AffiliateData {
  id: string; name: string; email: string; status: string;
  affiliate_code: string; commission_model: string;
  cpa_amount: number; revshare_percent: number;
  total_referrals: number; total_depositors: number;
  total_commission: number; unpaid_commission: number;
  created_at: string;
}

interface Conversion {
  id: string; conversion_type: string; amount: number;
  commission_earned: number; status: string; created_at: string;
  referred_username?: string;
}

interface Payout {
  id: string; amount: number; payment_method: string;
  status: string; created_at: string;
}

interface Props { onBack?: () => void; }

type Tab = 'overview' | 'conversions' | 'payouts' | 'register';

export default function AffiliateView({ onBack }: Props) {
  const [affiliate, setAffiliate] = useState<AffiliateData | null>(null);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutUpi, setPayoutUpi] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [regForm, setRegForm] = useState({ name: '', email: '', company: '', website: '', traffic: 'social', model: 'cpa' });
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const session = auth.getSession();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data: affData } = await supabase.rpc('affiliate_get_dashboard');
      if (affData && affData.length > 0) {
        setAffiliate(affData[0] as AffiliateData);
        const affId = (affData[0] as AffiliateData).id;
        const [{ data: cvData }, { data: pyData }] = await Promise.all([
          supabase.from('affiliate_conversions').select('*').eq('affiliate_id', affId).order('created_at', { ascending: false }).limit(50),
          supabase.from('affiliate_payouts').select('*').eq('affiliate_id', affId).order('created_at', { ascending: false }).limit(20),
        ]);
        setConversions((cvData ?? []) as Conversion[]);
        setPayouts((pyData ?? []) as Payout[]);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  async function handleRegister() {
    setRegError('');
    if (!regForm.name || !regForm.email) { setRegError('Name and email are required'); return; }
    setRegLoading(true);
    try {
      const { error } = await supabase.rpc('affiliate_register', {
        p_name: regForm.name, p_email: regForm.email,
        p_company_name: regForm.company || null,
        p_website: regForm.website || null,
        p_traffic_source: regForm.traffic,
        p_commission_model: regForm.model,
      });
      if (error) { setRegError(error.message); return; }
      await loadData();
    } catch (e) { setRegError((e as Error).message); } finally { setRegLoading(false); }
  }

  async function handlePayout() {
    const amt = Math.round(parseFloat(payoutAmount) * 100);
    if (!payoutUpi || amt < 10000) { return; }
    setPayoutLoading(true);
    try {
      await supabase.rpc('affiliate_request_payout', {
        p_amount: amt, p_payment_method: 'upi',
        p_payment_details: { upi_id: payoutUpi },
      });
      setPayoutOpen(false); setPayoutAmount(''); setPayoutUpi('');
      await loadData();
    } catch { /* ignore */ } finally { setPayoutLoading(false); }
  }

  function copyLink() {
    if (!affiliate) return;
    const link = `${window.location.origin}?ref=${affiliate.affiliate_code}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const fmt = (n: number) => `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  if (!session) {
    return (
      <div className="min-h-screen bg-slatepanel-950 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-amber-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Login Required</h2>
          <p className="text-slate-400">Please login to access the affiliate program.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slatepanel-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neon-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not registered yet
  if (!affiliate) {
    return (
      <div className="min-h-screen bg-slatepanel-950 text-white">
        {/* Header */}
        <div className="bg-slatepanel-900 border-b border-slatepanel-700 px-4 py-3 flex items-center gap-3">
          {onBack && <button onClick={onBack} className="text-slate-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>}
          <h1 className="text-lg font-bold">Affiliate Program</h1>
        </div>

        <div className="max-w-xl mx-auto p-6 space-y-6">
          {/* Hero */}
          <div className="bg-gradient-to-br from-neon-900/40 to-purple-900/40 rounded-2xl p-6 border border-neon-500/20 text-center space-y-3">
            <div className="flex justify-center gap-4">
              <div className="bg-neon-500/20 rounded-xl p-3"><Star className="w-6 h-6 text-neon-400" /></div>
              <div className="bg-purple-500/20 rounded-xl p-3"><Zap className="w-6 h-6 text-purple-400" /></div>
              <div className="bg-amber-500/20 rounded-xl p-3"><Gift className="w-6 h-6 text-amber-400" /></div>
            </div>
            <h2 className="text-2xl font-bold">Earn With B4Bet</h2>
            <p className="text-slate-400 text-sm">Join our affiliate program and earn commissions for every player you bring.</p>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="bg-slatepanel-800 rounded-xl p-3">
                <div className="text-neon-400 font-bold text-lg">₹500</div>
                <div className="text-slate-400 text-xs">Per CPA</div>
              </div>
              <div className="bg-slatepanel-800 rounded-xl p-3">
                <div className="text-purple-400 font-bold text-lg">10%</div>
                <div className="text-slate-400 text-xs">RevShare</div>
              </div>
              <div className="bg-slatepanel-800 rounded-xl p-3">
                <div className="text-amber-400 font-bold text-lg">∞</div>
                <div className="text-slate-400 text-xs">No Cap</div>
              </div>
            </div>
          </div>

          {/* Commission Models */}
          <div className="space-y-3">
            <h3 className="font-bold text-slate-300">Choose Commission Model</h3>
            <div className="grid grid-cols-1 gap-3">
              {[
                { key: 'cpa', label: 'CPA - Cost Per Acquisition', desc: 'Fixed ₹500 for every user who makes their first deposit. Best for high-volume affiliates.', color: 'neon' },
                { key: 'revshare', label: 'RevShare - Revenue Share', desc: '10% of net gaming revenue generated by your referred players. Lifetime earnings.', color: 'purple' },
                { key: 'hybrid', label: 'Hybrid - Best of Both', desc: '₹250 CPA + 5% RevShare. Balanced model for steady income + long-term earnings.', color: 'amber' },
              ].map(m => (
                <button key={m.key} onClick={() => setRegForm(f => ({ ...f, model: m.key }))}
                  className={`text-left p-4 rounded-xl border-2 transition ${
                    regForm.model === m.key
                      ? `border-${m.color}-500 bg-${m.color}-500/10`
                      : 'border-slatepanel-600 bg-slatepanel-800 hover:border-slatepanel-500'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{m.label}</span>
                    {regForm.model === m.key && <CheckCircle className="w-4 h-4 text-neon-400" />}
                  </div>
                  <p className="text-slate-400 text-xs mt-1">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Registration Form */}
          <div className="bg-slatepanel-800 rounded-2xl p-5 space-y-4">
            <h3 className="font-bold">Register as Affiliate</h3>
            {regError && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{regError}</div>}
            <div className="space-y-3">
              <input value={regForm.name} onChange={e => setRegForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full Name *" className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-neon-500" />
              <input value={regForm.email} onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))}
                placeholder="Email *" type="email" className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-neon-500" />
              <input value={regForm.company} onChange={e => setRegForm(f => ({ ...f, company: e.target.value }))}
                placeholder="Company Name (optional)" className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-neon-500" />
              <input value={regForm.website} onChange={e => setRegForm(f => ({ ...f, website: e.target.value }))}
                placeholder="Website / Social URL (optional)" className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-neon-500" />
              <select value={regForm.traffic} onChange={e => setRegForm(f => ({ ...f, traffic: e.target.value }))}
                className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neon-500">
                <option value="social">Social Media</option>
                <option value="seo">SEO / Blog</option>
                <option value="paid">Paid Ads</option>
                <option value="influencer">Influencer</option>
                <option value="other">Other</option>
              </select>
            </div>
            <button onClick={handleRegister} disabled={regLoading}
              className="w-full py-3 bg-neon-500 hover:bg-neon-400 text-black font-bold rounded-xl transition disabled:opacity-50">
              {regLoading ? 'Submitting...' : 'Submit Application'}
            </button>
            <p className="text-slate-500 text-xs text-center">Applications are reviewed within 24 hours. You will be notified on approval.</p>
          </div>
        </div>
      </div>
    );
  }

  const referralLink = `${window.location.origin}?ref=${affiliate.affiliate_code}`;
  const statusColor = { pending: 'amber', approved: 'neon', rejected: 'red', suspended: 'orange' }[affiliate.status] ?? 'slate';

  return (
    <div className="min-h-screen bg-slatepanel-950 text-white">
      {/* Header */}
      <div className="bg-slatepanel-900 border-b border-slatepanel-700 px-4 py-3 flex items-center gap-3">
        {onBack && <button onClick={onBack} className="text-slate-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>}
        <h1 className="text-lg font-bold flex-1">Affiliate Dashboard</h1>
        <span className={`px-3 py-1 rounded-full text-xs font-bold bg-${statusColor}-500/20 text-${statusColor}-400 capitalize`}>
          {affiliate.status}
        </span>
      </div>

      {affiliate.status === 'pending' && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-amber-300 text-sm">Your application is under review. We'll notify you within 24 hours.</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slatepanel-700 bg-slatepanel-900">
        {([['overview', 'Overview'], ['conversions', 'Conversions'], ['payouts', 'Payouts']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-3 text-sm font-semibold transition ${
              tab === k ? 'text-neon-300 border-b-2 border-neon-400' : 'text-slate-500 hover:text-white'
            }`}>{l}</button>
        ))}
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">

        {tab === 'overview' && (
          <>
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total Referrals', value: affiliate.total_referrals, icon: Users, color: 'blue' },
                { label: 'Depositors', value: affiliate.total_depositors, icon: TrendingUp, color: 'neon' },
                { label: 'Total Earned', value: fmt(affiliate.total_commission), icon: BarChart3, color: 'purple' },
                { label: 'Available', value: fmt(affiliate.unpaid_commission), icon: Wallet, color: 'amber' },
              ].map(s => (
                <div key={s.label} className="bg-slatepanel-800 rounded-2xl p-4">
                  <s.icon className={`w-5 h-5 text-${s.color}-400 mb-2`} />
                  <div className={`text-xl font-bold text-${s.color}-300`}>{s.value}</div>
                  <div className="text-slate-500 text-xs">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Commission model */}
            <div className="bg-slatepanel-800 rounded-2xl p-4 space-y-2">
              <h3 className="font-bold text-sm text-slate-300">Commission Model</h3>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-neon-500/20 text-neon-300 rounded-full text-xs font-bold uppercase">{affiliate.commission_model}</span>
                {affiliate.commission_model === 'cpa' && <span className="text-slate-300 text-sm">{fmt(affiliate.cpa_amount)} per depositing user</span>}
                {affiliate.commission_model === 'revshare' && <span className="text-slate-300 text-sm">{affiliate.revshare_percent}% of net revenue</span>}
                {affiliate.commission_model === 'hybrid' && <span className="text-slate-300 text-sm">{fmt(affiliate.cpa_amount)} CPA + {affiliate.revshare_percent}% RevShare</span>}
              </div>
            </div>

            {/* Referral link */}
            <div className="bg-slatepanel-800 rounded-2xl p-4 space-y-3">
              <h3 className="font-bold text-sm text-slate-300">Your Referral Link</h3>
              <div className="flex items-center gap-2 bg-slatepanel-700 rounded-xl p-3">
                <Link className="w-4 h-4 text-neon-400 shrink-0" />
                <span className="text-xs text-slate-300 flex-1 truncate">{referralLink}</span>
                <button onClick={copyLink} className="text-neon-400 hover:text-neon-300 transition">
                  {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-center gap-2 bg-slatepanel-700 rounded-xl p-3">
                <span className="text-slate-400 text-xs">Code:</span>
                <span className="text-neon-300 font-mono font-bold">{affiliate.affiliate_code}</span>
              </div>
            </div>

            {/* Payout */}
            {affiliate.status === 'approved' && affiliate.unpaid_commission >= 10000 && (
              <button onClick={() => setPayoutOpen(true)}
                className="w-full py-3 bg-neon-500 hover:bg-neon-400 text-black font-bold rounded-xl transition">
                Request Payout ({fmt(affiliate.unpaid_commission)} available)
              </button>
            )}
          </>
        )}

        {tab === 'conversions' && (
          <div className="space-y-2">
            {conversions.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No conversions yet. Share your link to get started!</p>
              </div>
            ) : conversions.map(c => (
              <div key={c.id} className="bg-slatepanel-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm capitalize">{c.conversion_type.replace('_', ' ')}</div>
                  <div className="text-slate-400 text-xs">{c.referred_username ?? 'Anonymous'} · {new Date(c.created_at).toLocaleDateString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-neon-400 font-bold text-sm">+{fmt(c.commission_earned)}</div>
                  <div className={`text-xs capitalize ${c.status === 'credited' ? 'text-green-400' : 'text-amber-400'}`}>{c.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'payouts' && (
          <div className="space-y-2">
            {payouts.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No payouts yet.</p>
              </div>
            ) : payouts.map(p => (
              <div key={p.id} className="bg-slatepanel-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">{fmt(p.amount)}</div>
                  <div className="text-slate-400 text-xs">{p.payment_method.toUpperCase()} · {new Date(p.created_at).toLocaleDateString()}</div>
                </div>
                <span className={`px-2 py-1 rounded-lg text-xs font-bold capitalize ${
                  p.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                  p.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                  'bg-amber-500/20 text-amber-400'
                }`}>{p.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payout Modal */}
      {payoutOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
          <div className="bg-slatepanel-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-bold text-lg">Request Payout</h3>
            <div className="text-slate-400 text-sm">Available: {fmt(affiliate.unpaid_commission)}</div>
            <input value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)} type="number"
              placeholder="Amount (min ₹100)" className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neon-500" />
            <input value={payoutUpi} onChange={e => setPayoutUpi(e.target.value)}
              placeholder="UPI ID (e.g. name@paytm)" className="w-full bg-slatepanel-700 border border-slatepanel-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neon-500" />
            <div className="flex gap-3">
              <button onClick={() => setPayoutOpen(false)} className="flex-1 py-3 bg-slatepanel-700 rounded-xl text-sm">Cancel</button>
              <button onClick={handlePayout} disabled={payoutLoading}
                className="flex-1 py-3 bg-neon-500 hover:bg-neon-400 text-black font-bold rounded-xl transition disabled:opacity-50">
                {payoutLoading ? 'Requesting...' : 'Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
