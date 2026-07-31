import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Wallet, X, Info, Copy, Coins, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth, useBalance } from '../lib/hooks';
import { supabase } from '../integrations/supabase/client';
import { useManualMethods } from '../lib/cmsHooks';
import type { ManualMethod, CryptoCurrency } from '../lib/cms';
import { store } from '../lib/store';

interface Props {
  flow: 'deposit' | 'withdrawal';
  open: boolean;
  onClose: () => void;
}

type PopupKind = 'error' | 'success';
interface PopupState { title: string; body: string; kind: PopupKind; }

export default function PaymentMethodFlow({ flow, open, onClose }: Props) {
  const session = useAuth();
  const balance = useBalance();
  const methods = useManualMethods();
  const flowMethods = useMemo(
    () => methods.filter((m) => (m.flow === flow || (!m.flow && flow === 'deposit')) && m.active),
    [methods, flow],
  );
  const [selected, setSelected] = useState<ManualMethod | null>(null);
  const [selectedCrypto, setSelectedCrypto] = useState<CryptoCurrency | null>(null);
  const [amount, setAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [destination, setDestination] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const popupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedRef = useRef<ManualMethod | null>(null);
  selectedRef.current = selected;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const showPopup = (title: string, body: string, kind: PopupKind = 'error') => {
    if (popupTimer.current) clearTimeout(popupTimer.current);
    if (popupFadeTimer.current) clearTimeout(popupFadeTimer.current);
    setPopup({ title, body, kind });
    setPopupVisible(true);
    popupTimer.current = setTimeout(() => {
      setPopupVisible(false);
      popupFadeTimer.current = setTimeout(() => setPopup(null), 300);
    }, 2500);
  };

  useEffect(() => () => {
    if (popupTimer.current) clearTimeout(popupTimer.current);
    if (popupFadeTimer.current) clearTimeout(popupFadeTimer.current);
  }, []);

  useEffect(() => {
    if (open) {
      setSelected(null);
      setSelectedCrypto(null);
      setAmount('');
      setUtr('');
      setDestination('');
      setDetails('');
      setSubmitting(false);
    }
  }, [open]);

  // Mobile back button
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ pmf: true }, '');
    const onPop = () => {
      if (selectedRef.current) {
        setSelected(null);
        setSelectedCrypto(null);
        window.history.pushState({ pmf: true }, '');
      } else {
        onCloseRef.current();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open]);

  if (!open) return null;

  const user = session?.username ?? 'guest';
  const userId = session?.userId ?? null;
  const title = flow === 'deposit' ? 'Deposit' : 'Withdrawal';

  const getEffectiveLimits = (): { min: number; max: number; gasFee?: number } => {
    if (!selected) return { min: 0, max: Infinity };
    if (selected.kind === 'crypto' && selectedCrypto) {
      const cc = selectedCrypto;
      if (flow === 'deposit') {
        return { min: cc.minDeposit > 0 ? cc.minDeposit : selected.minAmount, max: cc.maxDeposit > 0 ? cc.maxDeposit : selected.maxAmount, gasFee: cc.gasFee || 0 };
      } else {
        return { min: cc.minWithdrawal > 0 ? cc.minWithdrawal : selected.minAmount, max: cc.maxWithdrawal > 0 ? cc.maxWithdrawal : selected.maxAmount, gasFee: cc.gasFee || 0 };
      }
    }
    return { min: selected.minAmount || 0, max: selected.maxAmount || Infinity };
  };

  const handleBackToMethodList = () => { setSelected(null); setSelectedCrypto(null); };

  const resetForm = () => {
    setAmount('');
    setUtr('');
    setDestination('');
    setDetails('');
    setSelectedCrypto(null);
    setSubmitting(false);
    setSelected(null);
  };

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && 'preventDefault' in e) e.preventDefault();
    if (!selected || submitting) return;

    const amt = Number(amount);
    const limits = getEffectiveLimits();

    if (!amt || amt <= 0) { showPopup('Enter Amount', 'Amount must be greater than 0.'); return; }
    if (limits.min > 0 && amt < limits.min) { showPopup('Invalid Amount', `Minimum ${flow} amount is ${store.currency}${limits.min}.`); return; }
    if (limits.max > 0 && limits.max < Infinity && amt > limits.max) { showPopup('Invalid Amount', `Maximum ${flow} amount is ${store.currency}${limits.max}.`); return; }
    if (flow === 'withdrawal' && amt > balance) { showPopup('Insufficient Balance', `Available: ${store.currency}${balance.toFixed(2)}`); return; }

    if (selected.kind === 'upi') {
      if (flow === 'withdrawal' && !destination.trim()) { showPopup('UPI ID Required', 'Enter your UPI ID.'); return; }
    } else if (selected.kind === 'bank') {
      if (flow === 'withdrawal' && !destination.trim()) { showPopup('Account Details Required', 'Enter your bank account number.'); return; }
    } else if (selected.kind === 'crypto') {
      if (!selectedCrypto) { showPopup('Select Currency', 'Please select a crypto currency.'); return; }
      if (flow === 'withdrawal' && !destination.trim()) { showPopup('Wallet Address Required', 'Enter your withdrawal wallet address.'); return; }
    }

    if (flow === 'deposit' && !utr.trim()) { showPopup('UTR / Ref Required', 'Enter your UTR / Transaction Reference ID.'); return; }

    setSubmitting(true);

    try {
      let destLabel = selected.label;
      const destDetails: Record<string, string> = { amount: String(amt) };

      if (selected.kind === 'upi') {
        if (destination.trim()) destDetails['upiId'] = destination.trim();
      } else if (selected.kind === 'bank') {
        if (destination.trim()) { destDetails['accountNumber'] = destination.trim(); destDetails['ifsc'] = details.trim(); }
      } else if (selected.kind === 'crypto' && selectedCrypto) {
        destLabel = `${selected.label} - ${selectedCrypto.name} (${selectedCrypto.network})`;
        destDetails['currency'] = selectedCrypto.name;
        destDetails['network'] = selectedCrypto.network;
        destDetails['walletAddress'] = destination.trim();
        destDetails['gasFee'] = String(selectedCrypto.gasFee || 0);
      }

      const meta: Record<string, unknown> = {
        username: user,
        method: destLabel,
        ...(utr.trim() ? { utr: utr.trim() } : {}),
        details: JSON.stringify(destDetails),
      };

      if (flow === 'withdrawal') {
        const newBal = Math.max(0, balance - amt);
        if (userId) await supabase.from('profiles').update({ balance: newBal }).eq('id', userId);
        store.debitLocalOnly(amt);
      }

      const { error: insertErr } = await supabase.from('transactions').insert({
        user_id: userId ?? null,
        type: flow,
        amount: amt,
        reference: `${user} - ${destLabel}`,
        status: 'pending',
        metadata: meta,
      });

      if (insertErr) {
        if (flow === 'withdrawal' && userId) {
          await supabase.from('profiles').update({ balance: balance }).eq('id', userId);
          store.creditLocalOnly(amt);
        }
        showPopup('Submission Failed', insertErr.message || 'Please try again.');
        setSubmitting(false);
        return;
      }

      resetForm();
      showPopup(
        flow === 'deposit' ? 'Deposit Submitted!' : 'Withdrawal Requested!',
        flow === 'deposit' ? 'Request received. Processing soon.' : 'Your request has been submitted.',
        'success',
      );

    } catch (err) {
      console.error('[PaymentMethodFlow] submit error:', err);
      setSubmitting(false);
      showPopup('Submission Failed', 'Something went wrong. Please try again.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => { alert('Copied!'); }).catch(() => {});
  };

  // Inline toast — rendered inside the page, no portal, no z-index conflict
  const inlineToast = popup ? (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[220] pointer-events-none w-[calc(100%-32px)] max-w-[340px]"
      style={{
        opacity: popupVisible ? 1 : 0,
        transform: `translateX(-50%) translateY(${popupVisible ? '0' : '12px'})`,
        transition: 'opacity 0.25s ease, transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <div
        className="overflow-hidden rounded-xl shadow-xl"
        style={{
          background: 'linear-gradient(145deg, #1e1e2e, #16162a)',
          border: popup.kind === 'success' ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(239,68,68,0.35)',
        }}
      >
        <div className="h-[3px]" style={{ background: popup.kind === 'success' ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#ef4444,#f97316)' }} />
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
            style={popup.kind === 'success'
              ? { background: 'rgba(16,185,129,0.15)', border: '1.5px solid rgba(16,185,129,0.35)' }
              : { background: 'rgba(239,68,68,0.15)', border: '1.5px solid rgba(239,68,68,0.35)' }}>
            {popup.kind === 'success'
              ? <CheckCircle2 className="w-4 h-4" style={{ color: '#34d399' }} />
              : <AlertTriangle className="w-4 h-4" style={{ color: '#f87171' }} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-[13px] leading-tight">{popup.title}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{popup.body}</p>
          </div>
        </div>
        <div className="px-4 pb-2">
          <div className="h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full" style={{
              background: popup.kind === 'success' ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#ef4444,#f97316)',
              animation: 'pmfshrink 2.5s linear forwards',
            }} />
          </div>
        </div>
      </div>
      <style>{`@keyframes pmfshrink{from{width:100%}to{width:0%}}`}</style>
    </div>
  ) : null;

  if (!selected) {
    return (
      <div className="fixed inset-0 z-[200] pointer-events-auto flex flex-col bg-slatepanel-900">
        {inlineToast}
        <div className="flex items-center justify-between px-4 py-3 border-b border-borderline-900 flex-shrink-0">
          <h3 className="font-display font-bold text-white flex items-center gap-2">
            <Wallet className="w-4 h-4 text-neon-400" /> Select {title} Method
          </h3>
          <button
            onClick={() => onCloseRef.current()}
            className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-slate-300" />
          </button>
        </div>
        <div className="p-4 space-y-3 flex-1 overflow-y-auto scrollbar-thin">
          {flowMethods.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <p className="text-sm text-slate-400">No {title.toLowerCase()} methods available right now.</p>
              <p className="text-xs text-slate-500">Please check again later.</p>
            </div>
          ) : (
            flowMethods.map((m) => {
              const kindIcon = m.kind === 'upi' ? '📱' : m.kind === 'bank' ? '🏦' : m.kind === 'crypto' ? '🪙' : '📄';
              const kindColor = m.kind === 'upi' ? 'border-neon-400/30 hover:border-neon-400/60' :
                m.kind === 'bank' ? 'border-amberx-500/30 hover:border-amberx-500/60' :
                m.kind === 'crypto' ? 'border-blue-400/30 hover:border-blue-400/60' :
                'border-borderline-900 hover:border-neon-400/60';
              return (
                <button key={m.id} onClick={() => setSelected(m)}
                  className={`w-full text-left px-4 py-4 rounded-xl border transition-all bg-slatepanel-800 text-white font-semibold hover:bg-slatepanel-700 text-base cursor-pointer ${kindColor}`}
                >
                  <div className="flex items-center justify-between">
                    <div><span className="mr-2">{kindIcon}</span>{m.label}</div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      {m.minAmount > 0 && `Min ${store.currency}${m.minAmount}`}
                      {m.maxAmount > 0 && m.maxAmount < Infinity && ` · Max ${store.currency}${m.maxAmount}`}
                    </div>
                  </div>
                  {m.kind === 'crypto' && m.cryptoCurrencies && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {m.cryptoCurrencies.map((cc) => (
                        <span key={cc.id} className="chip text-[9px] bg-blue-500/10 text-blue-300 border border-blue-500/20">
                          {cc.name} ({cc.network})
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  const limits = getEffectiveLimits();

  return (
    <div className="fixed inset-0 z-[210] pointer-events-auto flex flex-col bg-slatepanel-900">
      {inlineToast}
      <div className="flex items-center justify-between px-4 py-3 border-b border-borderline-900 flex-shrink-0 bg-slatepanel-900">
        <div className="flex items-center gap-3">
          <button onClick={handleBackToMethodList} className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60 transition-colors cursor-pointer">
            <ArrowLeft className="w-4 h-4 text-slate-300" />
          </button>
          <div>
            <h3 className="font-display font-bold text-white text-sm">{selected.label}</h3>
            <p className="text-[10px] text-slate-500 capitalize">{selected.kind} · {title}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500">Balance</p>
          <p className="font-display font-bold text-sm text-emeraldwin-400">{store.currency}{balance.toFixed(2)}</p>
        </div>
      </div>

      <form onSubmit={(e) => { void handleSubmit(e); }} className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">Amount ({store.currency})</label>
          <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="input w-full py-3 text-lg font-bold" />
          <div className="flex items-center gap-2 mt-2">
            {limits.min > 0 && <span className="chip text-[10px] bg-slatepanel-800 text-slate-400">Min: {store.currency}{limits.min}</span>}
            {limits.max > 0 && limits.max < Infinity && <span className="chip text-[10px] bg-slatepanel-800 text-slate-400">Max: {store.currency}{limits.max}</span>}
            {limits.gasFee && limits.gasFee > 0 && <span className="chip text-[10px] bg-amberx-500/15 text-amberx-300">⛽ Gas Fee: {limits.gasFee}</span>}
          </div>
          {flow === 'withdrawal' && limits.gasFee && limits.gasFee > 0 && Number(amount) > 0 && (
            <p className="text-[10px] text-amberx-300 mt-1">You will receive approximately {store.currency}{(Number(amount) - limits.gasFee).toFixed(2)} after gas fee deduction.</p>
          )}
        </div>

        {selected.kind === 'upi' && (
          <div className="space-y-3">
            {flow === 'deposit' && (
              <div className="panel-inner p-4 rounded-xl bg-midnight-850 border border-borderline-900">
                <h4 className="text-xs font-semibold text-neon-300 mb-2">Pay to this UPI ID</h4>
                <div className="flex items-center justify-between bg-slatepanel-800 rounded-lg p-3">
                  <div>
                    <p className="text-sm font-bold text-white font-mono">{selected.upiId || '—'}</p>
                    {selected.upiDisplayName && <p className="text-[10px] text-slate-400">{selected.upiDisplayName}</p>}
                  </div>
                  <button type="button" onClick={() => copyToClipboard(selected.upiId || '')} className="btn-ghost px-2 py-1 cursor-pointer">
                    <Copy className="w-4 h-4 text-neon-400" />
                  </button>
                </div>
              </div>
            )}
            {flow === 'withdrawal' && (
              <div>
                <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">Your UPI ID (VPA)</label>
                <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="yourname@upi" className="input w-full py-3" />
              </div>
            )}
            {flow === 'deposit' && (
              <div>
                <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">
                  UTR / Transaction Ref <span className="text-coral-400">*</span>
                </label>
                <input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="e.g. UTR123456789" className="input w-full py-3" />
              </div>
            )}
          </div>
        )}

        {selected.kind === 'bank' && (
          <div className="space-y-3">
            {flow === 'deposit' && (
              <div className="panel-inner p-4 rounded-xl bg-midnight-850 border border-borderline-900 space-y-2">
                <h4 className="text-xs font-semibold text-amberx-300 mb-2">Bank Transfer Details</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-[10px] text-slate-500">Bank Name</p><p className="text-white font-semibold">{selected.bankName || '—'}</p></div>
                  <div><p className="text-[10px] text-slate-500">Account No.</p><p className="text-white font-semibold font-mono">{selected.accountNumber || '—'}</p></div>
                  <div><p className="text-[10px] text-slate-500">IFSC</p><p className="text-white font-semibold font-mono">{selected.ifsc || '—'}</p></div>
                  <div><p className="text-[10px] text-slate-500">Holder</p><p className="text-white font-semibold">{selected.holderName || '—'}</p></div>
                </div>
                <button type="button" onClick={() => copyToClipboard(`Bank: ${selected.bankName}\nA/C: ${selected.accountNumber}\nIFSC: ${selected.ifsc}\nHolder: ${selected.holderName}`)} className="btn-ghost px-2 py-1 text-xs mt-2 cursor-pointer">
                  <Copy className="w-3.5 h-3.5 mr-1" /> Copy Details
                </button>
              </div>
            )}
            {flow === 'withdrawal' && (
              <>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">Your Account Number</label>
                  <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Enter your bank account number" className="input w-full py-3" />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">Bank Name / IFSC</label>
                  <input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="SBI / SBIN0001234" className="input w-full py-3" />
                </div>
              </>
            )}
            {flow === 'deposit' && (
              <div>
                <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">
                  UTR / Transaction Ref <span className="text-coral-400">*</span>
                </label>
                <input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="UTR or Transaction Reference ID" className="input w-full py-3" />
              </div>
            )}
          </div>
        )}

        {selected.kind === 'crypto' && (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">Select Currency</label>
              <div className="grid grid-cols-2 gap-2">
                {(selected.cryptoCurrencies || []).map((cc) => (
                  <button key={cc.id} type="button" onClick={() => setSelectedCrypto(cc)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${selectedCrypto?.id === cc.id ? 'bg-blue-500/15 border-blue-400 text-white' : 'bg-slatepanel-800 border-borderline-900 text-slate-300 hover:border-blue-400/50'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Coins className={`w-4 h-4 ${selectedCrypto?.id === cc.id ? 'text-blue-400' : 'text-slate-500'}`} />
                      <div><p className="text-sm font-semibold">{cc.name}</p><p className="text-[10px] text-slate-500">{cc.network}</p></div>
                    </div>
                    {cc.gasFee > 0 && <p className="text-[9px] text-amberx-300 mt-1">Gas: {cc.gasFee}</p>}
                  </button>
                ))}
              </div>
            </div>
            {selectedCrypto && flow === 'deposit' && (
              <div className="panel-inner p-4 rounded-xl bg-midnight-850 border border-borderline-900 space-y-2">
                <h4 className="text-xs font-semibold text-blue-300 mb-2">Send to this Address</h4>
                <div className="bg-slatepanel-800 rounded-lg p-3">
                  <p className="text-[10px] text-slate-500">Network: {selectedCrypto.network}</p>
                  <p className="text-xs font-mono text-white break-all mt-1">{selectedCrypto.walletAddress || '—'}</p>
                  {selectedCrypto.gasFee > 0 && <p className="text-[10px] text-amberx-300 mt-1">Network Gas Fee: {selectedCrypto.gasFee}</p>}
                </div>
                <button type="button" onClick={() => copyToClipboard(selectedCrypto.walletAddress)} className="btn-ghost px-2 py-1 text-xs flex items-center gap-1 cursor-pointer">
                  <Copy className="w-3.5 h-3.5 text-blue-400" /> Copy Address
                </button>
              </div>
            )}
            {selectedCrypto && flow === 'withdrawal' && (
              <div>
                <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">
                  Your {selectedCrypto.name} Wallet Address ({selectedCrypto.network})
                </label>
                <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={`Enter your ${selectedCrypto.network} wallet address`} className="input w-full py-3 font-mono text-xs" />
                {selectedCrypto.gasFee > 0 && (
                  <p className="text-[10px] text-amberx-300 mt-1 flex items-center gap-1">
                    <Info className="w-3 h-3" /> Gas fee of {selectedCrypto.gasFee} will be deducted from your withdrawal.
                  </p>
                )}
              </div>
            )}
            {flow === 'deposit' && (
              <div>
                <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">
                  Transaction Hash / Ref <span className="text-coral-400">*</span>
                </label>
                <input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="Enter transaction hash (TXID)" className="input w-full py-3 font-mono text-xs" />
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={submitting}
          onClick={(e) => { void handleSubmit(e); }}
          className="w-full py-4 flex items-center justify-center gap-2 text-base font-semibold rounded-xl transition-all bg-green-500 hover:bg-green-600 disabled:opacity-60 disabled:cursor-not-allowed text-white shadow-lg shadow-green-500/30 cursor-pointer"
        >
          {submitting
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting…</>
            : (flow === 'deposit' ? 'Submit Deposit Request' : 'Request Withdrawal')}
        </button>
      </form>
    </div>
  );
}
