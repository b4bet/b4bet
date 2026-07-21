  const handleWin = useCallback((_win: number) => {
    // Balance is already updated via store.setBalance(res.balance_after) inside doCashOut.
    // Do NOT call store.credit here — that would double-add the winnings.
  }, []);