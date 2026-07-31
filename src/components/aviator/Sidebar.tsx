import { useEffect, useRef, useState } from 'react';
import { Send, Share2, Trophy, Users, User } from 'lucide-react';
import type { Phase } from './game/useAviatorGame';
import {
  formatMoney,
  randomAvatarColor,
  randomName,
  initials,
} from './game/format';
import { auth } from '../../lib/auth';

export interface BetRecord {
  id: string;
  name: string;
  color: string;
  amount: number;
  cashedOutAt: number | null;
  win: number | null;
  isPlayer: boolean;
  /** 'pending' = in-flight this round, 'won' = cashed out, 'lost' = crashed out */
  status?: 'pending' | 'won' | 'lost';
}

export interface ChatMessage {
  id: string;
  name: string;
  color: string;
  text: string;
  system?: boolean;
}

interface TopWinRecord {
  username: string;
  bet_amount: number;
  win_amount: number;
  multiplier: number;
  placed_at: string;
}

interface SidebarProps {
  phase: Phase;
  multiplier: number;
  allBets: BetRecord[];
  myBets: BetRecord[];
  chat: ChatMessage[];
  onSendChat: (text: string) => void;
  onShareBet: () => void;
  canShareBet: boolean;
}

type Tab = 'all' | 'mine' | 'top';

async function fetchMyBetsHistory(): Promise<BetRecord[]> {
  const session = auth.getSession();
  if (!session) return [];
  try {
    const EDGE_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-bet`;
    const res = await fetch(`${EDGE_FN}?action=aviator_my_bets&user_id=${session.userId}`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    });
    const data = await res.json() as {
      bets?: {
        id: string;
        bet_amount: number;
        win_amount: number;
        multiplier: number;
        status: string;
        placed_at: string;
        cash_out_at: number | null;
      }[];
    };
    return (data.bets ?? []).map((b) => ({
      id: b.id,
      name: 'You',
      color: '#22c55e',
      amount: b.bet_amount,
      cashedOutAt: b.status === 'won' ? (b.cash_out_at ?? b.multiplier) : null,
      win: b.status === 'won' ? b.win_amount : null,
      isPlayer: true,
      status: b.status === 'won' ? 'won' : 'lost',
    }));
  } catch {
    return [];
  }
}

async function fetchTopWins(): Promise<TopWinRecord[]> {
  try {
    const EDGE_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-bet`;
    const res = await fetch(`${EDGE_FN}?action=aviator_top_wins`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    });
    const data = await res.json() as { wins?: TopWinRecord[] };
    return data.wins ?? [];
  } catch {
    return [];
  }
}

// Stable avatar colors for top wins — computed once per username so they don't flicker
const topWinColorCache = new Map<string, string>();
function stableColor(username: string): string {
  if (!topWinColorCache.has(username)) {
    topWinColorCache.set(username, randomAvatarColor());
  }
  return topWinColorCache.get(username)!;
}

export function Sidebar({
  phase,
  multiplier,
  allBets,
  myBets,
  chat,
  onSendChat,
  onShareBet,
  canShareBet,
}: SidebarProps) {
  const [tab, setTab] = useState<Tab>('all');
  const [input, setInput] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Historical my bets from server (loaded when Mine tab is opened)
  const [historyMyBets, setHistoryMyBets] = useState<BetRecord[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // All-time top wins from server
  const [topWins, setTopWins] = useState<TopWinRecord[]>([]);
  const [topWinsLoading, setTopWinsLoading] = useState(false);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chat]);

  // Load history when Mine tab selected
  useEffect(() => {
    if (tab === 'mine' && !historyLoaded) {
      setHistoryLoaded(true);
      void fetchMyBetsHistory().then(setHistoryMyBets);
    }
  }, [tab, historyLoaded]);

  // Reload history when phase changes to waiting (new round settled)
  useEffect(() => {
    if (phase === 'waiting' && historyLoaded) {
      void fetchMyBetsHistory().then(setHistoryMyBets);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // FIX: Load top wins EVERY time Top tab is opened (not just once).
  // Previously topWinsLoaded flag prevented reload, causing empty list on first open
  // if the fetch failed or the tab was opened before data arrived.
  useEffect(() => {
    if (tab === 'top') {
      setTopWinsLoading(true);
      void fetchTopWins().then((wins) => {
        setTopWins(wins);
        setTopWinsLoading(false);
      }).catch(() => setTopWinsLoading(false));
    }
  }, [tab]);

  function send() {
    const text = input.trim();
    if (!text) return;
    onSendChat(text);
    setInput('');
  }

  // Merge current-round myBets with history (deduplicate by id)
  const combinedMyBets: BetRecord[] = [...myBets];
  const existingIds = new Set(myBets.map((b) => b.id));
  for (const h of historyMyBets) {
    if (!existingIds.has(h.id)) combinedMyBets.push(h);
  }

  const list = tab === 'all' ? allBets : tab === 'mine' ? combinedMyBets : [];

  return (
    <div className="flex flex-col bg-[#151a27] rounded-xl mx-2 mb-2 overflow-hidden border border-white/5">
      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <SideTab active={tab === 'all'} onClick={() => setTab('all')} icon={<Users className="w-3.5 h-3.5" />}>
          All Bets
        </SideTab>
        <SideTab active={tab === 'mine'} onClick={() => setTab('mine')} icon={<User className="w-3.5 h-3.5" />}>
          My Bets
        </SideTab>
        <SideTab active={tab === 'top'} onClick={() => setTab('top')} icon={<Trophy className="w-3.5 h-3.5" />}>
          Top
        </SideTab>
      </div>

      {tab !== 'top' && (
        <>
          {/* Column headers */}
          <div className="grid grid-cols-4 gap-1 px-3 py-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
            <span className="col-span-2">Player</span>
            <span className="text-right">Bet</span>
            <span className="text-right">Win</span>
          </div>

          {/* Bet list */}
          <div className="max-h-48 overflow-y-auto">
            {list.length === 0 ? (
              <div className="text-center text-white/30 text-xs py-6">
                {tab === 'mine'
                  ? auth.getSession() ? 'No bets yet this session.' : 'Sign in to see your bets.'
                  : 'Waiting for players to join…'}
              </div>
            ) : (
              list.map((b) => <BetRow key={b.id} bet={b} phase={phase} multiplier={multiplier} />)
            )}
          </div>
        </>
      )}

      {/* Top wins tab — all-time highest wins */}
      {tab === 'top' && (
        <div className="max-h-64 overflow-y-auto">
          {topWinsLoading ? (
            <div className="text-center text-white/30 text-xs py-6">Loading…</div>
          ) : topWins.length === 0 ? (
            <div className="text-center text-white/30 text-xs py-6">No big wins recorded yet.</div>
          ) : (
            <div>
              <div className="grid grid-cols-4 gap-1 px-3 py-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                <span className="col-span-2">Player</span>
                <span className="text-right">Bet</span>
                <span className="text-right">Win</span>
              </div>
              {topWins.map((w, i) => (
                <div key={i} className="grid grid-cols-4 gap-1 px-3 py-1.5 text-xs border-b border-white/5 last:border-0">
                  <div className="col-span-2 flex items-center gap-2 min-w-0">
                    <span className="text-yellow-400 font-bold text-[10px] w-4 flex-shrink-0">#{i + 1}</span>
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
                      style={{ background: stableColor(w.username) }}
                    >
                      {(w.username || 'P').slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-white/80 truncate">{w.username}</span>
                  </div>
                  <span className="text-right text-white/60">{formatMoney(w.bet_amount)}</span>
                  <span className="text-right text-green-400 font-bold">
                    {formatMoney(w.win_amount)}
                    <span className="text-[10px] text-green-400/60 ml-1">{Number(w.multiplier).toFixed(2)}x</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Share bet button (visible when cashed out) */}
      {canShareBet && (
        <div className="px-3 py-1.5 border-t border-white/5">
          <button
            onClick={onShareBet}
            className="flex items-center gap-1.5 text-xs text-aviator-red/80 hover:text-aviator-red transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share your win to chat
          </button>
        </div>
      )}

      {/* Chat */}
      <div className="border-t border-white/10">
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Live Chat</span>
        </div>
        <div
          ref={chatScrollRef}
          className="h-20 overflow-y-auto px-3 py-1 space-y-1"
        >
          {chat.length === 0 && (
            <div className="text-white/20 text-xs">Be the first to say something…</div>
          )}
          {chat.map((m) =>
            m.system ? (
              <div key={m.id} className="text-xs text-aviator-red/80 italic">{m.text}</div>
            ) : (
              <div key={m.id} className="text-xs text-white/70">
                <span className="font-semibold" style={{ color: m.color }}>{m.name}:</span>
                {' '}
                {m.text}
              </div>
            ),
          )}
        </div>

        <div className="flex items-center gap-2 px-3 py-2 border-t border-white/5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Type a message…"
            maxLength={140}
            className="h-9 flex-1 rounded-lg bg-ink-850 border border-ink-500/70 px-3 text-sm text-white outline-none focus:border-aviator-red/60"
          />
          <button
            onClick={send}
            className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4 text-white/70" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SideTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors cursor-pointer border-b-2 ${
        active
          ? 'text-white border-aviator-red'
          : 'text-white/40 border-transparent hover:text-white/70'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function BetRow({ bet, phase, multiplier }: { bet: BetRecord; phase: Phase; multiplier: number }) {
  const liveWin = bet.amount * multiplier;

  // A bet is "in-flight" only when it's explicitly pending (current round, not yet settled).
  // Lost/won bets from previous rounds must NOT show the live multiplier.
  const isPending = bet.status === 'pending' || (bet.status === undefined && bet.cashedOutAt === null && bet.win === null);
  const inFlight = isPending && bet.cashedOutAt === null && bet.win === null;

  return (
    <div className="grid grid-cols-4 gap-1 px-3 py-1.5 text-xs border-b border-white/5 last:border-0">
      <div className="col-span-2 flex items-center gap-2 min-w-0">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
          style={{ background: bet.color }}
        >
          {initials(bet.name)}
        </div>
        <div className="min-w-0">
          <div className="text-white/80 truncate">{bet.name}</div>
          {bet.isPlayer && <div className="text-[9px] text-green-400/70">(you)</div>}
        </div>
      </div>
      <span className="text-right text-white/60 self-center">{formatMoney(bet.amount)}</span>
      {bet.cashedOutAt !== null ? (
        <span className="text-right text-green-400 font-bold self-center">
          {formatMoney(bet.amount * bet.cashedOutAt)}
          <span className="text-[10px] text-green-400/60 block">{bet.cashedOutAt.toFixed(2)}x</span>
        </span>
      ) : phase === 'flying' && inFlight ? (
        <span className="text-right text-yellow-400 self-center">{formatMoney(liveWin)}</span>
      ) : (
        <span className="text-right text-white/30 self-center">—</span>
      )}
    </div>
  );
}

// Helper to fabricate a simulated bet record (used by App).
let simId = 0;
export function makeSimBet(roundId: number, phase: Phase, multiplier: number): BetRecord {
  const amount = [50, 100, 100, 200, 200, 500, 1000, 25, 75, 300][Math.floor(Math.random() * 10)];
  const name = randomName();
  const color = randomAvatarColor();
  // Some sims cash out during flight.
  let cashedOutAt: number | null = null;
  let win: number | null = null;
  if (phase === 'flying' && Math.random() < 0.18 && multiplier > 1.05) {
    cashedOutAt = Math.max(1.01, Math.floor((multiplier * (0.5 + Math.random() * 0.5)) * 100) / 100);
    win = amount * cashedOutAt;
  }
  return {
    id: `sim-${roundId}-${simId++}`,
    name,
    color,
    amount,
    cashedOutAt,
    win,
    isPlayer: false,
    status: cashedOutAt !== null ? 'won' : 'pending',
  };
}
