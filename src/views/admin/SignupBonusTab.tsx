import { useState, useEffect, useCallback } from 'react';
import { Gift, Save, Search, Wifi, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { store } from '../../lib/store';

interface BonusRow {
  id: string;
  user_id: string;
  username: string;
  amount: number;
  created_at: string;
}

export default function SignupBonusTab() {
  const [currentBonus, setCurrentBonus] = useState<number>(store.signupBonus);
  const [amount, setAmount] = useState(String(store.signupBonus));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rows, setRows] = useState<BonusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Load current bonus setting + history
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load current bonus setting from Supabase settings
      await store.loadSignupBonusFromSupabase();
      setCurrentBonus(store.signupBonus);
      setAmount(String(store.signupBonus));

      // Load bonus history from transactions
      const { data, error } = await supabase.rpc('admin_get_signup_bonus_history', { p_limit: 500 });
      if (error) throw error;
      setRows((data ?? []) as BonusRow[]);
    } catch (e) {
      console.error('[SignupBonusTab] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const n = Math.max(0, Number(amount) || 0);
    setSaving(true);
    try {
      store.setSignupBonus(n);
      setCurrentBonus(n);
      setAmount(String(n));
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return r.username.toLowerCase().includes(s) || r.user_id.includes(s);
  });

  const totalCredited = filtered.reduce((s, r) => s + r.amount, 0);

  const fmtDate = (ts: string) =>
    new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-emeraldwin-400" /> Signup Bonus
          </h2>
          <p className="text-xs text-slate-500">
            Every new user gets this amount on registration. History from Supabase transactions.
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white text-xs font-semibold disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Config */}
      <div className="panel p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Bonus Amount (₹)</label>
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
            <Wifi className="w-2.5 h-2.5" /> Supabase
          </span>
        </div>
        <div className="flex gap-2">
          <input type="number" min={0} step="1" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="input flex-1" placeholder="e.g. 100" />
          <button onClick={() => void save()} disabled={saving}
            className="btn-emerald px-4 flex items-center gap-2 font-bold disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
        {saved && <p className="text-xs text-emeraldwin-400">Saved! New signups will receive ₹{currentBonus}.</p>}
        <p className="text-[11px] text-slate-500">
          Current active bonus: <span className="text-white font-bold">₹{currentBonus}</span>
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="panel p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Bonuses Granted</div>
          <div className="font-display font-extrabold text-lg tabular text-white">{filtered.length}</div>
        </div>
        <div className="panel p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total Credited</div>
          <div className="font-display font-extrabold text-lg tabular text-emeraldwin-400">
            ₹{totalCredited.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username…" className="input pl-10 w-full" />
      </div>

      {/* History table */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-midnight-850 border-b border-borderline-900 sticky top-0">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="p-3">Date</th>
                <th className="p-3">User</th>
                <th className="p-3">User ID</th>
                <th className="p-3 text-right">Bonus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline-900">
              {loading ? (
                <tr><td colSpan={4} className="p-6 text-center text-slate-500 text-sm">
                  <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />Loading…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-slate-500 text-sm">No signup bonuses found.</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slatepanel-800/50">
                    <td className="p-3 text-slate-400 text-xs whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    <td className="p-3 font-semibold text-white">{r.username}</td>
                    <td className="p-3 font-mono text-[11px] text-neon-200 tabular">
                      {r.user_id.slice(0, 8)}…
                    </td>
                    <td className="p-3 text-right tabular font-bold text-emeraldwin-400">+₹{r.amount.toLocaleString('en-IN')}</td>
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
