import { useEffect, useState } from 'react';
import { bus, Topics } from './bus';
import { store } from './store';
import { auth } from './auth';
import type { AuthSession } from './auth';
import type { AdminConfig, NotificationItem, CrashBetRecord, MinesRoundRecord } from './store';
import type { CrashState, BetSlot } from './crashEngine';

export function useBus<T>(topic: string, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    setValue(initial);
    return bus.on(topic, (p) => setValue(p as T));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);
  return value;
}

export function useBalance(): number {
  return useBus<number>(Topics.Balance, store.balance);
}

export function useNotifications(): NotificationItem[] {
  return useBus<NotificationItem[]>(Topics.Notification, store.notifications);
}

export function useAdminConfig(): AdminConfig {
  return useBus<AdminConfig>(Topics.AdminConfig, store.admin);
}

export function useCrashState(): CrashState {
  return useBus<CrashState>(Topics.CrashState, crashEngine.getState());
}

export function useCrashBets(): Record<'A' | 'B', BetSlot> {
  return useBus<Record<'A' | 'B', BetSlot>>(Topics.CrashBets, crashEngine.getBets());
}

export function useCrashHistory(): number[] {
  return useBus<number[]>(Topics.CrashHistory, crashEngine.getState().history);
}

export function useCrashMyBets(): CrashBetRecord[] {
  return useBus<CrashBetRecord[]>(Topics.CrashMyBets, store.crashMyBets);
}

export function useMinesMyHistory(): MinesRoundRecord[] {
  return useBus<MinesRoundRecord[]>(Topics.MinesMyHistory, store.minesMyHistory);
}

// Re-export for convenience
import { crashEngine } from './crashEngine';
import { gameLogos } from './gameLogos';
import type { GameKey } from './gameLogos';

export { crashEngine };

export function useGameLogos(): Partial<Record<GameKey, string>> {
  return useBus<Partial<Record<GameKey, string>>>(Topics.GameLogos, gameLogos.all());
}

export function useAuth(): AuthSession | null {
  const [session, setSession] = useState<AuthSession | null>(auth.getSession());
  useEffect(() => {
    return bus.on(Topics.AuthState, (s) => setSession(s as AuthSession | null));
  }, []);
  return session;
}


/** Subscribe to a per-game round counter. Re-renders when that game advances. */
export function useGameRound(gameKey: string): number {
  const [round, setRound] = useState<number>(() => store.getGameRound(gameKey));
  useEffect(() => {
    setRound(store.getGameRound(gameKey));
    return bus.on(Topics.GameRound, (payload) => {
      const p = payload as { gameKey: string; round: number } | undefined;
      if (p && p.gameKey === gameKey) setRound(p.round);
    });
  }, [gameKey]);
  return round;
}
