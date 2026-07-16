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
  const html = useWithdrawalHtml();
  const [upiId, setUpiId] = useState('');
  const [amount, setAmount] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setAmount('');
      setUpiId('');
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
    if (!amt || amt <= 0) {
      cms.toast({ title: 'Enter amount', body: 'Amount must be greater than 0.', kind: 'alert' });
      return;
    }
    if (amt > balance) {
      cms.toast({ title: 'Insufficient balance', body: `Available: ${store.currency}${balance.toFixed(2)}`, kind: 'alert' });
      return;
    }
    cms.submitWithdrawal(user, amt, upiId.trim());
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 pointer-events-none bg-black/50 sm:bg-transparent">
      <div className="pointer-events-auto w-full h-screen sm:w-full sm:max-w-sm sm:h-[90vh] bg-slatepanel-900 border-none sm:border border-borderline-900 sm:rounded-2xl shadow-2xl animate-slide-up flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-borderline-900 flex-shrink-0">
          <h3 className="font-display font-bold text-white flex items-center gap-2">
            <Wallet className="w-4 h-4 text-coral-400" /> UPI Withdrawal
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60">
            <X className="w-4 h-4 text-slate-300" />
          </button>
        </div>

        {submitted ? (
          <div className="p-6 text-center space-y-3 flex-1 flex flex-col items-center justify-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-emeraldwin-500/15 border border-emeraldwin-500/40 grid place-items-center">
              <CheckCircle2 className="w-7 h-7 text-emeraldwin-400" />
            </div>
            <p className="font-display font-bold text-white">Request Submitted</p>
            <p className="text-xs text-slate-400">Your withdrawal request is pending admin approval.</p>
            <button onClick={onClose} className="btn-primary w-full py-2.5">Done</button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-4">Select withdrawal method</p>
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {/* Admin editable HTML */}
              <div className="bg-white text-black rounded-xl text-xs overflow-hidden mb-4" dangerouslySetInnerHTML={{ __html: html }} />

              <div className="panel p-3 flex items-center justify-between mb-4">
                <span className="text-xs text-slate-400">Available Balance</span>
                <span className="font-display font-bold text-emeraldwin-400">{store.currency}{balance.toFixed(2)}</span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">UPI ID (VPA)</label>
                  <input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="yourname@upi" className="input w-full py-3 text-base" />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">Amount</label>
                  <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="input w-full py-3 text-base" />
                </div>
                <button onClick={submit} className="btn-coral w-full py-4 flex items-center justify-center gap-2 text-base font-semibold">
                  <Send className="w-5 h-5" /> Request Withdrawal
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
