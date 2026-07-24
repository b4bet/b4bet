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

  const pendingPlayerBets = useRef<{ panel: 0 | 1; amount: number }[]>([]);

  useEffect(() => {
    if (phase === 'waiting' && countdown > 5.6) {
      setAllBets([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

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

  /**
   * Place bet — deducts locally and calls server.
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
    if (!session) { store.credit(amount); return false; }

    try {
      const result = await GameService.aviatorPlaceBet(
        session.userId,
        amount,
        aviatorLoop.getRoundUuid(),
      );
      if (result.success && result.bet_id) {
        window.dispatchEvent(new CustomEvent('aviator:bet_registered', { detail: { betId: result.bet_id } }));
      }
      return true;
    } catch {
      store.credit(amount);
      return false;
    }
  }, []);

  /**
   * Cancel during waiting phase only — refunds locally and on server.
   */
  const handleCancelBet = useCallback(
    (panel: 0 | 1, amount: number, betId: string | null) => {
      store.credit(amount);
      const id = `me-${roundId}-${panel}`;
      setAllBets((prev) => prev.filter((b) => b.id !== id));
      setMyBets((prev) => prev.filter((b) => b.id !== id));
      pendingPlayerBets.current = pendingPlayerBets.current.filter((p) => p.panel !== panel);

      const session = auth.getSession();
      if (session) {
        void GameService.aviatorCancelBet(session.userId, amount, betId)
          .then((res) => { if (res.success) store.setBalance(res.balance_after); })
          .catch(() => {});
      }
    },
    [roundId],
  );

  const handleCashOut = useCallback((amount: number, at: number) => {
    showCashoutNotice(amount, at);
    playCashOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCashoutNotice]);

  const handleWin = useCallback((win: number) => { store.credit(win); }, []);

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
    setChat((c) => [...c, { id: `c-${Date.now()}`, name: PLAYER_NAME, color: '#22c55e', text }]);
  }, []);

  const handleShareBet = useCallback(() => {
    const cashed = [bet0, bet1].find((b) => b.cashedOutAt !== null);
    if (!cashed || cashed.cashedOutAt === null) return;
    const win = cashed.amount * cashed.cashedOutAt;
    const text = `✈️ ${PLAYER_NAME} cashed out at ${cashed.cashedOutAt.toFixed(2)}x (Won ${formatMoney(win)})`;
    setChat((c) => [...c, { id: `sys-${Date.now()}`, name: 'system', color: '#e11d48', text, system: true }]);
  }, [bet0, bet1]);

  useEffect(() => { setChat([]); }, []);

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
            lastCrash={lastCrash ?? null}
            cashouts={cashoutNotices}
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
              onPlaceBet={handlePlaceBet}
              onCancelBet={(amount, betId) => handleCancelBet(0, amount, betId)}
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
              onPlaceBet={handlePlaceBet}
              onCancelBet={(amount, betId) => handleCancelBet(1, amount, betId)}
              onCashOut={handleCashOut}
              onWin={handleWin}
              onInsufficientBalance={showInsufficientBalanceNotice}
              onTimeout={showTimeoutNotice}
            />
          </div>
        </div>
        <Sidebar
          phase={phase}
          multiplier={multiplier}
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
