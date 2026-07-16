import { useEffect, useState } from 'react';
import { aviatorLoop, EngineTopics, type AviatorEngineState } from '../../../lib/persistentGameEngine';
import { bus } from '../../../lib/bus';

export type Phase = 'waiting' | 'flying' | 'crashed';

export interface RoundResult {
  id: number;
  crashPoint: number;
}

export interface GameState {
  phase: Phase;
  multiplier: number;
  countdown: number; // seconds remaining in waiting phase
  history: number[]; // most recent first
  roundId: number;
  lastCrash: number | null;
}

// The Aviator round loop now lives in `aviatorLoop` (see
// `src/lib/persistentGameEngine.ts`). It runs continuously at module scope
// so the round timer, multiplier and history keep advancing regardless of
// which view is mounted — mirroring the Crash engine pattern. This hook
// just subscribes to the broadcast so React components re-render.
export function useAviatorGame() {
  const [state, setState] = useState<GameState>(() => {
    const s: AviatorEngineState = aviatorLoop.getState();
    return { ...s };
  });
  useEffect(() => {
    const off = bus.on(EngineTopics.AviatorState, (payload) => {
      setState({ ...(payload as AviatorEngineState) });
    });
    return off;
  }, []);
  return state;
}
