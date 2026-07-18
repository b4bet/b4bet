import { useState } from 'react';
import { Coins, Plus, Trash2, Star, Globe2 } from 'lucide-react';
import { store } from '../../lib/store';
import { cms } from '../../lib/cms';
import { useCountries } from '../../lib/cmsHooks';
import { supabase } from '../../integrations/supabase/client';

interface Currency {
  code: string;
  symbol: string;
  name: string;
  rate: number;
  active: boolean;
  primary: boolean;
}

// Load currencies from Supabase settings on mount; fall back to seed if none saved.
function useCurrencies(): [Currency[], React.Dispatch<React.SetStateAction<Currency[]>>] {
  const [currencies, setCurrenciesState] = useState<Currency[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load from DB on first render
  if (!loaded) {
    setLoaded(true);
    supabase.rpc('admin_get_settings').then(({ data }) => {
      const rows = (data ?? []) as { key: string; value: unknown }[];
      const row = rows.find((r) => r.key === 'currencies');
      if (row?.value && Array.isArray(row.value) && (row.value as Currency[]).length > 0) {
        setCurrenciesState(row.value as Currency[]);
      } else {
        setCurrenciesState([
          { code: 'INR', symbol: '₹', name: 'Indian Rupee', rate: 1, active: true, primary: true },
          { code: 'USD', symbol: '$', name: 'US Dollar', rate: 0.012, active: true, primary: false },
          { code: 'EUR', symbol: '€', name: 'Euro', rate: 0.011, active: true, primary: false },
        ]);
      }
    });
  }

  return [currencies, setCurrenciesState];
}

function persistCurrencies(currencies: Currency[]) {
  void supabase.rpc('admin_update_setting', {
    p_key: 'currencies',
    p_value: currencies as unknown as string,
  }).catch(() => {});
}

export default function CurrenciesTab() {
  const [currencies, setCurrencies] = useCurrencies();
  const [code, setCode] = useState('');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');

  const toggle = (c: string) => {
    const next = currencies.map((x) => (x.code === c ? { ...x, active: !x.active } : x));
    setCurrencies(next);
    persistCurrencies(next);
  };

  const setPrimary = (c: string) => {
    const next = currencies.map((x) => ({ ...x, primary: x.code === c }));
    setCurrencies(next);
    persistCurrencies(next);
    const cur = next.find((x) => x.code === c);
    if (cur) store.currency = cur.symbol;
  };

  const add = () => {
    if (!code || !symbol || !name) return;
    const next = [...currencies, { code: code.toUpperCase(), symbol, name, rate: 1, active: true, primary: false }];
    setCurrencies(next);
    persistCurrencies(next);
    setCode('');
    setSymbol('');
    setName('');
  };

  const remove = (c: string) => {
    const next = currencies.filter((x) => x.code !== c);
    setCurrencies(next);
    persistCurrencies(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-white">Currencies</h2>
        <p className="text-xs text-slate-500">Manage supported currencies and exchange rates. Changes are saved to Supabase.</p>
      </div>

      <div className="panel p-4">
        <h3 className="font-display font-bold text-sm text-white mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-neon-300" /> Add Currency
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (INR)" className="input" />
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol (₹)" className="input" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="input" />
          <button onClick={add} className="btn-primary"><Plus className="w-4 h-4" /> Add</button>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-midnight-850 border-b border-borderline-900">
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              <th className="p-3">Currency</th>
              <th className="p-3">Symbol</th>
              <th className="p-3 text-right">Rate</th>
              <th className="p-3 text-center">Active</th>
              <th className="p-3 text-center">Primary</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderline-900">
            {currencies.map((c) => (
              <tr key={c.code} className="hover:bg-slatepanel-800/50">
                <td className="p-3 font-semibold text-white flex items-center gap-2">
                  <Coins className="w-4 h-4 text-neon-300" /> {c.name}
                </td>
                <td className="p-3 font-mono text-slate-300">{c.symbol}</td>
                <td className="p-3 text-right tabular text-slate-400">{c.rate}</td>
                <td className="p-3 text-center">
                  <button
                    onClick={() => toggle(c.code)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${c.active ? 'bg-emeraldwin-500' : 'bg-slatepanel-700'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${c.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </td>
                <td className="p-3 text-center">
                  <button onClick={() => setPrimary(c.code)} className="grid place-items-center">
                    <Star className={`w-5 h-5 ${c.primary ? 'fill-amberx-400 text-amberx-400' : 'text-slate-600'}`} />
                  </button>
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => remove(c.code)}
                    className="w-7 h-7 rounded-lg bg-coral-500/15 border border-coral-500/40 grid place-items-center"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-coral-400" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CountriesPanel />
    </div>
  );
}

function CountriesPanel() {
  const countries = useCountries();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('₹');
  const [manual, setManual] = useState('UPI');
  return (
    <div className="panel p-4 space-y-3">
      <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
        <Globe2 className="w-4 h-4 text-neon-300" /> Country-Wise Access
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Country name" className="input" />
        <input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="Currency" className="input" />
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Manual methods (CSV)" className="input" />
        <button
          onClick={() => {
            if (!name.trim()) return;
            cms.addCountry({ name: name.trim(), code: name.trim().slice(0, 2).toUpperCase(), isActive: true, currency, manualDepositMethods: manual.split(',').map(s => s.trim()), manualWithdrawalMethods: manual.split(',').map(s => s.trim()) });
            setName('');
          }}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" /> Add Country
        </button>
      </div>
      <div className="space-y-1">
        {countries.map((c) => (
          <div key={c.id} className="flex items-center justify-between bg-midnight-850 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-neon-300" />
              <span className="text-sm text-white">{c.name}</span>
              <span className="text-[10px] text-slate-500">{c.currency} · {c.manualDepositMethods.join(', ')}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => cms.setDetectedCountry(c.id)} className="text-[10px] chip bg-slatepanel-800 text-slate-400">Set as my country</button>
              <button
                onClick={() => cms.updateCountry(c.id, { isActive: !c.isActive })}
                className={`relative w-10 h-5 rounded-full transition-colors ${c.isActive ? 'bg-emeraldwin-500' : 'bg-coral-500'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${c.isActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <button onClick={() => cms.removeCountry(c.id)} className="w-7 h-7 rounded-lg bg-coral-500/15 border border-coral-500/40 grid place-items-center">
                <Trash2 className="w-3.5 h-3.5 text-coral-400" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
