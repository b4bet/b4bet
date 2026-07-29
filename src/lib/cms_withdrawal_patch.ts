// Patch: Override setWithdrawalStatus to use the atomic server-side refund RPC
// when a withdrawal is cancelled, instead of doing a client-side balance patch.
//
// This file must be imported ONCE after cms is initialized (e.g. in main.tsx or App.tsx).

import { supabase } from '@/integrations/supabase/client';
import { cms } from './cms';
import { store } from './store';
import { bus, Topics } from './bus';
import { auth } from './auth';

type WStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'cancelled';
const DEDUCTED: Set<WStatus> = new Set(['pending', 'processing']);

cms.setWithdrawalStatus = async function (
  id: string,
  status: WStatus,
  utr?: string,
  reason?: string,
) {
  const before = this.withdrawals.find((w) => w.id === id);
  // Optimistic local update
  this.withdrawals = this.withdrawals.map((w) =>
    w.id === id ? { ...w, status, utr: utr ?? w.utr, reason: reason ?? w.reason } : w,
  );

  const isRefundable =
    (status === 'rejected' || status === 'cancelled') &&
    before &&
    DEDUCTED.has(before.status);

  if (status === 'cancelled' && before) {
    // --- SERVER-SIDE ATOMIC CANCEL + REFUND ---
    // The DB function atomically sets status = 'cancelled' AND adds amount back to profiles.balance.
    const { error: cancelErr } = await supabase.rpc(
      'admin_cancel_withdrawal_with_refund',
      { p_txn_id: id, p_reason: reason ?? null },
    );
    if (cancelErr) {
      this.toast({ title: 'Cancel failed', body: cancelErr.message, kind: 'alert' });
      throw cancelErr;
    }
    // Also reflect the refund in the local client store so balance updates instantly in the UI
    if (isRefundable) {
      store.creditLocalOnly(before.amount);
    }
    const reasonText = reason ? `: ${reason}` : '';
    this.pushFromTemplate(
      'nt_withdrawal_refunded',
      'Withdrawal Cancelled',
      `Your withdrawal of \u20b9${before.amount.toFixed(2)} was cancelled${reasonText}. Amount refunded to your wallet.`,
      'warn',
    );
  } else {
    // --- ALL OTHER STATUS CHANGES ---
    if (isRefundable && before) {
      // rejected from pending/processing: refund client-side
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
        `Your withdrawal of \u20b9${before.amount.toFixed(2)} was ${status}${reasonText}. Amount refunded to your wallet.`,
        'warn',
      );
    } else if (before && before.status !== status) {
      const utrText = utr ? ` (UTR: ${utr})` : '';
      const reasonText = reason ? `: ${reason}` : '';
      this.pushFromTemplate(
        'nt_withdrawal_ok',
        `Withdrawal ${status}`,
        `Your withdrawal of \u20b9${before.amount.toFixed(2)} to ${before.destination} is ${status}${utrText}${reasonText}.`,
        status === 'approved' ? 'success' : 'info',
      );
    }
    // Update status in DB
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

  bus.emit(Topics.Finance, { deposits: this.deposits, withdrawals: this.withdrawals });
};
