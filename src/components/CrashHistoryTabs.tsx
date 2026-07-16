/**
 * CrashHistoryTabs — spec §7
 * "My Bets" table gets a Net P/L column and every column header uses an explicit
 * minWidth style so wider labels (e.g. "Net P/L") are never clipped on narrow screens.
 */
import { useMemo, useState } from 'react';
import { useCrashMyBets } from '../lib/hooks';
import { store } from '../lib/store';

type Tab = 'all' | 'mine' | 'top';
type Range = 'day' | 'week' | 'month' | 'year';

const RANGE_MS: Record<Range, number> = {
  day:   86_400_000,
  week:  7 * 86_400_000,
  month: 30 * 86_400_000,
  year:  365 * 86_400_000,
};

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function CrashHistoryTabs() {
  const [tab, setTab] = useState<Tab>('all');
  const [range, setRange] = useState<Range>('day');
  const mine = useCrashMyBets();

  // Mock "All Bets" feed — deterministic peers so global ticker always has rows.
  const allBets = useMemo(() => {
    const mockUsers = ['NeonHawk', 'CyberLynx', 'AstroBee', 'QuantumOwl', 'NovaWolf', 'PixelFox', 'TurboKoi', 'EchoFalcon'];
    return Array.from({ length: 12 }, (_, i) => {
      const m = +(1 + Math.random() * 12).toFixed(2);
      const stake = Math.round(50 + Math.random() * 4000);
      return { user: mockUsers[i % mockUsers.length], stake, multiplier: m, win: +(stake * m).toFixed(2), ts: Date.now() - i * 60_000 };
    });
  }, [mine.length]);

  const topRows = useMemo(() => {
    const cutoff = Date.now() - RANGE_MS[range];
    const data = store.crashLeaderboard || [];
    return data
      .filter((r) => r.ts >= cutoff)
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, 10);
  }, [range, tab]);

  return (
    <div className="panel p-3 space-y-2">
      {/* Primary tabs */}
      <div className="grid grid-cols-3 gap-1.5">
        {(['all', 'mine', 'top'] as Tab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={[
              'py-1.5 rounded-lg text-xs font-bold capitalize transition-all border',
              tab === k
                ? 'bg-slatepanel-700 border-slate-500 text-white'
                : 'bg-slatepanel-800 border-borderline-900 text-slate-400',
            ].join(' ')}
          >
            {k === 'all' ? 'All Bets' : k === 'mine' ? 'My Bets' : 'Top'}
          </button>
        ))}
      </div>

      {/* Time-range chips — only for Top tab */}
      {tab === 'top' && (
        <div className="grid grid-cols-4 gap-1.5">
          {(['day', 'week', 'month', 'year'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={[
                'py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all',
                range === r
                  ? 'bg-neon-500/20 border border-neon-400/50 text-neon-300'
                  : 'bg-slatepanel-800 border border-borderline-900 text-slate-400 hover:text-white',
              ].join(' ')}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="max-h-72 overflow-y-auto scrollbar-thin overflow-x-auto">

        {/* ── ALL BETS ─────────────────────────────────────────── */}
        {tab === 'all' && (
          <table className="w-full text-[11px]">
            <thead className="text-slate-500 uppercase tracking-wider sticky top-0 bg-slatepanel-900">
              <tr>
                <th className="text-left  py-1.5 px-1" style={{ minWidth: '5rem' }}>Player</th>
                <th className="text-right py-1.5 px-1" style={{ minWidth: '3.5rem' }}>Stake</th>
                <th className="text-right py-1.5 px-1" style={{ minWidth: '2.5rem' }}>×</th>
                <th className="text-right py-1.5 px-1" style={{ minWidth: '3.5rem' }}>Win</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {allBets.map((b, i) => (
                <tr key={i} className="border-t border-borderline-900/60">
                  <td className="py-1.5 px-1 text-slate-200 font-semibold">{b.user}</td>
                  <td className="px-1 text-right text-slate-300">{store.currency}{b.stake}</td>
                  <td className={`px-1 text-right font-bold ${b.multiplier >= 2 ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                    {b.multiplier.toFixed(2)}×
                  </td>
                  <td className="px-1 text-right text-white font-semibold">{store.currency}{b.win.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── MY BETS — spec §7: Net P/L column + explicit minWidths ── */}
        {tab === 'mine' && (
          <table className="w-full text-[11px]">
            <thead className="text-slate-500 uppercase tracking-wider sticky top-0 bg-slatepanel-900">
              <tr>
                <th className="text-left  py-1.5 px-1" style={{ minWidth: '3rem'  }}>Round</th>
                <th className="text-left  py-1.5 px-1" style={{ minWidth: '3rem'  }}>Time</th>
                <th className="text-right py-1.5 px-1" style={{ minWidth: '3.5rem' }}>Stake</th>
                <th className="text-right py-1.5 px-1" style={{ minWidth: '2.5rem' }}>×</th>
                <th className="text-right py-1.5 px-1" style={{ minWidth: '3.5rem' }}>Win</th>
                {/* spec §7: column header must never be clipped — uses whitespace-nowrap + minWidth */}
                <th className="text-right py-1.5 px-1 whitespace-nowrap" style={{ minWidth: '4rem' }}>Net P/L</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {mine.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-slate-500">No bets yet.</td></tr>
              )}
              {mine.map((b) => {
                const netpl = (b.win ?? 0) - (b.amount ?? 0);
                return (
                  <tr key={b.id} className="border-t border-borderline-900/60">
                    <td className="py-1.5 px-1 text-slate-300">#{b.roundId}</td>
                    <td className="px-1 text-slate-500">{fmtTime(b.ts)}</td>
                    <td className="px-1 text-right text-slate-300">{store.currency}{b.amount}</td>
                    <td className={`px-1 text-right font-bold ${b.win > 0 ? 'text-emeraldwin-400' : 'text-coral-400'}`}>
                      {b.cashOutAt ? `${b.cashOutAt.toFixed(2)}×` : '—'}
                    </td>
                    <td className={`px-1 text-right font-semibold ${b.win > 0 ? 'text-emeraldwin-300' : 'text-slate-500'}`}>
                      {b.win > 0 ? `${store.currency}${b.win.toFixed(2)}` : '—'}
                    </td>
                    {/* Net P/L cell — green if positive, red if negative */}
                    <td
                      className={`px-1 text-right font-bold whitespace-nowrap ${netpl >= 0 ? 'text-emeraldwin-400' : 'text-coral-400'}`}
                    >
                      {netpl >= 0 ? '+' : ''}{store.currency}{netpl.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* ── TOP PLAYERS ──────────────────────────────────────── */}
        {tab === 'top' && (
          <table className="w-full text-[11px]">
            <thead className="text-slate-500 uppercase tracking-wider sticky top-0 bg-slatepanel-900">
              <tr>
                <th className="text-left  py-1.5 px-1" style={{ minWidth: '1.5rem' }}>#</th>
                <th className="text-left  py-1.5 px-1" style={{ minWidth: '5rem'  }}>Player</th>
                <th className="text-right py-1.5 px-1" style={{ minWidth: '4rem'  }}>Earnings</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {topRows.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-slate-500">No data in range.</td></tr>
              )}
              {topRows.map((r, i) => (
                <tr key={i} className="border-t border-borderline-900/60">
                  <td className="py-1.5 px-1 text-slate-500">{i + 1}</td>
                  <td className="px-1 text-slate-200 font-semibold">{r.user}</td>
                  <td className="px-1 text-right text-emeraldwin-300 font-bold">{store.currency}{r.earnings.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
