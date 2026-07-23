import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './Header';
import { HistoryBar } from './HistoryBar';
import { FlightCanvas, type CashoutNotice, type InsufficientBalanceNotice, type TimeoutNotice } from './FlightCanvas';
import { useGameAudio } from './game/useGameAudio';
import { BettingPanel, createInitialBet, type BetState } from './BettingPanel';
import { Sidebar, type BetRecord, type ChatMessage } from './Sidebar';
import { useAviatorGame } from './game/useAviatorGame';
import { formatMoney } from './game/format';
import { useBalance } from '../../lib/hooks';
import { store } from '../../lib/store';
import { cms } from '../../lib/cms';
import { auth } from '../../lib/auth';
import { GameService } from '../../lib/game-service';
import { aviatorLoop } from '../../lib/persistentGameEngine';

const PLAYER_NAME = 'You';

interface AviatorGameProps {
  onBack?: () => void;
}

export default function AviatorGame({ onBack }: AviatorGameProps) {
  const game = useAviatorGame();
  const { phase, multiplier, countdown, history, roundId, lastCrash } = game;

  const balance = useBalance();
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [animationOn, setAnimationOn] = useState(true);

  const { playCashOut } = useGameAudio(phase, soundOn, musicOn);

  const [bet0, setBet0] = useState<BetState>(() => createInitialBet(1));
  const [bet1, setBet1] = useState<BetState>(() => createInitialBet(1));

  const [allBets, setAllBets] = useState<BetRecord[]>([]);
  const [myBets, setMyBets] = useState<BetRecord[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [cashoutNotices, setCashoutNotices] = useState<CashoutNotice[]>([]);
  const [insufficientBalanceNotices, setInsufficientBalanceNotices] = useState<InsufficientBalanceNotice[]>([]);
  const [timeoutNotices, setTimeoutNotices] = useState<TimeoutNotice[]>([]);

  const showCashoutNotice = useCallback((amount: number, at: number) => {
    const id = Date.now() + Math.random();
    setCashoutNotices((prev) => [...prev, { id, multiplier: at, amount: amount * at }]);
    setTimeout(() => {
      setCashoutNotices((prev) => prev.filter((n) => n.id !== id));
    }, 2500);
  }, []);

  const showInsufficientBalanceNotice = useCallback(() => {
    const id = Date.now() + Math.random();
    setInsufficientBalanceNotices((prev) => [...prev, { id }]);
    setTimeout(() => {
      setInsufficientBalanceNotices((prev) => prev.filter((n) => n.id !== id));
    }, 2500);
  }, []);

  const showTimeoutNotice = useCallback(() => {
    const id = Date.now() + Math.random();
    setTimeoutNotices((prev) => [...prev, { id }]);
    setTimeout(() => {
      setTimeoutNotices((prev) => prev.filter((n) => n.id !== id));
    }, 2500);
  }, []);

  const pendingPlayerBets = useRef<{ panel: 0 | 1; amount: number }[]>([]);

  useEffect(() => {
    if (phase === 'waiting' && countdown > 5.6) {
      setAllBets([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  /**
   * Place-bet serialization queue.
   *
   * Problem: Both panels hit aviator_place_bet in parallel → server reads the
   * same balance for both → only one deduction actually happens in Supabase.
   *
   * Fix: Chain every server call. Panel 1 waits for Panel 0 to finish so
   * Supabase has already committed the first deduction before the second read.
   */
  const placeBetQueueRef = useRef<Promise<void>>(Promise.resolve());

  /**
   * @param amount     - Bet amount in currency units
   * @param placedAtMs - Timestamp (ms) when the user actually clicked BET.
   *   Passed to the server so it can validate timing using the client click
   *   time rather than the Edge Function execution time (which may be 2-4s
   *   later due to cold-start latency, causing false "betting window closed"
   *   rejections near the end of the waiting phase).
   */
  const handlePlaceBet = useCallback(async (amount: number, placedAtMs: number): Promise<{ ok: boolean; betId: string | null }> => {
    const limits = store.getGameLimits('aviator');
    if (amount < limits.min || amount > limits.max) {
      cms.toast({
        title: 'Bet out of range',
        body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`,
        kind: 'alert',
      });
      return { ok: false, betId: null };
    }

    // Deduct balance locally so UI updates instantly
    const ok = store.debitLocalOnly(amount);
    if (!ok) return { ok: false, betId: null };

    const session = auth.getSession();
    if (!session) {
      store.credit(amount);
      return { ok: false, betId: null };
    }

    // Serialize requests so two panels don't race on the same DB balance read
    let resolveQueue!: () => void;
    const myTurn = new Promise<void>((res) => { resolveQueue = res; });
    const prevQueue = placeBetQueueRef.current;
    placeBetQueueRef.current = myTurn;

    await prevQueue;

    try {
      const result = await GameService.aviatorPlaceBet(
        session.userId,
        amount,
        aviatorLoop.getRoundUuid(),
        placedAtMs,
      );

      if (!result.success) {
        // Server rejected (e.g. phase changed) — refund and abort
        store.credit(amount);
        return { ok: false, betId: null };
      }

      // Sync server-confirmed balance to prevent client/server drift
      if (typeof result.balance_after === 'number' && result.balance_after >= 0) {
        store.setBalance(result.balance_after);
      }

      return { ok: true, betId: result.bet_id ?? null };
    } catch {
      // Network error — refund locally
      store.credit(amount);
      return { ok: false, betId: null };
    } finally {
      resolveQueue();
    }
  }, []);

  const handleCancelBet = useCallback(
    (panel: 0 | 1, amount: number) => {
      store.credit(amount);
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

  /**
   * Balance is already set via store.setBalance(res.balance_after) inside
   * BettingPanel's doCashOut. Do NOT call store.credit here.
   */
  const handleWin = useCallback((_win: number) => {
    // intentionally empty — balance synced from server in doCashOut
  }, []);

  const recordPlayerBet = useCallback(
    (panel: 0 | 1, amount: number) => {
      const record: BetRecord = {
        id: `me-${roundId}-${panel}`,
        name: PLAYER_NAME,
        color: '#22c55e',
        amount,
        cashedOutAt: null,
        win: null,
        isPlayer: true,
      };
      setAllBets((prev) => [record, ...prev]);
      setMyBets((prev) => [record, ...prev]);
      pendingPlayerBets.current.push({ panel, amount });
    },
    [roundId],
  );

  const wrapSetBet = useCallback(
    (panel: 0 | 1) => (updater: (b: BetState) => BetState) => {
      const setter = panel === 0 ? setBet0 : setBet1;
      setter((prev) => {
        const next = updater(prev);
        if (!prev.placed && next.placed && prev.roundId === roundId) {
          recordPlayerBet(panel, next.amount);
        }
        if (prev.cashedOutAt === null && next.cashedOutAt !== null) {
          setAllBets((ab) =>
            ab.map((b) =>
              b.id === `me-${roundId}-${panel}`
                ? { ...b, cashedOutAt: next.cashedOutAt, win: b.amount * next.cashedOutAt! }
                : b,
            ),
          );
          setMyBets((mb) =>
            mb.map((b) =>
              b.id === `me-${roundId}-${panel}`
                ? { ...b, cashedOutAt: next.cashedOutAt, win: b.amount * next.cashedOutAt! }
                : b,
            ),
          );
        }
        return next;
      });
    },
    [roundId, recordPlayerBet],
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

  useEffect(() => {
    setChat([]);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-ink-900 text-white">
      <Header
        balance={balance}
        soundOn={soundOn}
        musicOn={musicOn}
        animationOn={animationOn}
        onToggleSound={setSoundOn}
        onToggleMusic={setMusicOn}
        onToggleAnimation={setAnimationOn}
        onBack={onBack}
      />
      <HistoryBar history={history} />
      <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-3 p-3 lg:flex-row lg:gap-4 lg:p-4">
        <div className="flex flex-1 flex-col gap-3 min-w-0">
          <FlightCanvas
            phase={phase}
            multiplier={multiplier}
            countdown={countdown}
            lastCrash={lastCrash}
            cashouts={cashoutNotices}
            insufficientBalanceNotices={insufficientBalanceNotices}
            timeoutNotices={timeoutNotices}
            animationOn={animationOn}
            activeBetAmount={
              (bet0.placed && bet0.cashedOutAt === null ? bet0.amount : 0) +
              (bet1.placed && bet1.cashedOutAt === null ? bet1.amount : 0)
            }
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BettingPanel
              bet={bet0}
              setBet={wrapSetBet(0)}
              phase={phase}
              multiplier={multiplier}
              countdown={countdown}
              roundId={roundId}
              balance={balance}
              onPlaceBet={(amount, placedAtMs) => handlePlaceBet(amount, placedAtMs)}
              onCancelBet={(amount) => handleCancelBet(0, amount)}
              onCashOut={handleCashOut}
              onWin={handleWin}
              onInsufficientBalance={showInsufficientBalanceNotice}
              onTimeout={showTimeoutNotice}
            />
            <BettingPanel
              bet={bet1}
              setBet={wrapSetBet(1)}
              phase={phase}
              multiplier={multiplier}
              countdown={countdown}
              roundId={roundId}
              balance={balance}
              onPlaceBet={(amount, placedAtMs) => handlePlaceBet(amount, placedAtMs)}
              onCancelBet={(amount) => handleCancelBet(1, amount)}
              onCashOut={handleCashOut}
              onWin={handleWin}
              onInsufficientBalance={showInsufficientBalanceNotice}
              onTimeout={showTimeoutNotice}
            />
          </div>
        </div>
        <div className="h-auto max-h-[420px] lg:max-h-none lg:h-auto lg:w-[340px] lg:shrink-0 overflow-hidden">
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
      </main>
      <footer className="footer-note px-4 py-3 text-center text-[11px] text-gray-500 border-t border-ink-800">
        🔒 Official Live Game &nbsp;·&nbsp; Secure &amp; Provably Fair &nbsp;·&nbsp; 18+ Responsible Play
      </footer>
    </div>
  );
}
