import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Minus, ShieldAlert, Search, Eye, RefreshCw } from 'lucide-react';
import { supabaseGetUsers, supabaseUpdateBalance, type SupabaseProfile } from '../../lib/supabaseIntegration';

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function UsersTab() {
  const [users, setUsers] = useState<SupabaseProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [viewingId, setViewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supabaseGetUsers();
      setUsers(data);
    } catch (e) {
      console.error('UsersTab load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = users.filter((u) => {
    const query = q.toLowerCase();
    return (
      (u.username ?? '').toLowerCase().includes(query) ||
      (u.display_name ?? '').toLowerCase().includes(query) ||
      u.id.toLowerCase().includes(query) ||
      (u.account_id ?? '').toLowerCase().includes(query)
    );
  });

  const adjust = async (id: string, dir: 'credit' | 'debit') => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return;
    const user = users.find((u) => u.id === id);
    if (!user) return;
    const newBalance = dir === 'credit'
      ? user.balance + amt
      : Math.max(0, user.balance - amt);
    try {
      await supabaseUpdateBalance(id, newBalance);
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, balance: newBalance } : u));
      setAdjustId(null); setAmount(''); setReason('');
    } catch (e) {
      console.error('Balance update error:', e);
      alert('Balance update failed');
    }
  };

  const viewing = viewingId ? users.find((u) => u.id === viewingId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-neon-400" />
          <div>
            <h2 className="font-display font-bold text-lg text-white">User Profiles</h2>
            <p className="text-xs text-slate-500">Live data from Supabase database.</p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username, display name, user ID or account ID…"
          className="input pl-10"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-borderline-900">
              <th className="text-left py-2 px-3">Username</th>
              <th className="text-left py-2 px-3">Acct ID</th>
              <th className="text-left py-2 px-3">Email</th>
              <th className="text-left py-2 px-3">Phone</th>
              <th className="text-left py-2 px-3">Balance</th>
              <th className="text-left py-2 px-3">Deposit</th>
              <th className="text-left py-2 px-3">Withdraw</th>
              <th className="text-left py-2 px-3">VIP</th>
              <th className="text-left py-2 px-3">Joined</th>
              <th className="text-left py-2 px-3">Status</th>
              <th className="text-left py-2 px-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderline-900/50">
            {loading ? (
              <tr>
                <td colSpan={11} className="text-center text-xs text-slate-500 py-8">
                  Loading from Supabase…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center text-xs text-slate-500 py-8">
                  {users.length === 0 ? 'No users found in database.' : 'No users match your search.'}
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slatepanel-800/30 transition-colors">
                  <td className="py-2 px-3">
                    <div className="font-semibold text-white truncate max-w-[120px]">
                      {u.display_name ?? u.username ?? '—'}
                    </div>
                    {u.is_banned && (
                      <span className="text-[9px] text-coral-400">Banned</span>
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-400 text-xs">{u.account_id || '—'}</td>
                  <td className="py-2 px-3 text-slate-400 text-xs truncate max-w-[140px]">{u.email ?? '—'}</td>
                  <td className="py-2 px-3 text-slate-400 text-xs">{u.phone ?? '—'}</td>
                  <td className="py-2 px-3 text-neon-300 tabular-nums">{fmt(u.balance)}</td>
                  <td className="py-2 px-3 text-emeraldwin-300 tabular-nums">{fmt(u.total_deposit)}</td>
                  <td className="py-2 px-3 text-coral-300 tabular-nums">{fmt(u.total_withdrawal)}</td>
                  <td className="py-2 px-3 text-slate-300">{u.vip_level}</td>
                  <td className="py-2 px-3 text-slate-400 text-xs">
                    {new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${
                      u.is_banned
                        ? 'bg-coral-500/15 border-coral-500/30 text-coral-300'
                        : u.is_active
                        ? 'bg-emeraldwin-500/10 border-emeraldwin-500/20 text-emeraldwin-400'
                        : 'bg-slate-500/15 border-slate-500/30 text-slate-400'
                    }`}>
                      {u.is_banned ? 'Banned' : u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    {adjustId === u.id ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <input
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="Amt"
                          className="w-20 input py-1 text-xs tabular-nums"
                        />
                        <button onClick={() => void adjust(u.id, 'credit')} className="w-7 h-7 rounded-lg bg-emeraldwin-500/20 border border-emeraldwin-500/40 grid place-items-center">
                          <Plus className="w-3 h-3 text-emeraldwin-300" />
                        </button>
                        <button onClick={() => void adjust(u.id, 'debit')} className="w-7 h-7 rounded-lg bg-coral-500/20 border border-coral-500/40 grid place-items-center">
                          <Minus className="w-3 h-3 text-coral-300" />
                        </button>
                        <button onClick={() => { setAdjustId(null); setAmount(''); setReason(''); }} className="text-[10px] text-slate-400 hover:text-white px-1">✕</button>
                        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…" className="input py-1 text-xs w-full mt-1" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setAdjustId(u.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slatepanel-700 border border-borderline-900 text-slate-300 hover:text-white text-xs font-semibold"
                        >
                          <ShieldAlert className="w-3 h-3" /> Adjust
                        </button>
                        <button
                          onClick={() => setViewingId(u.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neon-500/15 border border-neon-500/40 text-neon-300 hover:text-neon-200 text-xs font-semibold"
                        >
                          <Eye className="w-3 h-3" /> View
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="panel p-3 flex items-center gap-2">
        <Users className="w-4 h-4 text-slate-500" />
        <span className="text-xs text-slate-500">Total Registered Users</span>
        <span className="text-white font-bold ml-auto">{users.length}</span>
      </div>

      {/* User detail modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setViewingId(null)}>
          <div className="panel p-6 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-white">{viewing.display_name ?? viewing.username}</h3>
              <button onClick={() => setViewingId(null)} className="text-slate-400 hover:text-white text-sm">✕ Close</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Row label="Username" value={viewing.username ?? '—'} />
              <Row label="Account ID" value={viewing.account_id || '—'} mono />
              <Row label="Email" value={viewing.email ?? '—'} />
              <Row label="Phone" value={viewing.phone ?? '—'} />
              <Row label="Balance" value={fmt(viewing.balance)} />
              <Row label="Total Deposit" value={fmt(viewing.total_deposit)} />
              <Row label="Total Withdrawal" value={fmt(viewing.total_withdrawal)} />
              <Row label="VIP Level" value={String(viewing.vip_level)} />
              <Row label="Status" value={viewing.is_banned ? 'Banned' : viewing.is_active ? 'Active' : 'Inactive'} />
              <Row label="Admin" value={viewing.is_admin ? 'Yes' : 'No'} />
              <Row label="Reg. IP" value={viewing.registration_ip ?? '—'} mono />
              <Row label="Referral Code" value={viewing.referral_code ?? '—'} mono />
              <Row label="Signup Bonus" value={viewing.signup_bonus_granted ? 'Granted' : 'Not granted'} />
              <Row label="Joined" value={new Date(viewing.created_at).toLocaleString()} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-slatepanel-800 rounded-lg p-2">
      <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className={`text-xs text-white mt-0.5 truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
