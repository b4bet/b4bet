function rowToMyBet(row: RpcBetRow): MyBetEntry | null {
  const d = row.bet_details;
  if (!d) return null;
  // Accept all sun vs moon bets — with or without game field
  const betChoice = d.bet_choice ?? d.bet;
  if (!isBetChoice(betChoice) || !isBetChoice(d.result)) return null;
  const rn = d.round_number != null ? Number(d.round_number) : NaN;
  return {
    id: row.id,
    round: !isNaN(rn) && rn > 0 ? rn : null,
    bet: betChoice,
    result: d.result,
    stake: Number(row.bet_amount),
    win: Number(row.win_amount),
  };
}