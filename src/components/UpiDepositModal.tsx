import { useEffect, useState } from 'react';
import { X, Smartphone, Send, CheckCircle2, FileText } from 'lucide-react';
import { useAuth } from '../lib/hooks';
import { cms } from '../lib/cms';
import { sanitizeHtml } from '../lib/sanitizeHtml';
import { useManualMethods, useDepositHtml } from '../lib/cmsHooks';
import type { ManualMethod } from '../lib/cms';

interface Props {
  open: boolean;
  onClose: () => void;
}

const kindIcon = { bank: null, upi: Smartphone, qr: null } as const;

export default function UpiDepositModal({ open, onClose }: Props) {
  const session = useAuth();
  const html = useDepositHtml();
  const methods = useManualMethods();
  const depositMethods = methods.filter((m) => m.flow === 'deposit' || (!m.flow && (m.kind === 'upi' || m.kind === 'custom')));
  const [selected, setSelected] = useState<ManualMethod | null>(depositMethods[0] ?? null);
  const [amount, setAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setAmount('');
      setUtr('');
      setSelected(depositMethods[0] ?? null);
    }
  }, [open]);

  if (!open) return null;

  const user = session?.username ?? 'guest';

  const submit = () => {
    const amt = Number(amount);
    if (!selected) return;
    if (!amt || amt <= 0) {
      cms.toast({ title: 'Enter amount', body: 'Amount must be greater than 0.', kind: 'alert' });
      return;
    }
    if (!utr.trim()) {
      cms.toast({ title: 'UTR required', body: 'Enter your UTR / Transaction ID.', kind: 'alert' });
      return;
    }
    cms.submitDeposit(user, amt, selected.label, utr.trim());
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-[200] pointer-events-auto flex flex-col bg-slatepanel-900">
      <div className="w-full h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-borderline-900 flex-shrink-0">
          <h3 className="font-display font-bold text-white flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-neon-400" /> UPI Deposit
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
            <p className="text-xs text-slate-400">Your UPI deposit is pending admin approval.</p>
            <button onClick={onClose} className="btn-primary w-full py-2.5">Done</button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-4">Select deposit method</p>
            {depositMethods.length === 0 ? (
              <p className="text-sm text-slate-400">No UPI or custom method configured.</p>
            ) : (
              <div className="flex-1 flex flex-col gap-3 overflow-y-auto scrollbar-thin">
              {depositMethods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelected(m)}
                  className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl border text-left transition-all ${selected?.id === m.id ? 'bg-neon-500/10 border-neon-400 text-white' : 'bg-slatepanel-800 border-borderline-900 text-slate-300 hover:border-borderline-800'}`}
                >
                  {m.kind === 'custom' ? <FileText className="w-5 h-5 text-coral-300 flex-shrink-0" /> : <Smartphone className="w-5 h-5 text-neon-300 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold truncate">{m.label}</div>
                    <div className="text-xs text-slate-500 truncate">{m.kind === 'custom' ? (m.html ? 'Custom HTML' : 'Text instructions') : m.upiId}</div>
                  </div>
                </button>
              ))
              }
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
