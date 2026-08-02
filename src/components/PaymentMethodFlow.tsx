import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Wallet, X, Info, Copy, Coins, AlertTriangle, Loader2, CheckCircle2, QrCode } from 'lucide-react';
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
  const [upiName, setUpiName] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const popupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Copy toast state
  const [copyToast, setCopyToast] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always-fresh refs so closures never go stale
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const selectedRef = useRef<ManualMethod | null>(null);
  selectedRef.current = selected;

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
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  useEffect(() => {
    if (open) {
      setSelected(null);
      setSelectedCrypto(null);
      setAmount('');
      setUtr('');
      setDestination('');
      setUpiName('');
      setDetails('');
      setSubmitting(false);
    }
  }, [open]);

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
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const doClose = () => onCloseRef.current();
  const handleBackToMethodList = () => { setSelected(null); setSelectedCrypto(null); };

  const resetForm = () => {
    setAmount('');
    setUtr('');
    setDestination('');
    setUpiName('');
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

    if (selected.kind === 'upi' && flow === 'withdrawal' && !destination.trim()) { showPopup('UPI ID Required', 'Enter your UPI ID.'); return; }
    if (selected.kind === 'upi' && flow === 'withdrawal' && !upiName.trim()) { showPopup('Account Name Required', 'Enter the name registered on your UPI.'); return; }
    if (selected.kind === 'bank' && flow === 'withdrawal' && !destination.trim()) { showPopup('Account Details Required', 'Enter your bank account number.'); return; }
    if (selected.kind === 'crypto') {
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
        if (upiName.trim()) destDetails['upiName'] = upiName.trim();
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

  // Custom copy toast — no browser alert, only shows "Copy" text
  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
      setCopyToast(true);
      copyTimer.current = setTimeout(() => setCopyToast(false), 1000);
    }).catch(() => {});
  };

  // Minimal copy toast — just "Copy" word, no subtitle
  const copyToastEl = (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${copyToast ? 1 : 0.85})`,
        opacity: copyToast ? 1 : 0,
        transition: 'opacity 0.18s ease, transform 0.18s ease',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <div style={{
        background: 'rgba(16,185,129,0.18)',
        border: '1.5px solid rgba(16,185,129,0.55)',
        borderRadius: 10,
        padding: '8px 20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      }}>
        <p style={{ color: '#34d399', fontWeight: 700, fontSize: 14, margin: 0, letterSpacing: 0.3 }}>Copy</p>
      </div>
    </div>
  );

  const toast = popup ? (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: `translateX(-50%) translateY(${popupVisible ? '0' : '12px'})`,
        opacity: popupVisible ? 1 : 0,
        transition: 'opacity 0.25s ease, transform 0.3s ease',
        width: 'calc(100% - 32px)',
        maxWidth: 340,
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      <div style={{
        overflow: 'hidden',
        borderRadius: 12,
        background: 'linear-gradient(145deg,#1e1e2e,#16162a)',
        border: popup.kind === 'success' ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(239,68,68,0.35)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}>
        <div style={{ height: 3, background: popup.kind === 'success' ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#ef4444,#f97316)' }} />
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: popup.kind === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            border: popup.kind === 'success' ? '1.5px solid rgba(16,185,129,0.35)' : '1.5px solid rgba(239,68,68,0.35)',
          }}>
            {popup.kind === 'success'
              ? <CheckCircle2 style={{ width: 16, height: 16, color: '#34d399' }} />
              : <AlertTriangle style={{ width: 16, height: 16, color: '#f87171' }} />}
          </div>
          <div>
            <p style={{ color: '#fff', fontWeight: 600, fontSize: 13, margin: 0 }}>{popup.title}</p>
            <p style={{ color: '#94a3b8', fontSize: 11, margin: '2px 0 0' }}>{popup.body}</p>
          </div>
        </div>
        <div style={{ padding: '0 16px 8px' }}>
          <div style={{ height: 2, borderRadius: 2, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
            <div style={{
              height: '100%',
              background: popup.kind === 'success' ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#ef4444,#f97316)',
              animation: 'pmfshrink 2.5s linear forwards',
            }} />
          </div>
        </div>
      </div>
      <style>{`@keyframes pmfshrink{from{width:100%}to{width:0%}}`}</style>
    </div>
  ) : null;

  // ── Method list page ──────────────────────────────────────────────────────
  if (!selected) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column' }} className="bg-slatepanel-900">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <h3 className="font-display font-bold text-white" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet style={{ width: 16, height: 16, color: 'var(--color-neon-400, #00ff88)' }} />
            Select {title} Method
          </h3>
          <button type="button" onClick={doClose}
            style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            <X style={{ width: 16, height: 16, color: '#cbd5e1' }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
          {flowMethods.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 48 }}>
              <p className="text-slate-400 text-sm">No {title.toLowerCase()} methods available right now.</p>
              <p className="text-slate-500 text-xs" style={{ marginTop: 4 }}>Please check again later.</p>
            </div>
          ) : (
            flowMethods.map((m) => {
              const kindIcon = m.kind === 'upi' ? '📱' : m.kind === 'bank' ? '🏦' : m.kind === 'crypto' ? '🪙' : '📄';
              return (
                <button key={m.id} type="button" onClick={() => setSelected(m)}
                  style={{ width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{kindIcon} {m.label}</span>
                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>
                      {m.minAmount > 0 && `Min ${store.currency}${m.minAmount}`}
                      {m.maxAmount > 0 && m.maxAmount < Infinity && ` · Max ${store.currency}${m.maxAmount}`}
                    </span>
                  </div>
                  {m.kind === 'crypto' && m.cryptoCurrencies && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                      {m.cryptoCurrencies.map((cc) => (
                        <span key={cc.id} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)' }}>
                          {cc.name} ({cc.network})
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          )}
          {toast}
        </div>
        {copyToastEl}
      </div>
    );
  }

  // ── Form page ─────────────────────────────────────────────────────────────
  const limits = getEffectiveLimits();

  // Get QR URL — check qrDataUrl (mapped from qrImageUrl in account_details) first, then customData JSON
  const upiQrUrl: string | undefined = (() => {
    if (selected.kind !== 'upi' || flow !== 'deposit') return undefined;
    if (selected.qrDataUrl) return selected.qrDataUrl;
    if (selected.customData) {
      try { const obj = JSON.parse(selected.customData) as { qrImageUrl?: string }; if (obj.qrImageUrl) return obj.qrImageUrl; } catch { /* ignore */ }
    }
    return undefined;
  })();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 210, display: 'flex', flexDirection: 'column' }} className="bg-slatepanel-900">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, background: 'var(--bg-slatepanel-900, #0f1225)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={handleBackToMethodList}
            style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            <ArrowLeft style={{ width: 16, height: 16, color: '#cbd5e1' }} />
          </button>
          <div>
            <p className="font-display font-bold text-white text-sm">{selected.label}</p>
            <p style={{ fontSize: 10, color: '#64748b', textTransform: 'capitalize' }}>{selected.kind} · {title}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 10, color: '#64748b' }}>Balance</p>
          <p className="font-display font-bold text-sm text-emeraldwin-400">{store.currency}{balance.toFixed(2)}</p>
        </div>
      </div>

      <form onSubmit={(e) => { void handleSubmit(e); }} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
        {/* Amount */}
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

        {/* UPI fields */}
        {selected.kind === 'upi' && (
          <div className="space-y-3">
            {flow === 'deposit' && (
              <div className="panel-inner p-4 rounded-xl bg-midnight-850 border border-borderline-900">
                <h4 className="text-xs font-semibold text-neon-300 mb-3 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5" /> Pay to this UPI
                </h4>

                {/* QR Code */}
                {upiQrUrl && (
                  <div className="flex flex-col items-center mb-3">
                    <div className="bg-white rounded-xl p-2 shadow-lg">
                      <img
                        src={upiQrUrl}
                        alt="UPI QR Code"
                        className="w-48 h-48 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">Scan with any UPI app to pay</p>
                  </div>
                )}

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
              <>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">Your UPI ID (VPA) <span className="text-coral-400">*</span></label>
                  <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. 9876543210@upi" className="input w-full py-3" />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">Account Holder Name <span className="text-coral-400">*</span></label>
                  <input value={upiName} onChange={(e) => setUpiName(e.target.value)} placeholder="e.g. Rahul Kumar" className="input w-full py-3" />
                  <p className="text-[10px] text-slate-500 mt-1">Enter the exact name linked to your UPI ID</p>
                </div>
              </>
            )}
            {flow === 'deposit' && (
              <div>
                <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">UTR / Transaction Ref <span className="text-coral-400">*</span></label>
                <input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="e.g. UTR123456789" className="input w-full py-3" />
              </div>
            )}
          </div>
        )}

        {/* Bank fields */}
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
                <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">UTR / Transaction Ref <span className="text-coral-400">*</span></label>
                <input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="UTR or Transaction Reference ID" className="input w-full py-3" />
              </div>
            )}
          </div>
        )}

        {/* Crypto fields */}
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
                <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2">Transaction Hash / Ref <span className="text-coral-400">*</span></label>
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

        {toast}
      </form>
      {copyToastEl}
    </div>
  );
}
