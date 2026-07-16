import { useEffect, useRef, useState } from 'react';
import { Send, Share2, Trophy, Users, User } from 'lucide-react';
import type { Phase } from './game/useAviatorGame';
import {
  formatMoney,
  randomAvatarColor,
  randomName,
  initials,
} from './game/format';

export interface BetRecord {
  id: string;
  name: string;
  color: string;
  amount: number;
  cashedOutAt: number | null;
  win: number | null;
  isPlayer: boolean;
}

export interface ChatMessage {
  id: string;
  name: string;
  color: string;
  text: string;
  system?: boolean;
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

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chat]);

  function send() {
    const text = input.trim();
    if (!text) return;
    onSendChat(text);
    setInput('');
  }

  const topBets = [...allBets]
    .filter((b) => b.win !== null)
    .sort((a, b) => (b.win ?? 0) - (a.win ?? 0))
    .slice(0, 50);

  const list = tab === 'all' ? allBets : tab === 'mine' ? myBets : topBets;

  return (
    <aside className="flex h-full flex-col rounded-xl bg-ink-700 border border-ink-500/60 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-ink-600">
        <SideTab active={tab === 'all'} onClick={() => setTab('all')} icon={<Users className="h-4 w-4" />}>
          All Bets
        </SideTab>
        <SideTab active={tab === 'mine'} onClick={() => setTab('mine')} icon={<User className="h-4 w-4" />}>
          My Bets
        </SideTab>
        <SideTab active={tab === 'top'} onClick={() => setTab('top')} icon={<Trophy className="h-4 w-4" />}>
          Top
        </SideTab>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 border-b border-ink-600/60">
        <span>Player</span>
        <span className="text-right">Bet</span>
        <span className="text-right">X</span>
        <span className="text-right">Win</span>
      </div>

      {/* Bet list */}
      <div className="scroll-thin flex-1 overflow-y-auto min-h-0">
        {list.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-gray-600">
            {tab === 'mine'
              ? 'You haven’t placed any bets yet.'
              : tab === 'top'
                ? 'No cashed-out wins yet this round.'
                : 'Waiting for players to join…'}
          </div>
        ) : (
          list.map((b) => <BetRow key={b.id} bet={b} phase={phase} multiplier={multiplier} />)
        )}
      </div>

      {/* Chat */}
      <div className="border-t border-ink-600 bg-ink-750">
        <div className="px-3 pt-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Live Chat
        </div>
        <div ref={chatScrollRef} className="scroll-thin h-28 overflow-y-auto px-3 py-2 space-y-1.5">
          {chat.length === 0 && (
            <p className="text-xs text-gray-600 italic">Be the first to say something…</p>
          )}
          {chat.map((m) =>
            m.system ? (
              <div
                key={m.id}
                className="rounded-md bg-aviator-red/10 border border-aviator-red/20 px-2 py-1 text-xs text-aviator-red-bright animate-fade-in"
              >
                {m.text}
              </div>
            ) : (
              <div key={m.id} className="text-xs leading-snug animate-fade-in">
                <span className="font-bold" style={{ color: m.color }}>
                  {m.name}:
                </span>{' '}
                <span className="text-gray-300">{m.text}</span>
              </div>
            ),
          )}
        </div>

        <div className="flex items-center gap-1.5 p-2 border-t border-ink-600/60">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Type a message…"
            maxLength={140}
            className="h-9 flex-1 rounded-lg bg-ink-850 border border-ink-500/70 px-3 text-sm text-white outline-none focus:border-aviator-red/60"
          />
          <button
            onClick={onShareBet}
            disabled={!canShareBet}
            title="Share your cash-out in chat"
            className="grid h-9 w-9 place-items-center rounded-lg bg-ink-850 border border-ink-500/70 text-aviator-red hover:bg-ink-650 disabled:opacity-40 transition-colors"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            onClick={send}
            className="grid h-9 w-9 place-items-center rounded-lg bg-aviator-red text-white hover:bg-aviator-red-bright transition-colors"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
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
      className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors ${
        active
          ? 'bg-ink-650 text-white border-b-2 border-aviator-red'
          : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function BetRow({ bet, phase, multiplier }: { bet: BetRecord; phase: Phase; multiplier: number }) {
  const liveWin = bet.amount * multiplier;
  const inFlight = bet.cashedOutAt === null && bet.win === null;
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-1 px-3 py-1.5 text-xs items-center border-b border-ink-600/30 hover:bg-ink-650/50">
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
          style={{ backgroundColor: bet.color }}
        >
          {initials(bet.name)}
        </span>
        <span className="truncate text-gray-300">
          {bet.name}
          {bet.isPlayer && <span className="ml-1 text-aviator-green">(you)</span>}
        </span>
      </div>
      <span className="text-right font-mono text-gray-400 tabular-nums">{formatMoney(bet.amount)}</span>
      {bet.cashedOutAt !== null ? (
        <span className="text-right font-mono font-bold text-aviator-green tabular-nums">
          {bet.cashedOutAt.toFixed(2)}x
        </span>
      ) : (
        <span className="text-right font-mono text-gray-600 tabular-nums">
          {phase === 'flying' && inFlight ? `${multiplier.toFixed(2)}x` : '—'}
        </span>
      )}
      <span className="text-right font-mono font-bold tabular-nums">
        {bet.cashedOutAt !== null ? (
          <span className="text-aviator-green">{formatMoney(bet.amount * bet.cashedOutAt)}</span>
        ) : phase === 'flying' && inFlight ? (
          <span className="text-aviator-orange">{formatMoney(liveWin)}</span>
        ) : (
          <span className="text-gray-600">—</span>
        )}
      </span>
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
  };
}
