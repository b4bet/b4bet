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

/**
 * Result returned by handlePlaceBet.
 *
 * ok      – true if the bet was accepted by the server
 * reason  – why the bet was rejected (only when ok === false)
 *   'window_closed'  – plane already took off; caller should queue for next round
 *   'insufficient'   – not enough balance
 *   'error'          – any other server/network error
 */
export type PlaceBetResult = { ok: true } | { ok: false; reason: 'window_closed' | 'insufficient' | 'error' };

export default function AviatorGame({ onBack: _onBack }: AviatorGameProps) {
  const game = useAviatorGame();
  const { phase, multiplier, countdown, history, roundId, lastCrash } = game;

  const balance = useBalance();
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [animationOn, setAnimationOn] = useState(true);

  const { playCashOut } = useGameAudio(phase, soundOn, musicOn);

  const [bet0, setBet0] = useState<BetState>(() => createInitialBet(roundId));
  const [bet1, setBet1] = useState<BetState>(() => createInitialBet(roundId));

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

  const handlePlaceBet = useCallback(async (amount: number): Promise<PlaceBetResult> => {
    const limits = store.getGameLimits('aviator');
    if (amount < limits.min || amount > limits.max) {
      cms.toast({
        title: 'Bet out of range',
        body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`,
        kind: 'alert',
      });
      return { ok: false, reason: 'error' };
    }

    // Deduct balance locally (optimistic) — refund if server rejects
    const ok = store.debitLocalOnly(amount);
    if (!ok) return { ok: false, reason: 'insufficient' };

    const session = auth.getSession();
    if (!session) { store.credit(amount); return { ok: false, reason: 'error' }; }

    try {
      const result = await GameService.aviatorPlaceBet(
        session.userId,
        amount,
        aviatorLoop.getRoundUuid(),
      );

      if (!result.success) {
        store.credit(amount);

        const err = result.error ?? '';

        // Server says plane already took off — caller should queue for next round
        if (err === 'Betting window closed' || err === 'Round already ended') {
          return { ok: false, reason: 'window_closed' };
        }
        if (err === 'Insufficient balance') {
          showInsufficientBalanceNotice();
          return { ok: false, reason: 'insufficient' };
        }
        if (err) {
          cms.toast({ title: 'Bet failed', body: err, kind: 'alert' });
        }
        return { ok: false, reason: 'error' };
      }

      if (result.bet_id) {
        window.dispatchEvent(new CustomEvent('aviator:bet_registered', { detail: { betId: result.bet_id } }));
      }
      return { ok: true };
    } catch {
      store.credit(amount);
      return { ok: false, reason: 'error' };
    }
  }, [showInsufficientBalanceNotice]);

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
        // Record bet when placed transitions false → true
        if (!prev.placed && next.placed) {
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
    <div className="flex flex-col bg-ink-900 text-white min-h-screen overflow-x-hidden">
      <Header
        balance={balance}
        soundOn={soundOn}
        musicOn={musicOn}
        animationOn={animationOn}
        onToggleSound={setSoundOn}
        onToggleMusic={setMusicOn}
        onToggleAnimation={setAnimationOn}
      />
      <HistoryBar history={history} />

      {/* Main game area — padded inward from screen edges */}
      <div className="flex flex-1 gap-2 px-3 sm:px-5 py-2">
        {/* Left column: canvas + two bet panels stacked */}
        <div className="flex flex-col flex-1 gap-2 min-w-0">
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

          {/* Panel 1 above, Panel 2 below */}
          <div className="flex flex-col gap-2">
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

        {/* Sidebar: desktop only */}
        <div className="hidden lg:flex w-72 flex-shrink-0">
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
      </div>

      <div className="text-center text-xs text-ink-500 py-1 border-t border-ink-700 px-3">
        🔒 Official Live Game · Secure &amp; Provably Fair · 18+ Responsible Play
      </div>
    </div>
  );
}
