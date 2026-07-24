// PATCH: fix cashoutBet args order in persistentGameEngine.ts
// Old: GameService.aviatorCashout(userId, roundUuid, roundId, betAmount, multiplier, betId)
// New: GameService.aviatorCashout(userId, betAmount, cashoutAt, roundUuid, betId)
