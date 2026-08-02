import { useState } from 'react';
import { useCms }  from '../lib/cmsHooks.ts';
import { useAuth } from '../lib/auth.ts';
import { useBalance } from '../lib/cmsHooks.ts';
import { useWithdrawalHtml } from '../lib/cmsHooks.ts';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function UpiWithdrawalModal({ open, onClose }: Props) {
  const session = useAuth();
  const balance = useBalance();
  const html    = useWithdrawalHtml();
  const cms     = useCms();

  const [amount,    setAmount]    = useState('');
  const [upiId,     setUpiId]     = useState('');
  const [upiName,   setUpiName]   = useState('');
  const [submitted, setSubmitted] = useState(false);

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
    // Store as JSON in details so admin panel can parse upiName
    const details = JSON.stringify({ upiId: upiId.trim(), upiName: upiName.trim(), amount: String(amt) });
    cms.submitWithdrawal(user, amt, upiId.trim(), details);
    setSubmitted(true);
  };

  const reset = () => {
    setAmount('');
    setUpiId('');
    setUpiName('');
    setSubmitted(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={reset} />

      <div className="relative w-full sm:max-w-md bg-panel border border-borderline rounded-t-2xl sm:rounded-2xl p-5 space-y-5 z-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Withdraw via UPI</h2>
          <button onClick={reset} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {submitted ? (
          /* Success state */
          <div className="text-center space-y-3 py-4">
            <div className="text-4xl">✅</div>
            <p className="text-white font-semibold">Request Submitted!</p>
            <p className="text-slate-400 text-sm">Your withdrawal request has been received. It will be processed shortly.</p>
            <button onClick={reset} className="btn-primary w-full mt-2">Close</button>
          </div>
        ) : (
          <>
            {/* Balance */}
            <div className="panel-inner rounded-xl p-3 flex items-center justify-between">
              <span className="text-slate-400 text-sm">Available Balance</span>
              <span className="text-neon-300 font-bold text-lg">₹{(balance / 100).toFixed(2)}</span>
            </div>

            {/* Info HTML from CMS */}
            {html && (
              <div
                className="text-xs text-slate-400 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}

            {/* Amount */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">Amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 500"
                className="input w-full py-3 text-base"
              />
            </div>

            {/* UPI ID */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">UPI ID (VPA)</label>
              <input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="e.g. 9876543210@upi"
                className="input w-full py-3 text-base"
              />
            </div>

            {/* Account Name */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">Account Name (as on UPI) <span className="text-red-400">*</span></label>
              <input
                value={upiName}
                onChange={(e) => setUpiName(e.target.value)}
                placeholder="e.g. Rahul Kumar"
                className="input w-full py-3 text-base"
              />
              <p className="text-[10px] text-slate-500 mt-1">Enter the exact name linked to your UPI ID</p>
            </div>

            {/* Submit */}
            <button
              onClick={submit}
              disabled={!amount || !upiId || !upiName}
              className="btn-primary w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Submit Withdrawal Request
            </button>
          </>
        )}
      </div>
    </div>
  );
}
