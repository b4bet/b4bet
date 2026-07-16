import { useState } from 'react';
import SelectModal from '../../components/SelectModal';
import {
  Plus, Trash2, Edit3, X, Save, ArrowDownCircle, ArrowUpCircle,
  Banknote, Smartphone, Coins, ToggleLeft, ToggleRight,
  TrendingDown, TrendingUp,
} from 'lucide-react';
import { cms } from '../../lib/cms';
import { store } from '../../lib/store';
import { useManualMethods } from '../../lib/cmsHooks';
import type { ManualMethod, ManualMethodFlow, ManualMethodKind, CryptoCurrency } from '../../lib/cms';

type Draft = Omit<ManualMethod, 'id'>;

const blank = (): Draft => ({
  kind: 'upi',
  flow: 'deposit',
  label: '',
  active: true,
  minAmount: 0,
  maxAmount: 0,
  countries: {},
  cryptoCurrencies: [],
});

const flowMeta: Record<ManualMethodFlow, { label: string; icon: typeof ArrowDownCircle; accent: string }> = {
  deposit: { label: 'Deposit', icon: ArrowDownCircle, accent: 'text-emeraldwin-400' },
  withdrawal: { label: 'Withdrawal', icon: ArrowUpCircle, accent: 'text-coral-400' },
};

const kindMeta: Record<ManualMethodKind, { label: string; icon: typeof Banknote }> = {
  bank: { label: 'Bank', icon: Banknote },
  upi: { label: 'UPI', icon: Smartphone },
  crypto: { label: 'Crypto', icon: Coins },
  qr: { label: 'QR Code', icon: Banknote },
  custom: { label: 'Custom', icon: Banknote },
};

export default function PaymentMethodsTab() {
  const methods = useManualMethods();
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [activeTab, setActiveTab] = useState<ManualMethodFlow>('deposit');

  const openNew = (flow: ManualMethodFlow) => {
    const d = blank();
    d.flow = flow;
    setEditing({ id: null, draft: d });
  };
  const openEdit = (m: ManualMethod) => setEditing({ id: m.id, draft: JSON.parse(JSON.stringify(m)) });
  const close = () => setEditing(null);

  const saveMethod = () => {
    if (!editing) return;
    if (!editing.draft.label.trim()) {
      cms.toast({ title: 'Method name required', body: 'Enter a display name like "UPI 1" or "Bank A".', kind: 'alert' });
      return;
    }
    if (editing.id) cms.updateManualMethod(editing.id, editing.draft);
    else cms.addManualMethod(editing.draft);
    setEditing(null);
    cms.toast({ title: 'Method saved', body: editing.draft.label, kind: 'success' });
  };

  const toggleActive = (m: ManualMethod) => {
    cms.updateManualMethod(m.id, { active: !m.active });
  };

  const grouped = (flow: ManualMethodFlow) =>
    methods.filter((m) => m.flow === flow || (!m.flow && flow === 'deposit'));

  // ── Crypto currency sub-editor helpers ──
  const addCryptoCurrency = () => {
    if (!editing) return;
    const newCC: CryptoCurrency = {
      id: 'cc_' + Math.random().toString(36).slice(2, 8),
      name: '',
      network: '',
      walletAddress: '',
      gasFee: 0,
      minDeposit: 0,
      maxDeposit: 0,
      minWithdrawal: 0,
      maxWithdrawal: 0,
    };
    setEditing({
      ...editing,
      draft: {
        ...editing.draft,
        cryptoCurrencies: [...(editing.draft.cryptoCurrencies || []), newCC],
      },
    });
  };

  const updateCryptoCurrency = (ccId: string, patch: Partial<CryptoCurrency>) => {
    if (!editing) return;
    setEditing({
      ...editing,
      draft: {
        ...editing.draft,
        cryptoCurrencies: (editing.draft.cryptoCurrencies || []).map((cc) =>
          cc.id === ccId ? { ...cc, ...patch } : cc
        ),
      },
    });
  };

  const removeCryptoCurrency = (ccId: string) => {
    if (!editing) return;
    setEditing({
      ...editing,
      draft: {
        ...editing.draft,
        cryptoCurrencies: (editing.draft.cryptoCurrencies || []).filter((cc) => cc.id !== ccId),
      },
    });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white">Payment Methods</h2>
          <p className="text-xs text-slate-500">
            Manage Bank, UPI and Crypto methods for deposits & withdrawals. Set min/max amounts per method.
          </p>
        </div>
      </div>

      {/* Flow tabs: Deposit / Withdrawal */}
      <div className="flex gap-2">
        {(['deposit', 'withdrawal'] as ManualMethodFlow[]).map((flow) => {
          const Meta = flowMeta[flow];
          return (
            <button
              key={flow}
              onClick={() => setActiveTab(flow)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                activeTab === flow
                  ? 'bg-slatepanel-700 border-slate-500 text-white'
                  : 'bg-slatepanel-800 border-borderline-900 text-slate-400 hover:text-white'
              }`}
            >
              <Meta.icon className={`w-4 h-4 ${Meta.accent}`} />
              {Meta.label} Methods
            </button>
          );
        })}
      </div>

      {/* Current flow section */}
      {(['deposit', 'withdrawal'] as ManualMethodFlow[]).map((flow) => {
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
              <button onClick={() => openNew(flow)} className="btn-primary px-3 py-2 text-sm">
                <Plus className="w-4 h-4" /> Add {Meta.label} Method
              </button>
            </div>

            {list.length === 0 ? (
              <div className="panel p-6 text-center">
                <p className="text-sm text-slate-500">No {flow} methods configured yet.</p>
                <button onClick={() => openNew(flow)} className="btn-primary px-4 py-2 text-sm mt-3">
                  <Plus className="w-3.5 h-3.5" /> Add First Method
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {list.map((m) => {
                  const Kind = kindMeta[m.kind] || kindMeta.custom;
                  return (
                    <div key={m.id} className={`panel p-3 transition-opacity ${m.active ? '' : 'opacity-50'}`}>
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
                              Min {store.currency}{m.minAmount} · Max {store.currency}{m.maxAmount}
                              {m.kind === 'crypto' && m.cryptoCurrencies && (
                                <span className="ml-1 text-neon-300">({m.cryptoCurrencies.length} currencies)</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => toggleActive(m)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              m.active ? 'text-emeraldwin-400 hover:bg-emeraldwin-500/10' : 'text-slate-500 hover:bg-slatepanel-700'
                            }`}
                            title={m.active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                          >
                            {m.active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                          </button>
                          <button onClick={() => openEdit(m)} className="btn-ghost px-2 py-1.5 text-xs">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => cms.removeManualMethod(m.id)} className="btn-coral px-2 py-1.5 text-xs">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Show details inline */}
                      <div className="mt-2 pt-2 border-t border-borderline-900 grid grid-cols-2 gap-1 text-[10px]">
                        {m.kind === 'bank' && (
                          <>
                            <span className="text-slate-500">Bank:</span><span className="text-slate-300">{m.bankName || '—'}</span>
                            <span className="text-slate-500">A/C No:</span><span className="text-slate-300">{m.accountNumber || '—'}</span>
                            <span className="text-slate-500">IFSC:</span><span className="text-slate-300">{m.ifsc || '—'}</span>
                            <span className="text-slate-500">Holder:</span><span className="text-slate-300">{m.holderName || '—'}</span>
                          </>
                        )}
                        {m.kind === 'upi' && (
                          <>
                            <span className="text-slate-500">UPI ID:</span><span className="text-slate-300">{m.upiId || '—'}</span>
                            <span className="text-slate-500">Display:</span><span className="text-slate-300">{m.upiDisplayName || '—'}</span>
                          </>
                        )}
                        {m.kind === 'crypto' && m.cryptoCurrencies && m.cryptoCurrencies.map((cc) => (
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

      {/* ── Edit / New Modal ── */}
      {editing && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-lg panel border border-borderline-900 bg-midnight-900 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-borderline-900 sticky top-0 bg-midnight-900 rounded-t-2xl">
              <h3 className="font-display font-bold text-white">
                {editing.id ? 'Edit Method' : 'New Method'}
              </h3>
              <button onClick={close} className="w-8 h-8 rounded-lg bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-neon-400/60">
                <X className="w-4 h-4 text-slate-300" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Flow + Kind + Label */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Flow</label>
                  <SelectModal
                    value={editing.draft.flow}
                    options={[
                      { value: 'deposit', label: 'Deposit' },
                      { value: 'withdrawal', label: 'Withdrawal' },
                    ]}
                    onChange={(v) => setEditing({ ...editing, draft: { ...editing.draft, flow: v as ManualMethodFlow } })}
                    className="mt-1 w-full"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Kind</label>
                  <SelectModal
                    value={editing.draft.kind}
                    options={[
                      { value: 'bank', label: 'Bank' },
                      { value: 'upi', label: 'UPI' },
                      { value: 'crypto', label: 'Crypto' },
                    ]}
                    onChange={(v) => {
                      const k = v as ManualMethodKind;
                      setEditing({
                        ...editing,
                        draft: {
                          ...editing.draft,
                          kind: k,
                          cryptoCurrencies: k === 'crypto' ? (editing.draft.cryptoCurrencies || []) : [],
                        },
                      });
                    }}
                    className="mt-1 w-full"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Name</label>
                  <input
                    value={editing.draft.label}
                    onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, label: e.target.value } })}
                    placeholder="e.g. SBI Bank"
                    className="input mt-1 w-full"
                  />
                </div>
              </div>

              {/* Active + Min/Max */}
              <div className="grid grid-cols-4 gap-3">
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editing.draft.active}
                      onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, active: e.target.checked } })}
                      className="w-4 h-4 rounded accent-neon-400"
                    />
                    <span className="text-xs text-white font-semibold">Active</span>
                  </label>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" /> Min Amount
                  </label>
                  <input
                    type="number"
                    value={editing.draft.minAmount || 0}
                    onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, minAmount: Number(e.target.value) } })}
                    placeholder="0"
                    className="input mt-1 w-full"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Max Amount
                  </label>
                  <input
                    type="number"
                    value={editing.draft.maxAmount || 0}
                    onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, maxAmount: Number(e.target.value) } })}
                    placeholder="0"
                    className="input mt-1 w-full"
                  />
                </div>
              </div>

              {/* ── Kind-specific fields ── */}
              {editing.draft.kind === 'bank' && (
                <div className="space-y-3 panel-inner p-3 rounded-xl">
                  <h4 className="text-xs font-semibold text-amberx-300 flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5" /> Bank Details
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase text-slate-500 font-semibold">Bank Name</label>
                      <input
                        value={editing.draft.bankName || ''}
                        onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, bankName: e.target.value } })}
                        placeholder="State Bank of India"
                        className="input mt-1 w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-slate-500 font-semibold">Account Number</label>
                      <input
                        value={editing.draft.accountNumber || ''}
                        onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, accountNumber: e.target.value } })}
                        placeholder="12345678901"
                        className="input mt-1 w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-slate-500 font-semibold">IFSC Code</label>
                      <input
                        value={editing.draft.ifsc || ''}
                        onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, ifsc: e.target.value } })}
                        placeholder="SBIN0001234"
                        className="input mt-1 w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-slate-500 font-semibold">Account Holder</label>
                      <input
                        value={editing.draft.holderName || ''}
                        onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, holderName: e.target.value } })}
                        placeholder="Company Name"
                        className="input mt-1 w-full"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editing.draft.kind === 'upi' && (
                <div className="space-y-3 panel-inner p-3 rounded-xl">
                  <h4 className="text-xs font-semibold text-neon-300 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5" /> UPI Details
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase text-slate-500 font-semibold">UPI ID (VPA)</label>
                      <input
                        value={editing.draft.upiId || ''}
                        onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, upiId: e.target.value } })}
                        placeholder="merchant@okhdfc"
                        className="input mt-1 w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-slate-500 font-semibold">Display Name</label>
                      <input
                        value={editing.draft.upiDisplayName || ''}
                        onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, upiDisplayName: e.target.value } })}
                        placeholder="PhonePe / GPay"
                        className="input mt-1 w-full"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editing.draft.kind === 'crypto' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5" /> Crypto Currencies
                    </h4>
                    <button onClick={addCryptoCurrency} className="btn-primary px-2 py-1 text-xs flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Add Currency
                    </button>
                  </div>
                  {(editing.draft.cryptoCurrencies || []).length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">No crypto currencies added. Click "Add Currency" to add one.</p>
                  )}
                  {(editing.draft.cryptoCurrencies || []).map((cc, idx) => (
                    <div key={cc.id} className="panel-inner p-3 rounded-xl space-y-3 border border-borderline-900">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">Currency #{idx + 1}</span>
                        <button onClick={() => removeCryptoCurrency(cc.id)} className="btn-coral px-2 py-0.5 text-[10px]">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] uppercase text-slate-500 font-semibold">Name (e.g. USDT)</label>
                          <input
                            value={cc.name}
                            onChange={(e) => updateCryptoCurrency(cc.id, { name: e.target.value })}
                            placeholder="USDT"
                            className="input mt-1 w-full"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase text-slate-500 font-semibold">Network (e.g. TRC20)</label>
                          <input
                            value={cc.network}
                            onChange={(e) => updateCryptoCurrency(cc.id, { network: e.target.value })}
                            placeholder="TRC20"
                            className="input mt-1 w-full"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-slate-500 font-semibold">Wallet Address</label>
                        <input
                          value={cc.walletAddress}
                          onChange={(e) => updateCryptoCurrency(cc.id, { walletAddress: e.target.value })}
                          placeholder={editing.draft.flow === 'deposit' ? 'TXxx... (your receiving address)' : '(leave empty — user provides)'}
                          className="input mt-1 w-full font-mono text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] uppercase text-slate-500 font-semibold">Gas Fee (optional)</label>
                          <input
                            type="number"
                            step="any"
                            value={cc.gasFee || 0}
                            onChange={(e) => updateCryptoCurrency(cc.id, { gasFee: Number(e.target.value) })}
                            placeholder="0"
                            className="input mt-1 w-full"
                          />
                        </div>
                      </div>
                      {/* Crypto-specific min/max */}
                      <div className="border-t border-borderline-900 pt-2 mt-2">
                        <p className="text-[10px] uppercase text-slate-500 font-semibold mb-2">Crypto-Specific Limits</p>
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <label className="text-[9px] text-slate-600">Min Deposit</label>
                            <input
                              type="number"
                              value={cc.minDeposit || 0}
                              onChange={(e) => updateCryptoCurrency(cc.id, { minDeposit: Number(e.target.value) })}
                              className="input mt-1 w-full text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-600">Max Deposit</label>
                            <input
                              type="number"
                              value={cc.maxDeposit || 0}
                              onChange={(e) => updateCryptoCurrency(cc.id, { maxDeposit: Number(e.target.value) })}
                              className="input mt-1 w-full text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-600">Min Withdraw</label>
                            <input
                              type="number"
                              value={cc.minWithdrawal || 0}
                              onChange={(e) => updateCryptoCurrency(cc.id, { minWithdrawal: Number(e.target.value) })}
                              className="input mt-1 w-full text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-600">Max Withdraw</label>
                            <input
                              type="number"
                              value={cc.maxWithdrawal || 0}
                              onChange={(e) => updateCryptoCurrency(cc.id, { maxWithdrawal: Number(e.target.value) })}
                              className="input mt-1 w-full text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Save / Cancel */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-borderline-900">
                <button onClick={close} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
                <button onClick={saveMethod} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
                  <Save className="w-4 h-4" /> Save Method
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
