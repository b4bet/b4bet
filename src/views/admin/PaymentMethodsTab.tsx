import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Edit3, X, Save, ArrowDownCircle, ArrowUpCircle,
  Banknote, Smartphone, Coins, ToggleLeft, ToggleRight,
  TrendingDown, TrendingUp, RefreshCw, Wifi,
} from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';

type MethodFlow = 'deposit' | 'withdrawal';
type MethodKind = 'bank' | 'upi' | 'crypto' | 'custom';

interface CryptoCurrency {
  id: string;
  name: string;
  network: string;
  walletAddress: string;
  gasFee: number;
  minDeposit: number;
  maxDeposit: number;
  minWithdrawal: number;
  maxWithdrawal: number;
}

interface ManualMethod {
  id: string;
  kind: MethodKind;
  flow: MethodFlow;
  label: string;
  is_active: boolean;
  min_amount: number;
  max_amount: number;
  details: Record<string, unknown>;
  sort_order: number;
  created_at: string;
}

type Draft = Omit<ManualMethod, 'id' | 'created_at'>;

const blank = (flow: MethodFlow): Draft => ({
  kind: 'upi', flow, label: '', is_active: true,
  min_amount: 0, max_amount: 0, details: {}, sort_order: 0,
});

const flowMeta: Record<MethodFlow, { label: string; icon: typeof ArrowDownCircle; accent: string }> = {
  deposit:    { label: 'Deposit',    icon: ArrowDownCircle, accent: 'text-emeraldwin-400' },
  withdrawal: { label: 'Withdrawal', icon: ArrowUpCircle,   accent: 'text-coral-400' },
};

const kindMeta: Record<MethodKind, { label: string; icon: typeof Banknote }> = {
  bank:   { label: 'Bank',   icon: Banknote },
  upi:    { label: 'UPI',    icon: Smartphone },
  crypto: { label: 'Crypto', icon: Coins },
  custom: { label: 'Custom', icon: Banknote },
};

export default function PaymentMethodsTab() {
  const [methods, setMethods] = useState<ManualMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [activeTab, setActiveTab] = useState<MethodFlow>('deposit');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_manual_methods');
      if (error) throw error;
      setMethods((data ?? []) as ManualMethod[]);
    } catch (e) {
      console.error('[PaymentMethodsTab] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openNew = (flow: MethodFlow) => setEditing({ id: null, draft: blank(flow) });
  const openEdit = (m: ManualMethod) => setEditing({
    id: m.id,
    draft: { kind: m.kind, flow: m.flow, label: m.label, is_active: m.is_active, min_amount: m.min_amount, max_amount: m.max_amount, details: { ...m.details }, sort_order: m.sort_order },
  });
  const close = () => setEditing(null);

  const saveMethod = async () => {
    if (!editing) return;
    if (!editing.draft.label.trim()) { alert('Method name is required.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('admin_upsert_manual_method', {
        p_id: editing.id ?? null,
        p_kind: editing.draft.kind,
        p_flow: editing.draft.flow,
        p_label: editing.draft.label,
        p_is_active: editing.draft.is_active,
        p_min_amount: editing.draft.min_amount,
        p_max_amount: editing.draft.max_amount,
        p_details: editing.draft.details,
        p_sort_order: editing.draft.sort_order,
      });
      if (error) throw error;
      await load();
      setEditing(null);
    } catch (e) {
      console.error('[PaymentMethodsTab] saveMethod error:', e);
      alert('Save failed. Check console.');
    } finally {
      setSaving(false);
    }
  };

  const deleteMethod = async (id: string) => {
    if (!confirm('Delete this payment method?')) return;
    try {
      const { error } = await supabase.rpc('admin_delete_manual_method', { p_id: id });
      if (error) throw error;
      setMethods((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      console.error('[PaymentMethodsTab] deleteMethod error:', e);
    }
  };

  const toggleActive = async (m: ManualMethod) => {
    try {
      await supabase.rpc('admin_upsert_manual_method', {
        p_id: m.id, p_kind: m.kind, p_flow: m.flow, p_label: m.label,
        p_is_active: !m.is_active, p_min_amount: m.min_amount, p_max_amount: m.max_amount,
        p_details: m.details, p_sort_order: m.sort_order,
      });
      setMethods((prev) => prev.map((x) => x.id === m.id ? { ...x, is_active: !x.is_active } : x));
    } catch (e) {
      console.error('[PaymentMethodsTab] toggleActive error:', e);
    }
  };

  const grouped = (flow: MethodFlow) => methods.filter((m) => m.flow === flow);

  // Crypto sub-editor helpers
  const getCryptoList = (): CryptoCurrency[] => {
    if (!editing) return [];
    return (editing.draft.details.cryptoCurrencies as CryptoCurrency[] | undefined) ?? [];
  };

  const setCryptoList = (list: CryptoCurrency[]) => {
    if (!editing) return;
    setEditing({ ...editing, draft: { ...editing.draft, details: { ...editing.draft.details, cryptoCurrencies: list } } });
  };

  const addCrypto = () => {
    const cc: CryptoCurrency = { id: 'cc_' + Math.random().toString(36).slice(2, 8), name: '', network: '', walletAddress: '', gasFee: 0, minDeposit: 0, maxDeposit: 0, minWithdrawal: 0, maxWithdrawal: 0 };
    setCryptoList([...getCryptoList(), cc]);
  };

  const updateCrypto = (ccId: string, patch: Partial<CryptoCurrency>) => {
    setCryptoList(getCryptoList().map((c) => c.id === ccId ? { ...c, ...patch } : c));
  };

  const removeCrypto = (ccId: string) => {
    setCryptoList(getCryptoList().filter((c) => c.id !== ccId));
  };

  const d = editing?.draft;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white">Payment Methods</h2>
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500">Manage Bank, UPI and Crypto methods. Saved to Supabase.</p>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emeraldwin-300 bg-emeraldwin-500/10 border border-emeraldwin-500/20 px-1.5 py-0.5 rounded-full">
              <Wifi className="w-2.5 h-2.5" /> Supabase
            </span>
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white text-xs font-semibold disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Flow tabs */}
      <div className="flex gap-2">
        {(['deposit', 'withdrawal'] as MethodFlow[]).map((flow) => {
          const Meta = flowMeta[flow];
          return (
            <button key={flow} onClick={() => setActiveTab(flow)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                activeTab === flow ? 'bg-slatepanel-700 border-slate-500 text-white' : 'bg-slatepanel-800 border-borderline-900 text-slate-400 hover:text-white'
              }`}>
              <Meta.icon className={`w-4 h-4 ${Meta.accent}`} />{Meta.label} Methods
            </button>
          );
        })}
      </div>

      {(['deposit', 'withdrawal'] as MethodFlow[]).map((flow) => {
        if (activeTab !== flow) return null;
        const Meta = flowMeta[flow];
        const list = grouped(flow);
        return (
          <div key={flow} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Meta.icon className={`w-4 h-4 ${Meta.accent}`} />
                <h3 className="font-display font-bold text-white text-sm">{Meta.label} Methods</h3>
                <span className="chip text-[10px] bg-slatepanel-800 text-slate-400">{list.length}</span>
              </div>
              <button onClick={() => openNew(flow)} className="btn-primary px-3 py-2 text-sm flex items-center gap-1">
                <Plus className="w-4 h-4" /> Add {Meta.label} Method
              </button>
            </div>

            {loading ? (
              <div className="panel p-6 text-center text-slate-500 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />Loading from Supabase…
              </div>
            ) : list.length === 0 ? (
              <div className="panel p-6 text-center">
                <p className="text-sm text-slate-500">No {flow} methods configured yet.</p>
                <button onClick={() => openNew(flow)} className="btn-primary px-4 py-2 text-sm mt-3 flex items-center gap-1 mx-auto">
                  <Plus className="w-3.5 h-3.5" /> Add First Method
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {list.map((m) => {
                  const Kind = kindMeta[m.kind] || kindMeta.custom;
                  const cryptos = (m.details.cryptoCurrencies as CryptoCurrency[] | undefined) ?? [];
                  return (
                    <div key={m.id} className={`panel p-3 transition-opacity ${m.is_active ? '' : 'opacity-50'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            m.kind === 'bank' ? 'bg-amberx-500/20 text-amberx-400' :
                            m.kind === 'upi' ? 'bg-neon-500/20 text-neon-400' :
                            m.kind === 'crypto' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-slatepanel-700 text-slate-400'
                          }`}>
                            <Kind.icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-white font-semibold truncate">{m.label}</span>
                              <span className="chip text-[9px] bg-slatepanel-700 text-slate-400 uppercase">{m.kind}</span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Min ₹{m.min_amount} · Max ₹{m.max_amount}
                              {m.kind === 'crypto' && cryptos.length > 0 && (
                                <span className="ml-1 text-neon-300">({cryptos.length} currencies)</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button onClick={() => void toggleActive(m)}
                            className={`p-1.5 rounded-lg transition-colors ${m.is_active ? 'text-emeraldwin-400 hover:bg-emeraldwin-500/10' : 'text-slate-500 hover:bg-slatepanel-700'}`}
                            title={m.is_active ? 'Active — click to deactivate' : 'Inactive'}>
                            {m.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                          </button>
                          <button onClick={() => openEdit(m)} className="btn-ghost px-2 py-1.5 text-xs"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => void deleteMethod(m.id)} className="btn-coral px-2 py-1.5 text-xs"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-borderline-900 grid grid-cols-2 gap-1 text-[10px]">
                        {m.kind === 'bank' && (
                          <>
                            <span className="text-slate-500">Bank:</span><span className="text-slate-300">{(m.details.bankName as string) || '—'}</span>
                            <span className="text-slate-500">A/C No:</span><span className="text-slate-300">{(m.details.accountNumber as string) || '—'}</span>
                            <span className="text-slate-500">IFSC:</span><span className="text-slate-300">{(m.details.ifsc as string) || '—'}</span>
                            <span className="text-slate-500">Holder:</span><span className="text-slate-300">{(m.details.holderName as string) || '—'}</span>
                          </>
                        )}
                        {m.kind === 'upi' && (
                          <>
                            <span className="text-slate-500">UPI ID:</span><span className="text-slate-300">{(m.details.upiId as string) || '—'}</span>
                            <span className="text-slate-500">Display:</span><span className="text-slate-300">{(m.details.upiDisplayName as string) || '—'}</span>
                          </>
                        )}
                        {m.kind === 'crypto' && cryptos.map((cc) => (
                          <div key={cc.id} className="col-span-2 flex items-center gap-2 py-0.5">
                            <span className="chip text-[9px] bg-blue-500/15 text-blue-300">{cc.name}</span>
                            <span className="text-slate-500">{cc.network}</span>
                            {cc.gasFee > 0 && <span className="text-amberx-300">Gas: {cc.gasFee}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Edit/New modal */}
      {editing && d && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="w-full max-w-lg panel border border-borderline-900 bg-midnight-900 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-borderline-900 sticky top-0 bg-midnight-900 rounded-t-2xl">
              <h3 className="font-display font-bold text-white">{editing.id ? 'Edit Method' : 'New Method'}</h3>
              <button onClick={close} className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60">
                <X className="w-4 h-4 text-slate-300" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Basic fields */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] uppercase text-slate-500 font-semibold">Flow</label>
                  <select value={d.flow} onChange={(e) => setEditing({ ...editing, draft: { ...d, flow: e.target.value as MethodFlow } })}
                    className="input mt-1 w-full text-sm">
                    <option value="deposit">Deposit</option>
                    <option value="withdrawal">Withdrawal</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-slate-500 font-semibold">Kind</label>
                  <select value={d.kind} onChange={(e) => setEditing({ ...editing, draft: { ...d, kind: e.target.value as MethodKind } })}
                    className="input mt-1 w-full text-sm">
                    <option value="bank">Bank</option>
                    <option value="upi">UPI</option>
                    <option value="crypto">Crypto</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-slate-500 font-semibold">Name</label>
                  <input value={d.label} onChange={(e) => setEditing({ ...editing, draft: { ...d, label: e.target.value } })}
                    placeholder="e.g. SBI Bank" className="input mt-1 w-full" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={d.is_active}
                      onChange={(e) => setEditing({ ...editing, draft: { ...d, is_active: e.target.checked } })}
                      className="w-4 h-4 rounded accent-neon-400" />
                    <span className="text-xs text-white font-semibold">Active</span>
                  </label>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-slate-500 font-semibold flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Min</label>
                  <input type="number" value={d.min_amount} onChange={(e) => setEditing({ ...editing, draft: { ...d, min_amount: Number(e.target.value) } })}
                    className="input mt-1 w-full" />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-slate-500 font-semibold flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Max</label>
                  <input type="number" value={d.max_amount} onChange={(e) => setEditing({ ...editing, draft: { ...d, max_amount: Number(e.target.value) } })}
                    className="input mt-1 w-full" />
                </div>
              </div>

              {/* Bank fields */}
              {d.kind === 'bank' && (
                <div className="space-y-3 panel-inner p-3 rounded-xl">
                  <h4 className="text-xs font-semibold text-amberx-300 flex items-center gap-1.5"><Banknote className="w-3.5 h-3.5" /> Bank Details</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase text-slate-500 font-semibold">Bank Name</label>
                      <input value={(d.details.bankName as string) || ''} onChange={(e) => setEditing({ ...editing, draft: { ...d, details: { ...d.details, bankName: e.target.value } } })}
                        placeholder="State Bank of India" className="input mt-1 w-full" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-slate-500 font-semibold">Account Number</label>
                      <input value={(d.details.accountNumber as string) || ''} onChange={(e) => setEditing({ ...editing, draft: { ...d, details: { ...d.details, accountNumber: e.target.value } } })}
                        placeholder="12345678901" className="input mt-1 w-full" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-slate-500 font-semibold">IFSC Code</label>
                      <input value={(d.details.ifsc as string) || ''} onChange={(e) => setEditing({ ...editing, draft: { ...d, details: { ...d.details, ifsc: e.target.value } } })}
                        placeholder="SBIN0001234" className="input mt-1 w-full" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-slate-500 font-semibold">Account Holder</label>
                      <input value={(d.details.holderName as string) || ''} onChange={(e) => setEditing({ ...editing, draft: { ...d, details: { ...d.details, holderName: e.target.value } } })}
                        placeholder="Company Name" className="input mt-1 w-full" />
                    </div>
                  </div>
                </div>
              )}

              {/* UPI fields */}
              {d.kind === 'upi' && (
                <div className="space-y-3 panel-inner p-3 rounded-xl">
                  <h4 className="text-xs font-semibold text-neon-300 flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" /> UPI Details</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase text-slate-500 font-semibold">UPI ID (VPA)</label>
                      <input value={(d.details.upiId as string) || ''} onChange={(e) => setEditing({ ...editing, draft: { ...d, details: { ...d.details, upiId: e.target.value } } })}
                        placeholder="merchant@okhdfc" className="input mt-1 w-full" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-slate-500 font-semibold">Display Name</label>
                      <input value={(d.details.upiDisplayName as string) || ''} onChange={(e) => setEditing({ ...editing, draft: { ...d, details: { ...d.details, upiDisplayName: e.target.value } } })}
                        placeholder="PhonePe / GPay" className="input mt-1 w-full" />
                    </div>
                  </div>
                </div>
              )}

              {/* Crypto fields */}
              {d.kind === 'crypto' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-blue-300 flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /> Crypto Currencies</h4>
                    <button onClick={addCrypto} className="btn-primary px-2 py-1 text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Add Currency</button>
                  </div>
                  {getCryptoList().length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">No currencies added.</p>
                  )}
                  {getCryptoList().map((cc, idx) => (
                    <div key={cc.id} className="panel-inner p-3 rounded-xl space-y-3 border border-borderline-900">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">Currency #{idx + 1}</span>
                        <button onClick={() => removeCrypto(cc.id)} className="btn-coral px-2 py-0.5 text-[10px]"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] uppercase text-slate-500 font-semibold">Name (e.g. USDT)</label>
                          <input value={cc.name} onChange={(e) => updateCrypto(cc.id, { name: e.target.value })} placeholder="USDT" className="input mt-1 w-full" />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase text-slate-500 font-semibold">Network</label>
                          <input value={cc.network} onChange={(e) => updateCrypto(cc.id, { network: e.target.value })} placeholder="TRC20" className="input mt-1 w-full" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-slate-500 font-semibold">Wallet Address</label>
                        <input value={cc.walletAddress} onChange={(e) => updateCrypto(cc.id, { walletAddress: e.target.value })}
                          placeholder="TXxx… (your receiving address)" className="input mt-1 w-full font-mono text-xs" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] uppercase text-slate-500 font-semibold">Gas Fee</label>
                          <input type="number" step="any" value={cc.gasFee} onChange={(e) => updateCrypto(cc.id, { gasFee: Number(e.target.value) })} className="input mt-1 w-full" />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase text-slate-500 font-semibold">Min Deposit</label>
                          <input type="number" value={cc.minDeposit} onChange={(e) => updateCrypto(cc.id, { minDeposit: Number(e.target.value) })} className="input mt-1 w-full" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-borderline-900">
                <button onClick={close} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
                <button onClick={() => void saveMethod()} disabled={saving}
                  className="btn-primary px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
                  <Save className="w-4 h-4" />{saving ? 'Saving…' : 'Save Method'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
