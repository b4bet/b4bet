import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './Header';
import { HistoryBar } from './HistoryBar';
import { FlightCanvas, type CashoutNotice, type InsufficientBalanceNotice, type TimeoutNotice } from './FlightCanvas';
import { useGameAudio } from './game/useGameAudio';
import { BettingPanel, createInitialBet, type BetState } from './BettingPanel';
import { Sidebar, type BetRecord, type ChatMessage } from './Sidebar';
import { useAviatorGame } from './game/useAviatorGame';
import { formatMoney } from './game/format';
import { randomAvatarColor, randomName } from './game/format';
import { useBalance } from '../../lib/hooks';
import { store } from '../../lib/store';
import { cms } from '../../lib/cms';
import { auth } from '../../lib/auth';
import { GameService } from '../../lib/game-service';
import { aviatorLoop } from '../../lib/persistentGameEngine';

const PLAYER_NAME = 'You';

// BettingPanel imports this type — do NOT remove this export.
export type PlaceBetResult = { ok: boolean; reason?: string };

interface AviatorGameProps {
  onBack?: () => void;
}

// ── Persistence helpers ──────────────────────────────────────────────────────
const AV_BETS_KEY = 'b4bet_aviator_active_bets';

interface AviatorSavedBets {
  bet0: BetState;
  bet1: BetState;
  roundId: number;
  savedAt: number;
}

function saveAviatorBets(bet0: BetState, bet1: BetState, roundId: number) {
  try {
    if (bet0.placed || bet1.placed || bet0.pendingNextRound || bet1.pendingNextRound || bet0.autoBetEnabled || bet1.autoBetEnabled) {
      localStorage.setItem(AV_BETS_KEY, JSON.stringify({ bet0, bet1, roundId, savedAt: Date.now() }));
    } else {
      localStorage.removeItem(AV_BETS_KEY);
    }
  } catch { /* ignore */ }
}

function loadAviatorBets(): AviatorSavedBets | null {
  try {
    const raw = localStorage.getItem(AV_BETS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AviatorSavedBets;
    if (Date.now() - parsed.savedAt > 60000) {
      localStorage.removeItem(AV_BETS_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function clearAviatorBets() {
  try { localStorage.removeItem(AV_BETS_KEY); } catch { /* ignore */ }
}

async function fetchRoundBets(roundUuid: string): Promise<BetRecord[]> {
  try {
    const EDGE_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-bet`;
    const res = await fetch(`${EDGE_FN}?action=aviator_bets&round_uuid=${roundUuid}`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    });
    const data = await res.json() as {
      bets?: {
        user_id: string;
        username: string | null;
        bet_amount: number;
        win_amount: number | null;
        multiplier: number | null;
        status: string;
        placed_at: string;
      }[];
    };
    const session = auth.getSession();
    return (data.bets ?? []).map((b, i) => ({
      id: `server-${b.user_id}-${i}`,
      name: b.user_id === session?.userId ? PLAYER_NAME : (b.username ?? randomName()),
      color: b.user_id === session?.userId ? '#22c55e' : randomAvatarColor(),
      amount: b.bet_amount,
      cashedOutAt: b.status === 'won' && b.multiplier != null ? b.multiplier : null,
      win: b.status === 'won' && b.win_amount != null ? b.win_amount : null,
      isPlayer: b.user_id === session?.userId,
      // FIX: pass status so BetRow knows lost bets are NOT in-flight
      status: b.status === 'won' ? 'won' : b.status === 'pending' ? 'pending' : 'lost',
    } satisfies BetRecord));
  } catch {
    return [];
  }
}

export default function AviatorGame({ onBack }: AviatorGameProps) {
  const game = useAviatorGame();
  const { phase, multiplier, countdown, history, roundId, lastCrash } = game;

  const balance = useBalance();
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [animationOn, setAnimationOn] = useState(true);

  const { playCashOut } = useGameAudio(phase, soundOn, musicOn);

  const [bet0, setBet0] = useState<BetState>(() => {
    const saved = loadAviatorBets();
    return saved?.bet0 ?? createInitialBet(1);
  });
  const [bet1, setBet1] = useState<BetState>(() => {
    const saved = loadAviatorBets();
    return saved?.bet1 ?? createInitialBet(1);
  });

  useEffect(() => {
    saveAviatorBets(bet0, bet1, roundId);
  }, [bet0, bet1, roundId]);

  useEffect(() => {
    if (phase === 'crashed' && !bet0.placed && !bet1.placed && !bet0.pendingNextRound && !bet1.pendingNextRound && !bet0.autoBetEnabled && !bet1.autoBetEnabled) {
      clearAviatorBets();
    }
  }, [phase, bet0, bet1]);

  const [allBets, setAllBets] = useState<BetRecord[]>([]);
  const [myBets, setMyBets] = useState<BetRecord[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [cashoutNotices, setCashoutNotices] = useState<CashoutNotice[]>([]);
  const [insufficientBalanceNotices, setInsufficientBalanceNotices] = useState<InsufficientBalanceNotice[]>([]);
  const [timeoutNotices, setTimeoutNotices] = useState<TimeoutNotice[]>([]);

  const lastFetchedRoundUuid = useRef<string | null>(null);
  useEffect(() => {
    const roundUuid = aviatorLoop.getRoundUuid();
    if (!roundUuid) return;

    if (roundUuid !== lastFetchedRoundUuid.current) {
      lastFetchedRoundUuid.current = roundUuid;
      setAllBets([]);
      setMyBets([]);
    }

    if (phase === 'crashed') return;

    const poll = async () => {
      const bets = await fetchRoundBets(roundUuid);
      if (bets.length > 0) {
        setAllBets(bets);
        setMyBets(bets.filter((b) => b.isPlayer));
      }
    };

    void poll();
    const interval = setInterval(() => { void poll(); }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, roundId]);

  const showCashoutNotice = useCallback((amount: number, at: number) => {
    const id = Date.now() + Math.random();
    setCashoutNotices((prev) => [...prev, { id, multiplier: at, amount: amount * at }]);
    setTimeout(() => setCashoutNotices((prev) => prev.filter((n) => n.id !== id)), 2500);
  }, []);

  const showInsufficientBalanceNotice = useCallback(() => {
    const id = Date.now() + Math.random();
    setInsufficientBalanceNotices((prev) => [...prev, { id }]);
    setTimeout(() => setInsufficientBalanceNotices((prev) => prev.filter((n) => n.id !== id)), 2500);
  }, []);

  const showTimeoutNotice = useCallback(() => {
    const id = Date.now() + Math.random();
    setTimeoutNotices((prev) => [...prev, { id }]);
    setTimeout(() => setTimeoutNotices((prev) => prev.filter((n) => n.id !== id)), 2500);
  }, []);

  const pendingPlayerBets = useRef<{ panel: 0 | 1; amount: number }[]>([]);

  const handlePlaceBet = useCallback(async (amount: number): Promise<PlaceBetResult> => {
    const limits = store.getGameLimits('aviator');
    if (amount < limits.min || amount > limits.max) {
      cms.toast({
        title: 'Bet out of range',
        body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`,
        kind: 'alert',
      });
      return { ok: false, reason: 'range' };
    }

    const debited = store.debitLocalOnly(amount);
    if (!debited) return { ok: false, reason: 'insufficient' };

    const session = auth.getSession();
    if (!session) {
      store.credit(amount);
      return { ok: false, reason: 'error' };
    }

    try {
      const result = await GameService.aviatorPlaceBet(
        session.userId,
        amount,
        aviatorLoop.getRoundUuid(),
      );

      if (!result.success) {
        store.credit(amount);
        if (result.balance_after != null) {
          store.setBalance(result.balance_after);
        }
        return { ok: false, reason: 'server_rejected' };
      }

      if (result.bet_id) {
        const event = new CustomEvent('aviator:bet_registered', { detail: { betId: result.bet_id } });
        window.dispatchEvent(event);
      }
      return { ok: true };
    } catch {
      store.credit(amount);
      return { ok: false, reason: 'error' };
    }
  }, []);

  const handleCancelBet = useCallback(
    (panel: 0 | 1, amount: number, betId?: string | null) => {
      const session = auth.getSession();
      if (session) {
        void GameService.aviatorCancelBet(session.userId, amount, betId ?? null)
          .then((res) => {
            if (res.success && res.balance_after != null) {
              store.setBalance(res.balance_after);
            } else {
              store.credit(amount);
            }
          })
          .catch(() => {
            store.credit(amount);
          });
      } else {
        store.credit(amount);
      }

      const id = `me-${roundId}-${panel}`;
      setAllBets((prev) => prev.filter((b) => b.id !== id));
      setMyBets((prev) => prev.filter((b) => b.id !== id));
      pendingPlayerBets.current = pendingPlayerBets.current.filter((p) => p.panel !== panel);
    },
    [roundId],
  );

  const handleCashOut = useCallback((amount: number, at: number) => {
    showCashoutNotice(amount, at);
    playCashOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCashoutNotice]);

  const handleWin = useCallback((_win: number) => {
    // Balance updated via store.setBalance in doCashOut.
  }, []);

  const wrapSetBet = useCallback(
    (panel: 0 | 1) => (updater: (b: BetState) => BetState) => {
      const setter = panel === 0 ? setBet0 : setBet1;
      setter((prev) => {
        const next = updater(prev);
        if (!prev.placed && next.placed && prev.roundId === roundId) {
          pendingPlayerBets.current.push({ panel, amount: next.amount });
          const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ betId: string }>).detail;
            const setter2 = panel === 0 ? setBet0 : setBet1;
            setter2((b) => ({ ...b, betId: detail.betId }));
            window.removeEventListener('aviator:bet_registered', handler);
          };
          window.addEventListener('aviator:bet_registered', handler);
          setTimeout(() => window.removeEventListener('aviator:bet_registered', handler), 10_000);
        }
        return next;
      });
    },
    [roundId],
  );

  const canShareBet = bet0.cashedOutAt !== null || bet1.cashedOutAt !== null;

  const handleSendChat = useCallback((text: string) => {
    setChat((c) => [
      ...c,
      { id: `c-${Date.now()}`, name: PLAYER_NAME, color: '#22c55e', text },
    ]);
  }, []);

  const handleShareBet = useCallback(() => {
    const cashed = [bet0, bet1].find((b) => b.cashedOutAt !== null);
    if (!cashed || cashed.cashedOutAt === null) return;
    const win = cashed.amount * cashed.cashedOutAt;
    const text = `✈️ ${PLAYER_NAME} cashed out at ${cashed.cashedOutAt.toFixed(2)}x (Won ${formatMoney(win)})`;
    setChat((c) => [
      ...c,
      { id: `sys-${Date.now()}`, name: 'system', color: '#e11d48', text, system: true },
    ]);
  }, [bet0, bet1]);

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-white select-none overflow-hidden">
      <Header
        balance={balance}
        soundOn={soundOn}
        musicOn={musicOn}
        animationOn={animationOn}
        onToggleSound={() => setSoundOn((s) => !s)}
        onToggleMusic={() => setMusicOn((m) => !m)}
        onToggleAnimation={() => setAnimationOn((a) => !a)}
        onBack={onBack}
      />

      <HistoryBar history={history} lastCrash={lastCrash} />

      <FlightCanvas
        phase={phase}
        multiplier={multiplier}
        countdown={countdown}
        animationOn={animationOn}
        cashoutNotices={cashoutNotices}
        insufficientBalanceNotices={insufficientBalanceNotices}
        timeoutNotices={timeoutNotices}
      />

      <div className="flex flex-col gap-2 px-0 py-1">
        <BettingPanel
          panel={0}
          bet={bet0}
          setBet={wrapSetBet(0)}
          phase={phase}
          roundId={roundId}
          onPlaceBet={handlePlaceBet}
          onCancelBet={(amount, betId) => handleCancelBet(0, amount, betId)}
          onCashOut={handleCashOut}
          onWin={handleWin}
          onInsufficientBalance={showInsufficientBalanceNotice}
          onTimeout={showTimeoutNotice}
        />
        <BettingPanel
          panel={1}
          bet={bet1}
          setBet={wrapSetBet(1)}
          phase={phase}
          roundId={roundId}
          onPlaceBet={handlePlaceBet}
          onCancelBet={(amount, betId) => handleCancelBet(1, amount, betId)}
          onCashOut={handleCashOut}
          onWin={handleWin}
          onInsufficientBalance={showInsufficientBalanceNotice}
          onTimeout={showTimeoutNotice}
        />
      </div>

      <Sidebar
        phase={phase}
        multiplier={multiplier}
        allBets={allBets}
        myBets={myBets}
        chat={chat}
        onSendChat={handleSendChat}
        onShareBet={handleShareBet}
        canShareBet={canShareBet}
      />
    </div>
  );
}
