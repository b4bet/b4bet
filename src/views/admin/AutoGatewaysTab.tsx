import { useState } from 'react';
import { Plus, Trash2, Edit3, Save, X, Zap } from 'lucide-react';
import { cms } from '../../lib/cms';
import { useAutoGateways, useCountries } from '../../lib/cmsHooks';
import type { AutoGateway } from '../../lib/cms';

type Draft = Omit<AutoGateway, 'id'>;
const empty: Draft = {
  name: '', secretKey: '', publicKey: '', merchantId: '', webhookUrl: '',
  minDeposit: 100, maxDeposit: 100000, countries: {},
};

export default function AutoGatewaysTab() {
  const gateways = useAutoGateways();
  const countries = useCountries();
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);

  const open = (g?: AutoGateway) => {
    if (g) setEditing({ id: g.id, draft: { ...g } });
    else setEditing({ id: null, draft: { ...empty } });
  };
  const save = () => {
    if (!editing) return;
    if (!editing.draft.name.trim()) {
      cms.toast({ title: 'Name required', body: 'Gateway name is mandatory.', kind: 'alert' });
      return;
    }
    if (editing.id) cms.updateAutoGateway(editing.id, editing.draft);
    else cms.addAutoGateway(editing.draft);
    setEditing(null);
    cms.toast({ title: 'Gateway saved', body: editing.draft.name, kind: 'success' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2"><Zap className="w-5 h-5 text-neon-300" /> Automated Gateways</h2>
          <p className="text-xs text-slate-500">API-driven payment processors with per-country activation.</p>
        </div>
        <button onClick={() => open()} className="btn-primary px-3 py-2 text-sm"><Plus className="w-4 h-4" /> Add Auto Gateway</button>
      </div>

      <div className="panel p-0 overflow-hidden">
        {gateways.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No automated gateways configured yet.</p>
        ) : (
          <div className="divide-y divide-borderline-900">
            {gateways.map((g) => {
              const enabledCount = Object.values(g.countries).filter(Boolean).length;
              return (
                <div key={g.id} className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{g.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      Min ₹{g.minDeposit} · Max ₹{g.maxDeposit} · {enabledCount} country(ies) active
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => open(g)} className="btn-ghost px-2 py-1 text-xs"><Edit3 className="w-3.5 h-3.5" /> Edit</button>
                    <button onClick={() => cms.removeAutoGateway(g.id)} className="btn-coral px-2 py-1 text-xs"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4" onClick={() => setEditing(null)}>
          <div className="panel w-full max-w-lg p-4 max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-white">{editing.id ? 'Edit Gateway' : 'Add Auto Gateway'}</h3>
              <button onClick={() => setEditing(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="Gateway Name" value={editing.draft.name} on={(v) => setEditing({ ...editing, draft: { ...editing.draft, name: v } })} />
              <Field label="Merchant ID" value={editing.draft.merchantId} on={(v) => setEditing({ ...editing, draft: { ...editing.draft, merchantId: v } })} />
              <Field label="API Public Key" value={editing.draft.publicKey} on={(v) => setEditing({ ...editing, draft: { ...editing.draft, publicKey: v } })} />
              <Field label="API Secret Key" value={editing.draft.secretKey} on={(v) => setEditing({ ...editing, draft: { ...editing.draft, secretKey: v } })} secret />
              <Field label="Webhook URL" value={editing.draft.webhookUrl} on={(v) => setEditing({ ...editing, draft: { ...editing.draft, webhookUrl: v } })} full />
              <Field label="Min Deposit" value={String(editing.draft.minDeposit)} on={(v) => setEditing({ ...editing, draft: { ...editing.draft, minDeposit: Number(v) || 0 } })} num />
              <Field label="Max Deposit" value={String(editing.draft.maxDeposit)} on={(v) => setEditing({ ...editing, draft: { ...editing.draft, maxDeposit: Number(v) || 0 } })} num />
            </div>

            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Country activation</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {countries.map((c) => {
                  const on = !!editing.draft.countries[c.id];
                  return (
                    <button
                      key={c.id}
                      onClick={() => setEditing({ ...editing, draft: { ...editing.draft, countries: { ...editing.draft.countries, [c.id]: !on } } })}
                      className={`flex items-center justify-between px-2 py-1.5 rounded border text-xs ${on ? 'bg-emeraldwin-500/15 border-emeraldwin-500/40 text-emeraldwin-300' : 'bg-slatepanel-800 border-borderline-900 text-slate-400'}`}
                    >
                      <span>{c.code} · {c.name}</span>
                      <span className={`w-7 h-3.5 rounded-full relative ${on ? 'bg-emeraldwin-500' : 'bg-slatepanel-700'}`}>
                        <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${on ? 'left-4' : 'left-0.5'}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditing(null)} className="btn-ghost px-3 py-2 text-sm">Cancel</button>
              <button onClick={save} className="btn-primary px-3 py-2 text-sm"><Save className="w-4 h-4" /> Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, on, full, num, secret }: { label: string; value: string; on: (v: string) => void; full?: boolean; num?: boolean; secret?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</label>
      <input
        value={value}
        onChange={(e) => on(e.target.value)}
        type={num ? 'number' : secret ? 'password' : 'text'}
        className="input mt-1"
      />
    </div>
  );
}
