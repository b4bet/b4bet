// This patch adds client-side validation for UTR mandatory on withdrawal approve.
// The guard is already enforced in Supabase via admin_update_transaction function.
// This file documents the behavior for reference.
//
// Flow:
// 1. Admin clicks 'Approve' on a withdrawal request
// 2. Client-side: cms.setWithdrawalStatus checks if status === 'approved' and UTR is empty
// 3. If UTR missing: shows toast error and returns early (no API call)
// 4. Server-side: admin_update_transaction also validates as a safety net
//
// The UTR field label in the admin UI should show: "Transaction ID/UTR"
// This is generic enough to accept UPI UTR, Bank NEFT/IMPS ref, or any gateway txn ID.

export const WITHDRAWAL_UTR_REQUIRED_MSG = 'Transaction ID/UTR is mandatory when approving a withdrawal. Enter the payment reference number from your bank/UPI.';
