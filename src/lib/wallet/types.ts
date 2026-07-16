// ============================================================
// Wallet domain — canonical types
//
// Balances are COMPUTED from bookings + payouts + payout_items.
// No wallet table exists in the DB — every figure derives from
// the booking/payment state machine anchored in the migrations.
// ============================================================

import type { BookingStatus, PayoutStatus, PaymentStatus } from "@/lib/host/types";

export type { BookingStatus, PayoutStatus, PaymentStatus };

// ── Wallet owner ─────────────────────────────────────────────

export type WalletOwner = "host" | "platform";

// ── Wallet balance snapshot ───────────────────────────────────
//
// Host lifecycle:
//   booking confirmed  → pending_balance += host_payout_amount
//   booking completed  → pending_balance -= host_payout_amount
//                        available_balance += host_payout_amount
//   payout paid        → available_balance -= amount
//                        withdrawn_balance += amount
//
// Platform lifecycle (commission):
//   booking confirmed  → platform_pending += commission_amount
//   booking completed  → platform_pending -= commission_amount
//                        platform_available += commission_amount
//   booking refunded   → platform_available -= refunded_commission

export type HostWalletBalance = {
  hostId: string;
  /** SUM host_payout_amount for confirmed/checked_in bookings (payout_status=pending) */
  pendingBalance: number;
  /** SUM host_payout_amount for completed bookings (payout_status=pending) */
  availableBalance: number;
  /** SUM payout.amount_fcfa for paid payouts */
  withdrawnBalance: number;
  /** Total earned ever = available + withdrawn */
  totalEarned: number;
  currency: "XOF";
  computedAt: string;
};

export type PlatformWalletBalance = {
  /** SUM commission_amount for confirmed/checked_in bookings */
  pendingCommission: number;
  /** SUM commission_amount for completed bookings */
  availableCommission: number;
  /** Total commission collected */
  totalCommission: number;
  currency: "XOF";
  computedAt: string;
};

// ── Ledger entry ──────────────────────────────────────────────
//
// A ledger entry records ONE financial movement.
// Nothing is modified directly — every change must produce an entry.
// Entries are DERIVED from booking_events + payment_events + refunds.

export type LedgerEntryType =
  | "booking_accommodation_credit"   // +host_payout_amount → host pending
  | "booking_commission_credit"      // +commission_amount → platform pending
  | "booking_service_fee_credit"     // +service_fee_amount → platform pending
  | "booking_completed_release"      // host pending → host available
  | "booking_cancelled_reversal"     // reverses a booking credit
  | "payout_debit"                   // host available → withdrawn (at request time)
  | "payout_reversal"                // host withdrawn → host available (on cancellation)
  | "refund_accommodation_debit"     // reverses accommodation (refund to traveler)
  | "refund_commission_debit"        // reverses commission (refund to traveler)
  | "refund_service_fee_debit"       // reverses service fee
  | "manual_adjustment";             // admin correction

export type LedgerWallet =
  | "host_pending"
  | "host_available"
  | "host_withdrawn"
  | "platform_pending"
  | "platform_available";

export type LedgerEntry = {
  id: string;
  type: LedgerEntryType;
  debitWallet: LedgerWallet | null;
  creditWallet: LedgerWallet | null;
  amountFcfa: number;
  currency: "XOF";
  bookingId: string | null;
  payoutId: string | null;
  refundId: string | null;
  reference: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

// ── Transaction records ───────────────────────────────────────

export type TransactionDirection = "credit" | "debit";

export type WalletTransaction = {
  id: string;
  walletOwner: WalletOwner;
  hostId: string | null;
  direction: TransactionDirection;
  amountFcfa: number;
  currency: "XOF";
  ledgerType: LedgerEntryType;
  reference: string;
  description: string;
  bookingId: string | null;
  bookingReference: string | null;
  payoutId: string | null;
  createdAt: string;
};

export type PaymentTransaction = {
  id: string;
  bookingId: string;
  bookingReference: string;
  payerId: string;
  method: string;
  status: PaymentStatus;
  amountFcfa: number;
  processorFeeFcfa: number;
  netAmountFcfa: number;
  currency: "XOF";
  capturedAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type RefundTransaction = {
  id: string;
  paymentId: string;
  bookingId: string;
  bookingReference: string;
  refundType: string;
  status: string;
  refundAmountFcfa: number;
  processorFeeFcfa: number;
  netRefundFcfa: number;
  currency: "XOF";
  reason: string;
  requestedBy: string | null;
  approvedBy: string | null;
  processedAt: string | null;
  createdAt: string;
};

export type WithdrawalTransaction = {
  id: string;
  hostId: string;
  status: PayoutStatus;
  amountFcfa: number;
  currency: "XOF";
  method: string;
  payoutAccountSnapshot: string;
  periodStart: string;
  periodEnd: string;
  scheduledFor: string | null;
  dispatchedAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  retryCount: number;
  createdAt: string;
};

// ── Withdrawal request ────────────────────────────────────────

export type WithdrawalRequest = {
  amountFcfa: number;
  method: "orange_money" | "moov_money" | "bank";
  accountDetails: string;
};

export type WithdrawalValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

// ── Financial lifecycle state ─────────────────────────────────

export type FinancialLifecycleState =
  | "draft"
  | "pricing_computed"
  | "payment_pending"
  | "payment_processing"
  | "payment_captured"
  | "booking_confirmed"
  | "funds_in_pending"
  | "checked_out"
  | "funds_released"
  | "withdrawal_requested"
  | "withdrawal_approved"
  | "withdrawal_paid"
  | "cancelled"
  | "refunded";

// ── Host financial dashboard ──────────────────────────────────

export type HostFinancialDashboard = {
  wallet: HostWalletBalance;
  monthlyRevenueFcfa: number;
  monthlyBookingCount: number;
  pendingPayouts: WithdrawalTransaction[];
  recentTransactions: WalletTransaction[];
  revenueChart: { label: string; value: number }[];
};

// ── Admin financial dashboard ─────────────────────────────────

export type AdminFinancialDashboard = {
  platform: PlatformWalletBalance;
  totalCommissionFcfa: number;
  monthlyCommissionFcfa: number;
  blockedFundsFcfa: number;
  releasedFundsFcfa: number;
  totalWithdrawalsFcfa: number;
  paymentVolumeFcfa: number;
  refundVolumeFcfa: number;
  revenueChart: { label: string; value: number }[];
};
