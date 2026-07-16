import { useState } from 'react';
import type { Route } from '../components/BottomNav';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useBalance, useAuth } from '../lib/hooks';
import { store } from '../lib/store';
import { useFinance } from '../lib/cmsHooks';
import { useWallet } from '../lib/hooks/useWallet';
import PaymentMethodFlow from '../components/PaymentMethodFlow';

interface Props { onNavigate: (r: Route) => void; }

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function WalletView({ onNavigate }: Props) {
  const balance = useBalance();
  const session = useAuth();
  const finance = useFinance();
  const supabaseWallet = useWallet();
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);

  const user = session?.username ?? 'guest';
  
  // Use Supabase wallet balance if available, fallback to local balance
  const displayBalance = supabaseWallet.balance ?? balance;

  const transactions = [...finance.deposits, ...finance.withdrawals]
    .filter((t) => t.user === user)
    .sort((a, b) => b.ts - a.ts);

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="font-display font-bold text-xl text-white">Wallet</h2>
      <div className="panel p-5 space-y-1">
        <p className="text-xs text-slate-400 uppercase tracking-wider">Total Balance</p>
        <p className="tabular font-black text-3xl text-emeraldwin-400">{store.currency}{displayBalance.toLocaleString('en-IN')}</p>
        {supabaseWallet.loading && <p className="text-xs text-slate-500">Syncing...</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onNavigate?.('deposit')} className="btn-emerald w-full py-4 flex flex-col items-center gap-1 font-bold text-base rounded-xl">
          <TrendingUp className="w-5 h-5" /> Deposit
        </button>
        <button onClick={() => setWithdrawalOpen(true)} className="btn-emerald w-full py-4 flex flex-col items-center gap-1 font-bold text-base rounded-xl">
          <TrendingDown className="w-5 h-5" /> Withdraw
        </button>
      </div>
      <div className="panel p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-300">Recent Transactions</h3>
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">No transactions yet.</p>
        ) : (
          transactions.slice(0, 20).map((t) => {
            const isDeposit = 'method' in t;
            const amount = t.amount;
            const statusLabel = t.status === 'approved' ? 'Success' : t.status === 'cancelled' ? 'Cancelled' : t.status === 'processing' ? 'Processing' : t.status === 'rejected' ? 'Failed' : t.status;
            const statusColor = t.status === 'approved' ? 'text-emeraldwin-400' : t.status === 'processing' ? 'text-amberx-300' : t.status === 'cancelled' || t.status === 'rejected' ? 'text-coral-400' : 'text-slate-500';
            return (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-borderline-900 last:border-0">
                <span className={`tabular font-bold text-sm ${isDeposit ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                  {isDeposit ? '+' : '-'}{fmt(amount)}
                </span>
                <span className={`text-xs capitalize ${statusColor}`}>{statusLabel}</span>
              </div>
            );
          })
        )}
      </div>

      <PaymentMethodFlow flow="withdrawal" open={withdrawalOpen} onClose={() => setWithdrawalOpen(false)} />
    </div>
  );
}
