// Patch: Override setWithdrawalStatus so that cancelling a withdrawal
// uses the atomic server-side RPC (admin_cancel_withdrawal_with_refund)
// which sets status='cancelled' AND adds the amount back to profiles.balance in one transaction.
//
// This file is imported once in main.tsx after cms initialises.

import { supabase } from '@/integrations/supabase/client';
import { cms } from './cms';
import { bus, Topics } from './bus';
import { auth } from './auth';
import { store } from './store';

type WStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'cancelled';

// Statuses from which the user's balance was already deducted on submit
const DEDUCTED: Set<WStatus> = new Set(['pending', 'processing', 'approved']);

cms.setWithdrawalStatus = async function (
  id: string,
  status: WStatus,
  utr?: string,
  reason?: string,
) {
  const before = this.withdrawals.find((w) => w.id === id);

  // Optimistic local update so UI reflects change immediately
  this.withdrawals = this.withdrawals.map((w) =>
    w.id === id ? { ...w, status, utr: utr ?? w.utr, reason: reason ?? w.reason } : w,
  );
  bus.emit(Topics.Finance, { deposits: this.deposits, withdrawals: this.withdrawals });

  if (status === 'cancelled' && before) {
    // --- SERVER-SIDE ATOMIC CANCEL + REFUND ---
    // DB function: sets status='cancelled' AND profiles.balance += amount in one transaction.
    // Works for pending, processing, AND approved withdrawals.
    const { error: cancelErr } = await supabase.rpc(
      'admin_cancel_withdrawal_with_refund',
      { p_txn_id: id, p_reason: reason ?? null },
    );
    if (cancelErr) {
      // Revert optimistic update on failure
      this.withdrawals = this.withdrawals.map((w) =>
        w.id === id ? { ...w, status: before.status } : w,
      );
      bus.emit(Topics.Finance, { deposits: this.deposits, withdrawals: this.withdrawals });
      this.toast({ title: 'Cancel failed', body: cancelErr.message, kind: 'alert' });
      throw cancelErr;
    }
    // Notify the user
    const reasonText = reason ? `: ${reason}` : '';
    this.pushFromTemplate(
      'nt_withdrawal_refunded',
      'Withdrawal Cancelled',
      `Your withdrawal of ₹${before.amount.toFixed(2)} was cancelled${reasonText}. Amount refunded to your wallet.`,
      'warn',
    );

  } else {
    // --- ALL OTHER STATUS CHANGES (approved, rejected, processing) ---
    const isRefundable = status === 'rejected' && before && DEDUCTED.has(before.status);

    if (isRefundable && before) {
      // rejected: refund balance client-side (no dedicated RPC for rejected)
      store.creditLocalOnly(before.amount);
      const refundedBalance = store.balance;
      const userId = before.userId ?? auth.getSession()?.userId;
      if (userId) {
        supabase.from('profiles').update({ balance: refundedBalance }).eq('id', userId)
          .then(() => {}).catch(() => {});
      }
      const reasonText = reason ? `: ${reason}` : '';
      this.pushFromTemplate(
        'nt_withdrawal_refunded',
        'Withdrawal Refunded',
        `Your withdrawal of ₹${before.amount.toFixed(2)} was rejected${reasonText}. Amount refunded to your wallet.`,
        'warn',
      );
    } else if (before && before.status !== status) {
      const utrText = utr ? ` (UTR: ${utr})` : '';
      const reasonText = reason ? `: ${reason}` : '';
      this.pushFromTemplate(
        'nt_withdrawal_ok',
        `Withdrawal ${status}`,
        `Your withdrawal of ₹${before.amount.toFixed(2)} to ${before.destination} is ${status}${utrText}${reasonText}.`,
        status === 'approved' ? 'success' : 'info',
      );
    }

    const { error: statusErr } = await supabase.rpc('admin_update_transaction', {
      p_id: id,
      p_status: status,
      p_utr: utr ?? null,
      p_reason: reason ?? null,
    });
    if (statusErr) {
      this.toast({ title: 'Status update failed', body: statusErr.message, kind: 'alert' });
      throw statusErr;
    }
  }
};
