import { useEffect, useState } from 'react';
import { Ticket, Plus, Trash2, Users, Gift, Copy, RefreshCcw } from 'lucide-react';
import { store, type RedeemCode } from '../../lib/store';
import { bus, Topics } from '../../lib/bus';
import { cms } from '../../lib/cms';

function useRedeemCodes(): RedeemCode[] {
  const [list, setList] = useState<RedeemCode[]>(() => store.listRedeemCodes());
  useEffect(() => bus.on(Topics.RedeemCodes, (p) => setList(p as RedeemCode[])), []);
  return list;
}

function genCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function RedeemCodesTab() {
  const codes = useRedeemCodes();
  const [code, setCode] = useState('');
  const [bonus, setBonus] = useState('100');
  const [userLimit, setUserLimit] = useState('10');

  const create = () => {
    const c = (code.trim() || genCode()).toUpperCase();
    const b = Number(bonus);
    const u = Number(userLimit);
    if (!b || b <= 0) { cms.toast({ title: 'Invalid bonus', body: 'Bonus must be > 0.', kind: 'alert' }); return; }
    if (!u || u <= 0) { cms.toast({ title: 'Invalid user limit', body: 'Set at least 1.', kind: 'alert' }); return; }
    store.addRedeemCode(c, b, u, 1);
    cms.toast({ title: 'Redeem code created', body: `${c} · ₹${b} · ${u} users`, kind: 'success' });
    setCode('');
  };

  const copy = (c: string) => {
    navigator.clipboard?.writeText(c);
    cms.toast({ title: 'Copied', body: c, kind: 'info' });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
          <Ticket className="w-5 h-5 text-neon-300" /> Redeem Code Generator
        </h2>
        <p className="text-xs text-slate-500">Create redeem codes with a total user limit. Each user can redeem a code only once.</p>
      </div>

      <div className="panel p-4 space-y-3">
        <h3 className="font-display font-bold text-white text-sm">New Code</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="sm:col-span-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Code (blank = auto)</label>
            <div className="flex gap-1 mt-1">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="AUTO"
                className="input flex-1 uppercase"
              />
              <button onClick={() => setCode(genCode())} className="btn-ghost px-2" title="Generate">
                <RefreshCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Bonus (₹)</label>
            <input
              type="number"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
              className="input mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">User Limit</label>
            <input
              type="number"
              value={userLimit}
              onChange={(e) => setUserLimit(e.target.value)}
              className="input mt-1"
              min={1}
            />
          </div>
        </div>
        <button onClick={create} className="btn-primary w-full py-2 text-sm">
          <Plus className="w-4 h-4" /> Create Redeem Code
        </button>
      </div>

      <div className="panel p-3">
        <h3 className="font-display font-bold text-white text-sm mb-3">Active Codes ({codes.length})</h3>
        {codes.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">No redeem codes yet.</p>
        ) : (
          <div className="space-y-1.5">
            {codes.map((c) => {
              const used = Object.keys(c.usageByUser).length;
              const full = used >= c.userLimit;
              return (
                <div key={c.code} className="bg-midnight-850 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-neon-300 text-sm">{c.code}</span>
                      <button onClick={() => copy(c.code)} className="text-slate-500 hover:text-white">
                        <Copy className="w-3 h-3" />
                      </button>
                      {full && <span className="chip text-[9px] bg-coral-500/15 text-coral-300">Exhausted</span>}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1"><Gift className="w-3 h-3 text-emeraldwin-400" /> ₹{c.bonus}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3 text-amberx-400" /> {used}/{c.userLimit} used</span>
                    </div>
                  </div>
                  <button
                    onClick={() => { store.deleteRedeemCode(c.code); cms.toast({ title: 'Code deleted', body: c.code, kind: 'info' }); }}
                    className="btn-coral px-2 py-1.5 text-xs flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
