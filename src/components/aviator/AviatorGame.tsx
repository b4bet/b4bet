import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './Header';
import { HistoryBar } from './HistoryBar';
import { FlightCanvas, type CashoutNotice, type InsufficientBalanceNotice, type TimeoutNotice } from './FlightCanvas';
import { useGameAudio } from './game/useGameAudio';
import { BettingPanel, createInitialBet, type BetState } from './BettingPanel';
import { Sidebar, makeSimBet, type BetRecord, type ChatMessage } from './Sidebar';
import { useAviatorGame } from './game/useAviatorGame';
import { formatMoney, randomAvatarColor, randomName } from './game/format';
import { useBalance } from '../../lib/hooks';
import { store } from '../../lib/store';
import { cms } from '../../lib/cms';
import { auth } from '../../lib/auth';
import { GameService } from '../../lib/game-service';
import { aviatorLoop } from '../../lib/persistentGameEngine';

const PLAYER_NAME = 'You';

/**
 * Grace window (ms) after round starts flying.
 * During this window: cancel is still allowed.
 * After this window: auto-cancel fires and bet is re-queued for next round.
 */
const FLYING_GRACE_MS = 2000;

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

  // Track whether we're inside the 2-second grace window after flying starts
  const [flyingGrace, setFlyingGrace] = useState(false);
  const flyingGraceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPhase = useRef<string>(phase);

  // handleCancelBet ref so we can call it inside timers without stale closure
  const handleCancelBetRef = useRef<(panel: 0 | 1, amount: number, betId: string | null, requeue?: boolean) => void>(
    () => {}
  );

  useEffect(() => {
    if (phase === 'flying' && prevPhase.current !== 'flying') {
      // Flying just started — open 2s grace window
      setFlyingGrace(true);
      if (flyingGraceTimer.current) clearTimeout(flyingGraceTimer.current);

      // Capture current bet states at the moment flying starts
      const snap0 = bet0;
      const snap1 = bet1;

      flyingGraceTimer.current = setTimeout(() => {
        setFlyingGrace(false);
        // Auto-cancel any bet that is still placed (wasn't manually cashed out or cancelled)
        if (snap0.placed && snap0.cashedOutAt === null) {
          handleCancelBetRef.current(0, snap0.amount, snap0.betId, true);
        }
        if (snap1.placed && snap1.cashedOutAt === null) {
          handleCancelBetRef.current(1, snap1.amount, snap1.betId, true);
        }
      }, FLYING_GRACE_MS);
    }
    if (phase !== 'flying') {
      setFlyingGrace(false);
      if (flyingGraceTimer.current) {
        clearTimeout(flyingGraceTimer.current);
        flyingGraceTimer.current = null;
      }
    }
    prevPhase.current = phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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
   * Called by BettingPanel when the player clicks BET.
   */
  const handlePlaceBet = useCallback(async (amount: number): Promise<boolean> => {
    const limits = store.getGameLimits('aviator');
    if (amount < limits.min || amount > limits.max) {
      cms.toast({
        title: 'Bet out of range',
        body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`,
        kind: 'alert',
      });
      return false;
    }
    const ok = store.debitLocalOnly(amount);
    if (!ok) return false;

    const session = auth.getSession();
    if (!session) {
      store.credit(amount);
      return false;
    }

    try {
      const result = await GameService.aviatorPlaceBet(
        session.userId,
        amount,
        aviatorLoop.getRoundUuid(),
      );
      if (result.success && result.bet_id) {
        const event = new CustomEvent('aviator:bet_registered', { detail: { betId: result.bet_id } });
        window.dispatchEvent(event);
      }
      return true;
    } catch {
      store.credit(amount);
      return false;
    }
  }, []);

  /**
   * Cancel a placed bet and optionally requeue for next round (auto-cancel after grace window).
   * requeue=true means the bet will auto-fire again on the next round start.
   */
  const handleCancelBet = useCallback(
    (panel: 0 | 1, amount: number, betId: string | null, requeue = false) => {
      // Refund local balance display
      store.credit(amount);

      // Remove from UI bet lists
      const id = `me-${roundId}-${panel}`;
      setAllBets((prev) => prev.filter((b) => b.id !== id));
      setMyBets((prev) => prev.filter((b) => b.id !== id));
      pendingPlayerBets.current = pendingPlayerBets.current.filter((p) => p.panel !== panel);

      // If requeue: mark pendingNextRound so bet fires again on next round
      const setter = panel === 0 ? setBet0 : setBet1;
      setter((b) => ({
        ...b,
        placed: false,
        betId: null,
        cashedOutAt: null,
        pendingNextRound: requeue ? true : b.pendingNextRound,
      }));

      // Call server to refund Supabase balance
      const session = auth.getSession();
      if (session) {
        void GameService.aviatorCancelBet(
          session.userId,
          amount,
          betId,
        ).then((res) => {
          if (res.success) {
            store.setBalance(res.balance_after);
          }
        }).catch(() => {});
      }
    },
    [roundId],
  );

  // Keep ref in sync so the grace timeout can call the latest version
  useEffect(() => {
    handleCancelBetRef.current = handleCancelBet;
  }, [handleCancelBet]);

  const handleCashOut = useCallback((amount: number, at: number) => {
    showCashoutNotice(amount, at);
    playCashOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCashoutNotice]);

  const handleWin = useCallback((win: number) => {
    store.credit(win);
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
          const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ betId: string }>).detail;
            const setter2 = panel === 0 ? setBet0 : setBet1;
            setter2((b) => ({ ...b, betId: detail.betId }));
            window.removeEventListener('aviator:bet_registered', handler);
          };
          window.addEventListener('aviator:bet_registered', handler);
          setTimeout(() => window.removeEventListener('aviator:bet_registered', handler), 10_000);
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
    <div className="flex flex-col h-full min-h-0 bg-ink-900 text-white">
      <Header onBack={onBack} soundOn={soundOn} setSoundOn={setSoundOn} musicOn={musicOn} setMusicOn={setMusicOn} animationOn={animationOn} setAnimationOn={setAnimationOn} />
      <HistoryBar history={history} lastCrash={lastCrash} />
      <div className="flex flex-1 min-h-0 gap-2 p-2">
        <div className="flex flex-col flex-1 min-h-0 gap-2">
          <FlightCanvas
            phase={phase}
            multiplier={multiplier}
            countdown={countdown}
            cashoutNotices={cashoutNotices}
            insufficientBalanceNotices={insufficientBalanceNotices}
            timeoutNotices={timeoutNotices}
            activeBetAmount={bet0.placed ? bet0.amount : (bet1.placed ? bet1.amount : undefined)}
            animationOn={animationOn}
          />
          <div className="flex gap-2">
            <BettingPanel
              bet={bet0}
              setBet={wrapSetBet(0)}
              phase={phase}
              multiplier={multiplier}
              countdown={countdown}
              roundId={roundId}
              balance={balance}
              flyingGrace={flyingGrace}
              onPlaceBet={handlePlaceBet}
              onCancelBet={(amount, betId) => handleCancelBet(0, amount, betId, false)}
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
              flyingGrace={flyingGrace}
              onPlaceBet={handlePlaceBet}
              onCancelBet={(amount, betId) => handleCancelBet(1, amount, betId, false)}
              onCashOut={handleCashOut}
              onWin={handleWin}
              onInsufficientBalance={showInsufficientBalanceNotice}
              onTimeout={showTimeoutNotice}
            />
          </div>
        </div>
        <Sidebar
          allBets={allBets}
          myBets={myBets}
          chat={chat}
          canShareBet={canShareBet}
          onSendChat={handleSendChat}
          onShareBet={handleShareBet}
        />
      </div>
      <div className="text-center text-xs text-ink-500 py-1 border-t border-ink-700">
        🔒 Official Live Game &nbsp;·&nbsp; Secure &amp; Provably Fair &nbsp;·&nbsp; 18+ Responsible Play
      </div>
    </div>
  );
}
