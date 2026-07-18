import { useState, useEffect } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { Trophy, Medal, Crown, RefreshCw } from 'lucide-react';

interface TopUser {
  id: string; username: string; display_name: string;
  total_deposit: number; balance: number; vip_level: number;
}

export default function TopRankingsTab() {
  const [users, setUsers] = useState<TopUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'total_deposit' | 'balance'>('total_deposit');

  useEffect(() => { loadData(); }, [sortBy]);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.rpc('admin_get_profiles');
    const sorted = ((data ?? []) as TopUser[])
      .sort((a, b) => b[sortBy] - a[sortBy])
      .slice(0, 50);
    setUsers(sorted);
    setLoading(false);
  }

  const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
  const fmt = (n: number) => `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Trophy className="w-5 h-5 text-amber-400" />
        <h2 className="text-lg font-bold">Top Rankings</h2>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => setSortBy('total_deposit')}
            className={`px-3 py-1 rounded-lg text-sm transition ${
              sortBy === 'total_deposit' ? 'bg-neon-500/20 text-neon-300' : 'bg-slatepanel-700 text-slate-400'
            }`}>By Deposit</button>
          <button onClick={() => setSortBy('balance')}
            className={`px-3 py-1 rounded-lg text-sm transition ${
              sortBy === 'balance' ? 'bg-neon-500/20 text-neon-300' : 'bg-slatepanel-700 text-slate-400'
            }`}>By Balance</button>
          <button onClick={loadData} className="p-2 bg-slatepanel-700 rounded-lg hover:bg-slatepanel-600 transition">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-neon-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {users.map((u, i) => (
            <div key={u.id} className={`flex items-center gap-4 p-4 rounded-xl ${
              i < 3 ? 'bg-gradient-to-r from-amber-500/10 to-slatepanel-800 border border-amber-500/20' : 'bg-slatepanel-800'
            }`}>
              <span className="text-xl w-8 text-center">{medal(i)}</span>
              <div className="flex-1">
                <div className="font-semibold">{u.display_name ?? u.username}</div>
                <div className="text-slate-400 text-xs">@{u.username} · VIP {u.vip_level}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-neon-300">{fmt(u[sortBy])}</div>
                <div className="text-slate-500 text-xs">{sortBy === 'total_deposit' ? 'Total Deposited' : 'Balance'}</div>
              </div>
            </div>
          ))}
          {users.length === 0 && <div className="text-center py-12 text-slate-500">No users found.</div>}
        </div>
      )}
    </div>
  );
}
