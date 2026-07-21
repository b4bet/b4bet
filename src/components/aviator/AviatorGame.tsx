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
   * Returns a Promise<boolean> — true if bet was accepted locally.
   * Also registers bet on server and stores bet_id in BetState so cashout
   * can use direct ID lookup instead of fragile round_uuid matching.
   *
   * Uses debitLocalOnly() to avoid double-deduction: the server also
   * deducts from Supabase in aviator_place_bet.
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
    // Use debitLocalOnly: the server (aviator_place_bet) deducts from Supabase.
    // debit() would also write to Supabase causing a double deduction.
    const ok = store.debitLocalOnly(amount);
    if (!ok) return false;

    const session = auth.getSession();
    if (!session) {
      // Refund local debit if no session
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
        // Store bet_id in both panels' state — wrapSetBet will apply to the
        // calling panel. We use a panel-specific setter exposed via the
        // setBet0/setBet1 refs captured in closure.
        // Signal success back; the panel will call setBet to store betId.
        // We return the betId via a custom event so wrapSetBet can capture it.
        const event = new CustomEvent('aviator:bet_registered', { detail: { betId: result.bet_id } });
        window.dispatchEvent(event);
      }
      return true;
    } catch {
      // Server rejected bet — refund local debit so UI balance is correct.
      store.credit(amount);
      return false;
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
   * Balance is already updated server-side via store.setBalance(res.balance_after)
   * inside doCashOut in BettingPanel. Do NOT call store.credit here — that would
   * double-add the winnings and inflate the displayed balance.
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
