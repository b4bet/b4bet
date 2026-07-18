import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Minus, ShieldAlert, Search, Eye, RefreshCw, Shield, ShieldOff, Hash } from 'lucide-react';
import { supabaseGetUsers, supabaseUpdateBalance, supabaseToggleAdmin, type SupabaseProfile } from '../../lib/supabaseIntegration';

function fmt(n: number) {
  return '\u20B9' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      // Search by 6-digit account_id
      (u.account_id ?? '').includes(query) ||
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-neon-300" /> User Profiles
          </h2>
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
          placeholder="Search by username, name, 6-digit ID or UUID…"
          className="input pl-10"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-slate-500 uppercase tracking-wider text-[10px] border-b border-borderline-900">
            <tr>
              <th className="text-left py-2 pr-3">Username</th>
              <th className="text-left py-2 pr-3">
                <span className="flex items-center gap-1">
                  <Hash className="w-3 h-3" /> ID
                </span>
              </th>
              <th className="text-left py-2 pr-3">Phone</th>
              <th className="text-right py-2 pr-3">Balance</th>
              <th className="text-right py-2 pr-3">Deposit</th>
              <th className="text-right py-2 pr-3">Withdraw</th>
              <th className="text-center py-2 pr-3">VIP</th>
              <th className="text-left py-2 pr-3">Joined</th>
              <th className="text-center py-2 pr-3">Status</th>
              <th className="text-center py-2 pr-3">Admin</th>
              <th className="text-right py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderline-900/60">
            {loading ? (
              <tr>
                <td colSpan={11} className="py-6 text-center text-slate-500">
                  <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />
                  Loading from Supabase…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-6 text-center text-slate-500">
                  {users.length === 0 ? 'No users found in database.' : 'No users match your search.'}
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slatepanel-800/50 transition-colors">
                  <td className="py-2 pr-3">
                    <div className="font-semibold text-white">{u.display_name ?? u.username ?? '—'}</div>
                    <div className="text-[10px] text-slate-500">{u.username}</div>
                  </td>
                  {/* 6-digit Account ID — prominent badge */}
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neon-500/15 border border-neon-500/30 font-mono font-bold text-neon-300 text-[11px]">
                      <Hash className="w-2.5 h-2.5" />{u.account_id || '——'}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-slate-300">{u.phone ?? '—'}</td>
                  <td className="py-2 pr-3 text-right font-semibold tabular text-white">{fmt(u.balance)}</td>
                  <td className="py-2 pr-3 text-right tabular text-emeraldwin-300">{fmt(u.total_deposit)}</td>
                  <td className="py-2 pr-3 text-right tabular text-coral-300">{fmt(u.total_withdrawal)}</td>
                  <td className="py-2 pr-3 text-center">
                    <span className="text-amberx-300 font-bold">{u.vip_level}</span>
                  </td>
                  <td className="py-2 pr-3 text-slate-400">
                    {new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="py-2 pr-3 text-center">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                      u.is_active
                        ? 'bg-emeraldwin-500/15 border-emeraldwin-500/30 text-emeraldwin-300'
                        : 'bg-coral-500/15 border-coral-500/30 text-coral-300'
                    }`}>
                      {u.is_active ? 'Active' : 'Banned'}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-center">
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
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {adjustId === u.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                            placeholder="Amt"
                            className="w-20 input py-1 text-xs tabular"
                          />
                          <button onClick={() => void adjust(u.id, 'credit')} className="w-7 h-7 rounded-lg bg-emeraldwin-500/20 border border-emeraldwin-500/40 grid place-items-center">
                            <Plus className="w-3.5 h-3.5 text-emeraldwin-300" />
                          </button>
                          <button onClick={() => void adjust(u.id, 'debit')} className="w-7 h-7 rounded-lg bg-coral-500/20 border border-coral-500/40 grid place-items-center">
                            <Minus className="w-3.5 h-3.5 text-coral-300" />
                          </button>
                          <button onClick={() => { setAdjustId(null); setAmount(''); setReason(''); }} className="text-[10px] text-slate-400 hover:text-white px-1">✕</button>
                          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…" className="input py-1 text-xs w-24" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
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
                            <Eye className="w-3 h-3" /> View
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500 border-t border-borderline-900 pt-3">
        <Users className="w-3.5 h-3.5" />
        <span>Total Registered Users: <span className="font-bold text-white">{users.length}</span></span>
        <span className="mx-2 text-borderline-900">|</span>
        <ShieldAlert className="w-3.5 h-3.5 text-coral-400" />
        <span>Banned: <span className="font-bold text-coral-300">{users.filter(u => !u.is_active).length}</span></span>
      </div>

      {/* User detail modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 grid place-items-center p-4" onClick={() => setViewingId(null)}>
          <div className="panel p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-white text-lg">{viewing.display_name ?? viewing.username}</h3>
                {/* 6-digit ID prominently shown */}
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neon-500/15 border border-neon-500/30 font-mono font-bold text-neon-300 text-sm">
                    <Hash className="w-3.5 h-3.5" />{viewing.account_id || 'No ID'}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    viewing.is_active
                      ? 'bg-emeraldwin-500/15 border-emeraldwin-500/30 text-emeraldwin-300'
                      : 'bg-coral-500/15 border-coral-500/30 text-coral-300'
                  }`}>{viewing.is_active ? 'Active' : 'Banned'}</span>
                </div>
              </div>
              <button onClick={() => setViewingId(null)} className="text-slate-400 hover:text-white text-sm">✕ Close</button>
            </div>
            <div className="space-y-1.5 text-[12px]">
              <Row label="Username" value={viewing.username ?? '—'} />
              <Row label="Account ID" value={viewing.account_id || '——'} mono />
              <Row label="UUID" value={viewing.id.slice(0, 16) + '…'} mono />
              <Row label="Phone" value={viewing.phone ?? '—'} />
              <Row label="Balance" value={fmt(viewing.balance)} />
              <Row label="Total Deposit" value={fmt(viewing.total_deposit)} />
              <Row label="Total Withdrawal" value={fmt(viewing.total_withdrawal)} />
              <Row label="VIP Level" value={String(viewing.vip_level)} />
              <Row label="Admin" value={viewing.is_admin ? 'Yes' : 'No'} />
              <Row label="Signup Bonus" value={viewing.signup_bonus_granted ? 'Granted' : 'Not yet'} />
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
    <div className="flex items-center justify-between py-1 border-b border-borderline-900/40">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold text-white ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
