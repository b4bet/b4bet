import { useMemo, useState } from 'react';
import { X, User, Wallet, ArrowLeftRight, LogIn, Gamepad2, Calendar, Ban, CheckCircle2 } from 'lucide-react';
import type { SeedUser } from '../lib/seedUsers';
import { auth, type AuthUser } from '../lib/auth';
import { store, type AdminHistoryRecord } from '../lib/store';
import { useBus } from '../lib/hooks';
import { Topics } from '../lib/bus';
import { cms } from '../lib/cms';
import { useFinance } from '../lib/cmsHooks';

type Tab = 'profile' | 'balance' | 'transactions' | 'logins' | 'games';
type Period = 'day' | 'week' | 'year' | 'custom';

interface Props {
  user: SeedUser;
  onClose: () => void;
}

const MS = { day: 86400000, week: 7 * 86400000, year: 365 * 86400000 };

export default function UserProfileModal({ user, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('profile');
  const [period, setPeriod] = useState<Period>('week');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [banned, setBanned] = useState(() => {
    const real = auth.getUsers().find((u) => u.id === user.id || u.username === user.account);
    return real ? !real.isActive : false;
  });

  const finance = useFinance();
  const history = useBus<AdminHistoryRecord[]>(Topics.AdminHistory, store.adminHistory);

  const range = useMemo(() => {
    const now = Date.now();
    if (period === 'day') return { start: now - MS.day, end: now };
    if (period === 'week') return { start: now - MS.week, end: now };
    if (period === 'year') return { start: now - MS.year, end: now };
    const s = from ? new Date(from).getTime() : 0;
    const e = to ? new Date(to).getTime() + MS.day : now;
    return { start: s, end: e };
  }, [period, from, to]);

  const inRange = (ts: number) => ts >= range.start && ts <= range.end;

  const deposits = finance.deposits.filter((d) => d.user === user.account && inRange(d.ts));
  const withdrawals = finance.withdrawals.filter((w) => w.user === user.account && inRange(w.ts));

  const games = useMemo(
    () => history.filter((r) => (r.userId === user.accountId || r.username === user.account) && inRange(r.ts)),
    [history, user.accountId, user.account, range.start, range.end]
  );

  const logins = useMemo(() => {
    const events = [{ ts: user.joined, ip: '—', device: '—', status: 'success' as const }];
    return events.filter((l) => inRange(l.ts));
  }, [user, range.start, range.end]);

  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const totalDep = deposits.filter((d) => d.status === 'approved').reduce((s, d) => s + d.amount, 0);
  const totalWd = withdrawals.filter((w) => w.status === 'approved').reduce((s, w) => s + w.amount, 0);
  const totalBet = games.reduce((s, r) => s + r.amount, 0);
  const totalWin = games.reduce((s, r) => s + r.win, 0);

  const toggleBan = () => {
    const next = !banned;
    auth.setUserStatus(user.id, !next);
    setBanned(next);
  };

  const TABS: { key: Tab; label: string; icon: typeof User }[] = [
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'balance', label: 'Balance', icon: Wallet },
    { key: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
    { key: 'logins', label: 'Login History', icon: LogIn },
    { key: 'games', label: 'Games History', icon: Gamepad2 },
  ];

  const showFilters = tab === 'transactions' || tab === 'logins' || tab === 'games';

  return (
    <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
      <div className="panel border border-borderline-900 bg-midnight-900/95 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-borderline-900">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-400 to-neon-600 grid place-items-center">
            <User className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-bold text-white leading-none truncate">{user.account}</h2>
            <p className="text-[11px] text-slate-500 mt-0.5 font-mono">#{user.accountId}</p>
          </div>
          <button
            onClick={toggleBan}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              banned
                ? 'bg-emeraldwin-500/15 border-emeraldwin-500/40 text-emeraldwin-400 hover:bg-emeraldwin-500/25'
                : 'bg-coral-500/15 border-coral-500/40 text-coral-400 hover:bg-coral-500/25'
            }`}
          >
            {banned ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
            {banned ? 'Unban User' : 'Ban User'}
          </button>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slatepanel-800 border border-borderline-900 grid place-items-center hover:border-coral-500/40">
            <X className="w-4 h-4 text-slate-300" />
          </button>
        </header>

        <div className="flex gap-1.5 px-3 pt-3 overflow-x-auto no-scrollbar">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all ${active ? 'bg-slatepanel-700 border-slate-500 text-white' : 'bg-slatepanel-800 border-borderline-900 text-slate-400 hover:text-white'}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {showFilters && (
          <div className="px-3 pt-3 flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1 bg-slatepanel-800 border border-borderline-900 rounded-xl p-1">
              {(['day', 'week', 'year', 'custom'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize ${period === p ? 'bg-neon-500/20 text-neon-200' : 'text-slate-400 hover:text-white'}`}
                >
                  {p}
                </button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slatepanel-800 border border-borderline-900 rounded-xl px-2 py-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-transparent text-xs text-white outline-none" />
                </div>
                <span className="text-slate-500 text-xs">→</span>
                <div className="flex items-center gap-1 bg-slatepanel-800 border border-borderline-900 rounded-xl px-2 py-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-transparent text-xs text-white outline-none" />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
          {tab === 'profile' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Info label="Account" value={user.account} />
              <Info label="User ID" value={'#' + user.accountId} mono />
              <Info label="Mobile" value={user.mobile || '—'} mono />
              <Info label="Status" value={banned ? 'Banned' : user.status === 'flagged' ? 'Flagged' : 'Active'} accent={banned ? 'text-coral-400' : user.status === 'flagged' ? 'text-coral-400' : 'text-emeraldwin-400'} />
              <Info label="Joined" value={fmtDate(user.joined)} />
            </div>
          )}

          {tab === 'balance' && (
            <div className="space-y-3">
              <div className="panel p-4 border border-emeraldwin-500/30 bg-emeraldwin-500/5">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Current Balance</div>
                <div className="font-display font-extrabold text-3xl tabular text-emeraldwin-400 mt-1">{fmt(user.balance)}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Info label="Lifetime Deposits" value={fmt(totalDep)} accent="text-emeraldwin-400" />
                <Info label="Lifetime Withdrawals" value={fmt(totalWd)} accent="text-coral-400" />
                <Info label="Total Bet (range)" value={fmt(totalBet)} />
                <Info label="Total Win (range)" value={fmt(totalWin)} accent="text-neon-300" />
              </div>
            </div>
          )}

          {tab === 'transactions' && (
            <div className="panel overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-midnight-850 border-b border-borderline-900">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    <th className="p-3">Time</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Detail</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderline-900">
                  {[...deposits.map((d) => ({ ...d, kind: 'Deposit' as const, detail: d.method })),
                    ...withdrawals.map((w) => ({ ...w, kind: 'Withdrawal' as const, detail: w.destination }))]
                    .sort((a, b) => b.ts - a.ts).length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-slate-500 text-sm">No transactions in this range.</td></tr>
                  ) : (
                    [...deposits.map((d) => ({ ...d, kind: 'Deposit' as const, detail: d.method })),
                     ...withdrawals.map((w) => ({ ...w, kind: 'Withdrawal' as const, detail: w.destination }))]
                      .sort((a, b) => b.ts - a.ts).map((r) => (
                        <tr key={r.id} className="hover:bg-slatepanel-800/50">
                          <td className="p-3 text-slate-400 text-xs whitespace-nowrap">{fmtDate(r.ts)}</td>
                          <td className="p-3"><span className={`chip text-[10px] ${r.kind === 'Deposit' ? 'bg-emeraldwin-500/15 text-emeraldwin-400' : 'bg-coral-500/15 text-coral-400'}`}>{r.kind}</span></td>
                          <td className="p-3 text-slate-300 text-xs">{r.detail}</td>
                          <td className="p-3 text-xs capitalize text-slate-300">{r.status}</td>
                          <td className={`p-3 text-right tabular font-semibold ${r.kind === 'Deposit' ? 'text-emeraldwin-400' : 'text-coral-400'}`}>{fmt(r.amount)}</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'logins' && (
            <div className="panel overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-midnight-850 border-b border-borderline-900">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    <th className="p-3">Time</th>
                    <th className="p-3">IP</th>
                    <th className="p-3">Device Token</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderline-900">
                  {logins.length === 0 ? (
                    <tr><td colSpan={4} className="p-6 text-center text-slate-500 text-sm">No login events in this range.</td></tr>
                  ) : logins.map((l, i) => (
                    <tr key={i} className="hover:bg-slatepanel-800/50">
                      <td className="p-3 text-slate-400 text-xs whitespace-nowrap">{fmtDate(l.ts)}</td>
                      <td className="p-3 font-mono text-[11px] text-slate-300">{l.ip}</td>
                      <td className="p-3 font-mono text-[11px] text-slate-400">{l.device}</td>
                      <td className="p-3">
                        <span className={`chip text-[10px] ${l.status === 'success' ? 'bg-emeraldwin-500/15 text-emeraldwin-400' : 'bg-coral-500/15 text-coral-400'}`}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'games' && (
            <div className="panel overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-midnight-850 border-b border-borderline-900">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    <th className="p-3">Time</th>
                    <th className="p-3">Game</th>
                    <th className="p-3">Result</th>
                    <th className="p-3 text-right">Bet</th>
                    <th className="p-3 text-right">Win</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderline-900">
                  {games.length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-slate-500 text-sm">No game records in this range.</td></tr>
                  ) : games.map((r) => (
                    <tr key={r.id} className="hover:bg-slatepanel-800/50">
                      <td className="p-3 text-slate-400 text-xs whitespace-nowrap">{fmtDate(r.ts)}</td>
                      <td className="p-3"><span className="chip bg-slatepanel-800 text-slate-300 text-[10px] capitalize">{r.game}</span></td>
                      <td className="p-3 text-slate-300 text-xs">{r.result}</td>
                      <td className="p-3 text-right tabular font-semibold text-slate-300">{fmt(r.amount)}</td>
                      <td className={`p-3 text-right tabular font-semibold ${r.win > 0 ? 'text-emeraldwin-400' : 'text-coral-400'}`}>{fmt(r.win)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: string }) {
  return (
    <div className="panel p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${accent ?? 'text-white'} ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</div>
    </div>
  );
}
