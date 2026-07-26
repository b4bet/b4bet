/**
 * crashPendingBets.ts
 * 
 * Standalone module — does NOT touch crashEngine.ts at all.
 * Listens to crash bus events and syncs bets to crash_pending_bets table.
 * Imported once from CrashView.tsx.
 */
import { bus, Topics } from './bus';
import { auth } from './auth';
import { supabase } from '../integrations/supabase/client';
import type { CrashState } from './crashEngine';

interface BetSlot {
  id: 'A' | 'B';
  amount: number;
  placed: boolean;
  cashedOutAt: number | null;
  cashedOut: boolean;
  win: number | null;
}

// track pending bet IDs per slot
const pendingIds: Record<'A' | 'B', string | null> = { A: null, B: null };
let lastBets: Record<'A' | 'B', BetSlot | null> = { A: null, B: null };
let currentRoundId = '';

async function upsertBet(slot: BetSlot, roundId: string) {
  const session = auth.getSession();
  if (!session || !roundId) return;

  if (!pendingIds[slot.id]) {
    // INSERT new pending bet
    const { data, error } = await supabase
      .from('crash_pending_bets')
      .insert({
        user_id: session.userId,
        username: session.username,
        bet_amount: slot.amount,
        round_uuid: roundId,
        status: 'active',
        win_amount: 0,
      })
      .select('id')
      .single();
    if (!error && data) {
      pendingIds[slot.id] = (data as { id: string }).id;
    }
  }
}

async function updateBetStatus(slot: BetSlot, status: 'won' | 'lost') {
  const pid = pendingIds[slot.id];
  if (!pid) return;
  await supabase
    .from('crash_pending_bets')
    .update({
      status,
      cash_out_at: slot.cashedOutAt,
      win_amount: slot.win ?? 0,
    })
    .eq('id', pid);
}

async function clearRoundBets(roundId: string) {
  if (!roundId) return;
  await supabase.from('crash_pending_bets').delete().eq('round_uuid', roundId);
  pendingIds.A = null;
  pendingIds.B = null;
  lastBets = { A: null, B: null };
}

let started = false;

export function startCrashPendingBetsSync() {
  if (started) return;
  started = true;

  // Listen to CrashState changes
  bus.on(Topics.CrashState, (payload) => {
    const state = payload as CrashState;

    // New round detected — clear old bets
    if (state.roundId && state.roundId !== currentRoundId) {
      const oldRound = currentRoundId;
      currentRoundId = state.roundId;
      pendingIds.A = null;
      pendingIds.B = null;
      lastBets = { A: null, B: null };
      if (oldRound) void clearRoundBets(oldRound);
    }

    // Check each slot for changes
    for (const slotId of ['A', 'B'] as const) {
      const slot = state.bets[slotId];
      const prev = lastBets[slotId];

      if (!slot.placed) continue;

      // Newly placed bet
      if (!prev?.placed) {
        lastBets[slotId] = slot;
        void upsertBet(slot, state.roundId);
        continue;
      }

      // Cashed out
      if (slot.cashedOut && !prev.cashedOut) {
        lastBets[slotId] = slot;
        void updateBetStatus(slot, 'won');
        continue;
      }

      // Busted (round over, slot was active)
      if (state.phase === 'busted' && !slot.cashedOut && prev && prev.placed && slot.win === 0 && prev.win !== 0) {
        lastBets[slotId] = slot;
        void updateBetStatus(slot, 'lost');
      }
    }
  });
}
