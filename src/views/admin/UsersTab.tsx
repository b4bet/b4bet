import { useState, useEffect } from 'react';
import { auth } from '../../lib/auth';
import { store } from '../../lib/store';
import { cms } from '../../lib/cms';
import { bus, Topics } from '../../lib/bus';
import BalanceHistoryTab from './BalanceHistoryTab';
import type { SeedUser } from '../../lib/seedUsers';
import { Users, Plus, Minus, ShieldAlert, Search, Eye, Clock } from 'lucide-react';
import UserProfileModal from '../../components/UserProfileModal';

type UserProfile = SeedUser;

/** Map real AuthUser → UserProfile shape used by the table + modal */
function getRealUsers(): UserProfile[] {
  return auth.getUsers().map((u) => ({
    id: u.id,
    account: u.username,
    accountId: u.accountId,
    mobile: u.mobile ?? '—',
    deviceToken: '—',
    ip: '—',
    balance: 0,          // balance is held in store per-session; no per-user ledger yet
    status: u.isActive ? 'active' : 'flagged',
    joined: u.createdAt,
  }));
}

export default function UsersTab() {
  const [users, setUsers] = useState<UserProfile[]>(getRealUsers());
  const [q, setQ] = useState('');
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [adjustHistoryUserId, setAdjustHistoryUserId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = viewingId ? users.find((u) => u.id === viewingId) ?? null : null;

  // Refresh list whenever a new user registers — merge to preserve balance adjustments
  useEffect(() => {
    return bus.on(Topics.AuthState, () => {
      setUsers((prev) => {
        const fresh = getRealUsers();
        // Preserve any admin-adjusted balances for existing users, but keep auth status fresh
        return fresh.map((u) => {
          const existing = prev.find((p) => p.id === u.id);
          return existing ? { ...u, balance: existing.balance } : u;
        });
      });
    });
  }, []);

  const filtered = users.filter((u) =>
    u.account.toLowerCase().includes(q.toLowerCase()) ||
    u.accountId.toLowerCase().includes(q.toLowerCase())
  );

  const adjust = (id: string, dir: 'credit' | 'debit') => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return;
    const reasonText = reason.trim() || 'No reason provided';
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id
          ? { ...u, balance: dir === 'credit' ? u.balance + amt : Math.max(0, u.balance - amt) }
          : u
      )
    );
    const u = users.find((x) => x.id === id);
    cms.toast({
      title: `${dir === 'credit' ? 'Credited' : 'Debited'} ${u?.account}`,
      body: `₹${amt.toFixed(2)} ${dir === 'credit' ? 'added' : 'removed'}. Reason: ${reasonText}`,
      kind: dir === 'credit' ? 'success' : 'warn',
    });
    store.pushBalanceHistory({ userId: id, username: u?.account ?? id, type: dir, amount: amt, reason: reasonText });
    // Also sync to global balance if this user is logged in
    const session = auth.getSession();
    if (session && session.userId === id) {
      if (dir === 'credit') store.credit(amt);
      else store.debit(amt);
    }
    setAdjustId(null); setAmount(''); setReason('');
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-white">User Profiles</h2>
        <p className="text-xs text-slate-500">All registered users. Data updates live as new accounts are created.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username or user ID…"
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
                <th className="p-3">Mobile Number</th>
                <th className="p-3">Joined</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Balance Adj.</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderline-900">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 text-sm">
                    {users.length === 0
                      ? 'No registered users yet. Users will appear here after they sign up.'
                      : 'No users match your search.'}
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slatepanel-800/50">
                    <td className="p-3 font-semibold text-white">{u.account}</td>
                    <td className="p-3 font-mono text-[11px] text-neon-200 tabular">{u.accountId}</td>
                    <td className="p-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">{u.mobile}</td>
                    <td className="p-3 text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(u.joined).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="p-3">
                      {u.status === 'flagged' ? (
                        <span className="chip bg-coral-500/15 border border-coral-500/40 text-coral-400 text-[10px]">
                          <ShieldAlert className="w-3 h-3" /> Flagged
                        </span>
                      ) : (
                        <span className="chip bg-emeraldwin-500/15 border border-emeraldwin-500/40 text-emeraldwin-400 text-[10px]">Active</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {adjustId === u.id ? (
                        <div className="flex flex-col gap-1.5 justify-end">
                          <div className="flex items-center gap-1.5">
                            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amt" className="w-20 input py-1 text-xs tabular" />
                            <button onClick={() => adjust(u.id, 'credit')} className="w-7 h-7 rounded-lg bg-emeraldwin-500/20 border border-emeraldwin-500/40 grid place-items-center"><Plus className="w-3.5 h-3.5 text-emeraldwin-400" /></button>
                            <button onClick={() => adjust(u.id, 'debit')} className="w-7 h-7 rounded-lg bg-coral-500/20 border border-coral-500/40 grid place-items-center"><Minus className="w-3.5 h-3.5 text-coral-400" /></button>
                            <button onClick={() => { setAdjustId(null); setAmount(''); setReason(''); }} className="text-[10px] text-slate-400 hover:text-white px-1">✕</button>
                          </div>
                          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for adjustment..." className="input py-1 text-xs w-full" />
                        </div>
                      ) : (
                        <button
                          onClick={() => setAdjustId(u.id)}
                          className="text-xs font-semibold text-neon-300 hover:text-neon-200"
                        >
                          Adjust
                        </button>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => setAdjustHistoryUserId(u.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white text-[10px] font-semibold"
                          title="Adjust History"
                        >
                          <Clock className="w-3 h-3" /> History
                        </button>
                        <button
                          onClick={() => setViewingId(u.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neon-500/15 border border-neon-500/40 text-neon-300 hover:text-neon-200 text-xs font-semibold"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>
                      </div>
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

      {adjustHistoryUserId && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display font-bold text-sm text-white">Adjust History for {users.find(u => u.id === adjustHistoryUserId)?.account ?? adjustHistoryUserId}</h3>
            <button onClick={() => setAdjustHistoryUserId(null)} className="text-xs text-slate-400 hover:text-white">✕ Close</button>
          </div>
          <BalanceHistoryTab filterUserId={adjustHistoryUserId} />
        </div>
      )}

      {viewing && <UserProfileModal user={viewing} onClose={() => setViewingId(null)} />}
    </div>
  );
}
