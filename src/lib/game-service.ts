  /**
   * Register a bet on the server during the waiting phase.
   * Returns bet_id which should be stored and passed to aviatorCashout
   * for direct bet lookup (avoids round_uuid race condition).
   *
   * placed_at_ms — exact client timestamp when user clicked BET.
   * The server uses this (not Date.now()) to validate timing so a
   * slow cold-start doesn't falsely reject bets placed during waiting.
   */
  aviatorPlaceBet(
    userId: string,
    betAmount: number,
    roundUuid: string | null,
    placedAtMs?: number,
  ): Promise<AviatorPlaceBetResult> {
    return post<AviatorPlaceBetResult>({
      action: 'aviator_place_bet',
      user_id: userId,
      bet_amount: betAmount,
      round_uuid: roundUuid,
      placed_at_ms: placedAtMs ?? Date.now(),
    });
  },