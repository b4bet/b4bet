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

// BettingPanel imports this type — do NOT remove this export.
export type PlaceBetResult = { ok: boolean; reason?: string };

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

  useEffect(() => {
    if (phase === 'waiting' && countdown > 5.6) {
      setAllBets([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

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
        // Server rejected the bet — refund local debit so UI balance is correct
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

  // handleWin intentionally does NOT call store.credit(win).
  // BettingPanel.doCashOut already calls store.setBalance(res.balance_after)
  // which sets the correct server-authoritative balance. Calling credit() here
  // as well would double-add the win amount.
  const handleWin = useCallback((_win: number) => {
    // Balance is already updated via store.setBalance(res.balance_after) in doCashOut.
    // Nothing to do here — keep the callback for future UI hooks (win animation, etc).
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
    <div className="aviator-root flex flex-col h-full w-full bg-aviator-bg overflow-hidden">
      {/* Header */}
      <Header
        balance={balance}
        soundOn={soundOn}
        onToggleSound={setSoundOn}
        musicOn={musicOn}
        onToggleMusic={setMusicOn}
        animationOn={animationOn}
        onToggleAnimation={setAnimationOn}
        onBack={onBack}
      />

      {/* History strip */}
      <HistoryBar history={history} />

      {/* Main scrollable area */}
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        {/* Flight canvas */}
        <FlightCanvas
          phase={phase}
          multiplier={multiplier}
          countdown={countdown}
          lastCrash={lastCrash}
          animationOn={animationOn}
          cashouts={cashoutNotices}
          insufficientBalanceNotices={insufficientBalanceNotices}
          timeoutNotices={timeoutNotices}
        />

        {/* Betting panels */}
        <div className="flex gap-2 p-2">
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

        {/* All Bets / My Bets / Top + Chat */}
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

      <div className="text-center text-xs text-aviator-muted py-1 opacity-50">
        🔒 Official Live Game&nbsp;·&nbsp;Secure &amp; Provably Fair&nbsp;·&nbsp;18+ Responsible Play
      </div>
    </div>
  );
}
