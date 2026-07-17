import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Minus, ShieldAlert, Search, Eye, RefreshCw, Shield, ShieldOff } from 'lucide-react';
import { supabaseGetUsers, supabaseUpdateBalance, supabaseToggleAdmin, type SupabaseProfile } from '../../lib/supabaseIntegration';

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
      u.id.toLowerCase().includes(query)
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

  const toggleAdmin = async (id: string, current: boolean) => {
    try {
      await supabaseToggleAdmin(id, !current);
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, is_admin: !current } : u));
    } catch (e) {
      console.error('toggleAdmin error:', e);
    }
  };

  const viewing = viewingId ? users.find((u) => u.id === viewingId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white">User Profiles</h2>
          <p className="text-xs text-slate-500">Live data from Supabase database.</p>
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
          placeholder="Search by username, display name or user ID…"
          className="input pl-10"
        />
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-midnight-850 border-b border-borderline-900">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="p-3">Username</th>
                <th className="p-3">User ID</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Balance</th>
                <th className="p-3">Deposit</th>
                <th className="p-3">Withdraw</th>
                <th className="p-3">VIP</th>
                <th className="p-3">Joined</th>
                <th className="p-3">Admin</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline-900">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400 text-sm">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading from Supabase…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500 text-sm">
                    {users.length === 0 ? 'No users found in database.' : 'No users match your search.'}
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slatepanel-800/50">
                    <td className="p-3 font-semibold text-white">{u.display_name ?? u.username ?? '—'}</td>
                    <td className="p-3 font-mono text-[11px] text-neon-200 tabular">{u.id.slice(0, 8)}…</td>
                    <td className="p-3 font-mono text-[11px] text-slate-300">{u.phone ?? '—'}</td>
                    <td className="p-3 font-semibold text-emeraldwin-300 tabular">{fmt(u.balance)}</td>
                    <td className="p-3 text-[11px] text-slate-300 tabular">{fmt(u.total_deposit)}</td>
                    <td className="p-3 text-[11px] text-slate-300 tabular">{fmt(u.total_withdrawal)}</td>
                    <td className="p-3 text-[11px] text-slate-300">{u.vip_level}</td>
                    <td className="p-3 text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => void toggleAdmin(u.id, u.is_admin)}
                        title={u.is_admin ? 'Remove admin' : 'Make admin'}
                        className={`w-7 h-7 rounded-lg grid place-items-center border transition-colors ${
                          u.is_admin
                            ? 'bg-neon-500/20 border-neon-500/40 text-neon-300'
                            : 'bg-slatepanel-800 border-borderline-900 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {u.is_admin ? <Shield className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="p-3 text-right">
                      {adjustId === u.id ? (
                        <div className="flex flex-col gap-1.5 justify-end">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number" value={amount}
                              onChange={(e) => setAmount(e.target.value)}
                              placeholder="Amt"
                              className="w-20 input py-1 text-xs tabular"
                            />
                            <button onClick={() => void adjust(u.id, 'credit')} className="w-7 h-7 rounded-lg bg-emeraldwin-500/20 border border-emeraldwin-500/40 grid place-items-center">
                              <Plus className="w-3.5 h-3.5 text-emeraldwin-400" />
                            </button>
                            <button onClick={() => void adjust(u.id, 'debit')} className="w-7 h-7 rounded-lg bg-coral-500/20 border border-coral-500/40 grid place-items-center">
                              <Minus className="w-3.5 h-3.5 text-coral-400" />
                            </button>
                            <button onClick={() => { setAdjustId(null); setAmount(''); setReason(''); }} className="text-[10px] text-slate-400 hover:text-white px-1">✕</button>
                          </div>
                          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…" className="input py-1 text-xs w-full" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => setAdjustId(u.id)}
                            className="text-xs font-semibold text-neon-300 hover:text-neon-200"
                          >
                            Adjust
                          </button>
                          <button
                            onClick={() => setViewingId(u.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neon-500/15 border border-neon-500/40 text-neon-300 hover:text-neon-200 text-xs font-semibold"
                          >
                            <Eye className="w-3.5 h-3.5" /> View
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
      </div>

      <div className="panel p-4">
        <h3 className="font-display font-bold text-sm text-white mb-2 flex items-center gap-2">
          <Users className="w-4 h-4 text-neon-300" /> Total Registered Users
        </h3>
        <p className="text-2xl font-display font-extrabold text-white">{users.length}</p>
      </div>

      {/* User detail modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setViewingId(null)}>
          <div className="panel w-full max-w-md p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-white text-lg">{viewing.display_name ?? viewing.username}</h3>
              <button onClick={() => setViewingId(null)} className="text-slate-400 hover:text-white text-sm">✕ Close</button>
            </div>
            <div className="space-y-2 text-sm">
              <Row label="User ID" value={viewing.id} mono />
              <Row label="Username" value={viewing.username ?? '—'} />
              <Row label="Phone" value={viewing.phone ?? '—'} />
              <Row label="Balance" value={fmt(viewing.balance)} />
              <Row label="Total Deposit" value={fmt(viewing.total_deposit)} />
              <Row label="Total Withdrawal" value={fmt(viewing.total_withdrawal)} />
              <Row label="VIP Level" value={String(viewing.vip_level)} />
              <Row label="Admin" value={viewing.is_admin ? 'Yes' : 'No'} />
              <Row label="Joined" value={new Date(viewing.created_at).toLocaleString('en-IN')} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className={`text-white text-right ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
    </div>
  );
}
