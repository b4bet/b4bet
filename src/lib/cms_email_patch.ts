  async setDepositStatus(id: string, status: DepositRequest['status'], utr?: string, reason?: string) {
    const { emailService } = await import('./emailService');
    const before = this.deposits.find(d => d.id === id);
    this.deposits = this.deposits.map(d => d.id === id ? { ...d, status, utr: utr ?? d.utr, reason: reason ?? d.reason } : d);
    if (before && before.status !== status) {
      const statusLabel = status === 'approved' ? 'Successful' : status === 'cancelled' ? 'Cancelled' : status === 'processing' ? 'Processing' : status === 'rejected' ? 'Failed' : status;
      const reasonText = reason ? `: ${reason}` : '';
      this.pushFromTemplate('nt_deposit_ok', `Deposit ${statusLabel}`, `Your deposit of ${store.currency}${before.amount.toFixed(2)} via ${before.method} is ${status}${reasonText}.`, status === 'approved' ? 'success' : status === 'processing' ? 'info' : 'warn');

      // Send deposit email when approved or rejected
      if ((status === 'approved' || status === 'rejected') && before.userId) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('balance')
            .eq('id', before.userId)
            .single();
          const { data: authUser } = await supabase.auth.admin?.getUserById?.(before.userId) ?? { data: null };
          const userEmail = (authUser as { user?: { email?: string } } | null)?.user?.email || '';
          if (userEmail) {
            emailService.sendDepositEmail(
              userEmail,
              before.user,
              `${store.currency}${before.amount.toFixed(2)}`,
              `${store.currency}${((profile?.balance as number) ?? 0).toFixed(2)}`,
              id,
            );
          }
        } catch { /* silent */ }
      }
    }
    if (status === 'approved') {
      if (before) bus.emit(Topics.ReferralDepositApproved, { username: before.user, amount: before.amount });
      const { error: creditErr } = await supabase.rpc('admin_approve_deposit_credit', { p_txn_id: id });
      if (creditErr) {
        this.toast({ title: 'Balance credit failed', body: creditErr.message, kind: 'alert' });
      }
    }
    this.emitFinance();
    const { error: statusErr } = await supabase.rpc('admin_update_transaction', { p_id: id, p_status: status, p_utr: utr ?? null, p_reason: reason ?? null });
    if (statusErr) {
      this.toast({ title: 'Status update failed', body: statusErr.message, kind: 'alert' });
      throw statusErr;
    }
  }

  async setWithdrawalStatus(id: string, status: WithdrawalRequest['status'], utr?: string, reason?: string) {
    const { emailService } = await import('./emailService');
    const before = this.withdrawals.find(w => w.id === id);
    this.withdrawals = this.withdrawals.map(w => w.id === id ? { ...w, status, utr: utr ?? w.utr, reason: reason ?? w.reason } : w);
    if (before && before.status !== status) {
      const utrText = utr ? ` (UTR: ${utr})` : '';
      const reasonText = reason ? `: ${reason}` : '';
      this.pushFromTemplate('nt_withdrawal_ok', `Withdrawal ${status}`, `Your withdrawal of ${store.currency}${before.amount.toFixed(2)} to ${before.destination} is ${status}${utrText}${reasonText}.`, status === 'approved' ? 'success' : 'info');

      // Send withdrawal email on any status change
      if (before.userId) {
        try {
          const { data: authUser } = await supabase.auth.admin?.getUserById?.(before.userId) ?? { data: null };
          const userEmail = (authUser as { user?: { email?: string } } | null)?.user?.email || '';
          if (userEmail) {
            emailService.sendWithdrawalEmail(
              userEmail,
              before.user,
              `${store.currency}${before.amount.toFixed(2)}`,
              status,
              id,
            );
          }
        } catch { /* silent */ }
      }
    }
    this.emitFinance();
    const { error: statusErr } = await supabase.rpc('admin_update_transaction', { p_id: id, p_status: status, p_utr: utr ?? null, p_reason: reason ?? null });
    if (statusErr) {
      this.toast({ title: 'Status update failed', body: statusErr.message, kind: 'alert' });
      throw statusErr;
    }
  }