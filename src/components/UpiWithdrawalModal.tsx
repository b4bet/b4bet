import { useEffect, useState } from 'react';
import { X, Wallet, Send, CheckCircle2 } from 'lucide-react';
import { useAuth, useBalance } from '../lib/hooks';
import { cms } from '../lib/cms';
import { useWithdrawalHtml } from '../lib/cmsHooks';
import { store } from '../lib/store';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function UpiWithdrawalModal({ open, onClose }: Props) {
  const session = useAuth();
  const balance = useBalance();
  const html    = useWithdrawalHtml();

  const [upiId,     setUpiId]     = useState('');
  const [upiName,   setUpiName]   = useState('');
  const [amount,    setAmount]    = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setAmount('');
      setUpiId('');
      setUpiName('');
    }
  }, [open]);

  if (!open) return null;

  const user = session?.username ?? 'guest';

  const submit = () => {
    const amt = Number(amount);
    if (!upiId.trim()) {
      cms.toast({ title: 'UPI ID required', body: 'Enter your UPI ID.', kind: 'alert' });
      return;
    }
    if (!upiName.trim()) {
      cms.toast({ title: 'Account name required', body: 'Enter the name registered on your UPI.', kind: 'alert' });
      return;
    }
    if (!amt || amt <= 0) {
      cms.toast({ title: 'Enter amount', body: 'Amount must be greater than 0.', kind: 'alert' });
      return;
    }
    if (amt > balance) {
      cms.toast({ title: 'Insufficient balance', body: `Available: ${store.currency}${balance.toFixed(2)}`, kind: 'alert' });
      return;
    }
    // Pass details as JSON string so extractUpiId() and extractUpiName() can parse it
    const details = JSON.stringify({ upiId: upiId.trim(), upiName: upiName.trim(), amount: String(amt) });
    cms.submitWithdrawal(user, amt, upiId.trim(), details);
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slatepanel-900 border border-borderline-900 rounded-2xl w-full max-w-sm flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-borderline-900">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-neon-400" />
            <span className="font-bold text-white">UPI Withdrawal</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <div className="font-bold text-white text-lg">Request Submitted</div>
            <div className="text-slate-400 text-sm">Your withdrawal request is pending admin approval.</div>
            <button onClick={onClose} className="mt-2 px-6 py-2 rounded-xl bg-neon-500/20 border border-neon-400/40 text-neon-300 font-semibold text-sm">Done</button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-6 overflow-hidden gap-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Select withdrawal method</p>

            {/* Admin editable HTML */}
            <div className="text-sm text-slate-300" dangerouslySetInnerHTML={{ __html: html }} />

            {/* Balance */}
            <div className="flex items-center justify-between bg-slate-800/60 rounded-xl px-4 py-2.5 border border-slate-700/50">
              <span className="text-xs text-slate-400">Available Balance</span>
              <span className="font-bold text-white">{store.currency}{balance.toFixed(2)}</span>
            </div>

            {/* UPI ID */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">UPI ID (VPA)</label>
              <input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="yourname@upi"
                className="input w-full py-3 text-base"
              />
            </div>

            {/* UPI Account Name */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">Account Name (as on UPI)</label>
              <input
                value={upiName}
                onChange={(e) => setUpiName(e.target.value)}
                placeholder="e.g. Rafik Shak"
                className="input w-full py-3 text-base"
              />
              <p className="text-[10px] text-slate-500 mt-1">Enter the name exactly as registered on your UPI account.</p>
            </div>

            {/* Amount */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">Amount</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                type="number"
                className="input w-full py-3 text-base"
              />
            </div>

            <button
              onClick={submit}
              className="w-full py-3 rounded-xl bg-neon-500/20 border border-neon-400/40 text-neon-300 font-bold flex items-center justify-center gap-2 hover:bg-neon-500/30 transition-colors"
            >
              <Send className="w-4 h-4" /> Request Withdrawal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
