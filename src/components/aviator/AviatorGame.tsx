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

  useEffect(() => {
    if (phase !== 'flying') return;
    // No fake bets added during flight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, roundId]);

  useEffect(() => {
    if (phase !== 'flying') return;
    // No fake cashouts processed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiplier, phase]);

  /**
   * Called by BettingPanel when the player clicks BET.
   *
   * Returns a Promise<{ ok: boolean; reason?: string }> —
   *   ok: true  → bet was accepted by server, balance already deducted server-side
   *   ok: false → bet rejected or network error, local balance refunded
   *
   * Uses debitLocalOnly() to avoid double-deduction: the server (aviator_place_bet)
   * also deducts from Supabase balance.
   */
  const handlePlaceBet = useCallback(async (amount: number): Promise<{ ok: boolean; reason?: string }> => {
    const limits = store.getGameLimits('aviator');
    if (amount < limits.min || amount > limits.max) {
      cms.toast({
        title: 'Bet out of range',
        body: `Aviator bets must be between ${store.currency}${limits.min} and ${store.currency}${limits.max}`,
        kind: 'alert',
      });
      return { ok: false, reason: 'range' };
    }

    // Use debitLocalOnly: the server (aviator_place_bet) deducts from Supabase.
    // debit() would also write to Supabase causing a double deduction.
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
        Date.now(),
      );

      if (!result.success) {
        // Server soft-rejected (e.g. "Round already ended", "Betting window closed")
        // Refund the local debit so balance stays accurate.
        store.credit(amount);
        return { ok: false, reason: 'server_rejected' };
      }

      // Bet accepted — dispatch bet_id for panel state update
      if (result.bet_id) {
        const event = new CustomEvent('aviator:bet_registered', { detail: { betId: result.bet_id } });
        window.dispatchEvent(event);
      }
      return { ok: true };
    } catch {
      // Network / server error — refund local debit
      store.credit(amount);
      return { ok: false, reason: 'error' };
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
          // Listen for server bet_id and store it in this panel's state
          const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ betId: string }>).detail;
            const setter2 = panel === 0 ? setBet0 : setBet1;
            setter2((b) => ({ ...b, betId: detail.betId }));
            window.removeEventListener('aviator:bet_registered', handler);
          };
          window.addEventListener('aviator:bet_registered', handler);
          // Auto-cleanup after 10s to avoid leaks
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
    <div className="flex flex-col h-full bg-[#0e0e1a] text-white overflow-hidden">
      <Header
        soundOn={soundOn}
        musicOn={musicOn}
        animationOn={animationOn}
        onToggleSound={() => setSoundOn((v) => !v)}
        onToggleMusic={() => setMusicOn((v) => !v)}
        onToggleAnimation={() => setAnimationOn((v) => !v)}
        onBack={onBack}
      />
      <HistoryBar history={history} lastCrash={lastCrash} />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          <FlightCanvas
            phase={phase}
            multiplier={multiplier}
            countdown={countdown}
            animationOn={animationOn}
            cashoutNotices={cashoutNotices}
            insufficientBalanceNotices={insufficientBalanceNotices}
            timeoutNotices={timeoutNotices}
          />
          <div className="flex gap-2 p-2 bg-[#12121f] border-t border-white/5">
            <BettingPanel
              bet={bet0}
              setBet={wrapSetBet(0)}
              phase={phase}
              multiplier={multiplier}
              countdown={countdown}
              roundId={roundId}
              balance={balance}
              onPlaceBet={handlePlaceBet}
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
              onPlaceBet={handlePlaceBet}
              onCancelBet={(amount) => handleCancelBet(1, amount)}
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
      <div className="text-center text-[10px] text-white/20 py-1 bg-[#0a0a14]">
        🔒 Official Live Game&nbsp; · &nbsp;Secure &amp; Provably Fair&nbsp; · &nbsp;18+ Responsible Play
      </div>
    </div>
  );
}
