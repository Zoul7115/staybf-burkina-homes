// ============================================================
// Wallet Engine — domain event handlers
//
// Each function corresponds to a financial lifecycle event.
// Every function:
//   1. Produces ledger entries (immutable record)
//   2. Computes the resulting wallet state change
//   3. Returns an audit-ready operation result
//
// Nothing touches the DB directly — the engine is pure logic.
// Persistence is the caller's responsibility (Edge Functions).
// ============================================================

import {
  ledgerBookingCredit,
  ledgerBookingCompleted,
  ledgerBookingCancelled,
  ledgerPayoutDebit,
  ledgerRefund,
} from "./ledger";
import type { LedgerEntry, HostWalletBalance, PlatformWalletBalance } from "./types";

// ── Operation result ──────────────────────────────────────────

export type WalletOperation = {
  event: string;
  entries: LedgerEntry[];
  walletDelta: WalletDelta;
  auditMetadata: Record<string, unknown>;
  timestamp: string;
};

export type WalletDelta = {
  hostPendingDelta: number;
  hostAvailableDelta: number;
  hostWithdrawnDelta: number;
  platformPendingDelta: number;
  platformAvailableDelta: number;
};

function emptyDelta(): WalletDelta {
  return { hostPendingDelta: 0, hostAvailableDelta: 0, hostWithdrawnDelta: 0, platformPendingDelta: 0, platformAvailableDelta: 0 };
}

// ── booking_created ───────────────────────────────────────────
// Fires when a booking transitions to 'confirmed'.
// Credits host_pending and platform_pending.

export function booking_created(booking: {
  id: string;
  reference: string;
  hostPayoutAmount: number;
  commissionAmount: number;
  serviceFeeAmount: number;
}): WalletOperation {
  const entries = ledgerBookingCredit(booking);
  return {
    event: "booking_created",
    entries,
    walletDelta: {
      ...emptyDelta(),
      hostPendingDelta: booking.hostPayoutAmount,
      platformPendingDelta: booking.commissionAmount + booking.serviceFeeAmount,
    },
    auditMetadata: { bookingId: booking.id, reference: booking.reference },
    timestamp: new Date().toISOString(),
  };
}

// ── payment_received ──────────────────────────────────────────
// Fires when a payment is captured.
// No wallet mutation — captured payments trigger booking_confirmed
// which moves funds into pending via booking_created above.

export function payment_received(payment: {
  id: string;
  bookingId: string;
  amountFcfa: number;
  method: string;
}): WalletOperation {
  return {
    event: "payment_received",
    entries: [],
    walletDelta: emptyDelta(),
    auditMetadata: {
      paymentId: payment.id,
      bookingId: payment.bookingId,
      amountFcfa: payment.amountFcfa,
      method: payment.method,
    },
    timestamp: new Date().toISOString(),
  };
}

// ── booking_completed ─────────────────────────────────────────
// Fires when a booking transitions to 'completed' (post-checkout).
// Moves host funds from pending → available.
// Moves platform commission from pending → available.

export function booking_completed(booking: {
  id: string;
  reference: string;
  hostPayoutAmount: number;
  commissionAmount: number;
  serviceFeeAmount: number;
}): WalletOperation {
  const entries = ledgerBookingCompleted(booking);
  const platformRelease = booking.commissionAmount + booking.serviceFeeAmount;
  return {
    event: "booking_completed",
    entries,
    walletDelta: {
      ...emptyDelta(),
      hostPendingDelta: -booking.hostPayoutAmount,
      hostAvailableDelta: booking.hostPayoutAmount,
      platformPendingDelta: -platformRelease,
      platformAvailableDelta: platformRelease,
    },
    auditMetadata: { bookingId: booking.id, reference: booking.reference },
    timestamp: new Date().toISOString(),
  };
}

// ── booking_cancelled ─────────────────────────────────────────
// Fires when a booking is cancelled.
// Reverses pending credits. If booking was completed, reverses available.

export function booking_cancelled(booking: {
  id: string;
  reference: string;
  hostPayoutAmount: number;
  commissionAmount: number;
  serviceFeeAmount: number;
  wasCompleted: boolean;
}): WalletOperation {
  const sourceWallet = booking.wasCompleted ? "host_available" : "host_pending";
  const entries = ledgerBookingCancelled({ ...booking, sourceWallet });

  const platformWallet = booking.wasCompleted ? "platformAvailableDelta" : "platformPendingDelta";
  const delta = emptyDelta();
  if (booking.wasCompleted) {
    delta.hostAvailableDelta = -booking.hostPayoutAmount;
  } else {
    delta.hostPendingDelta = -booking.hostPayoutAmount;
  }
  delta[platformWallet] = -(booking.commissionAmount + booking.serviceFeeAmount);

  return {
    event: "booking_cancelled",
    entries,
    walletDelta: delta,
    auditMetadata: { bookingId: booking.id, reference: booking.reference, wasCompleted: booking.wasCompleted },
    timestamp: new Date().toISOString(),
  };
}

// ── checkout_completed ────────────────────────────────────────
// Alias for booking_completed — emitted on physical checkout.

export const checkout_completed = booking_completed;

// ── funds_released ────────────────────────────────────────────
// Explicit fund release (manual or scheduled).
// Same accounting as booking_completed.

export const funds_released = booking_completed;

// ── withdrawal_requested ──────────────────────────────────────
// Fires when a host requests a withdrawal.
// No ledger mutation yet — only when approved/paid.

export function withdrawal_requested(withdrawal: {
  id: string;
  hostId: string;
  amountFcfa: number;
  method: string;
}): WalletOperation {
  return {
    event: "withdrawal_requested",
    entries: [],
    walletDelta: emptyDelta(),
    auditMetadata: {
      withdrawalId: withdrawal.id,
      hostId: withdrawal.hostId,
      amountFcfa: withdrawal.amountFcfa,
      method: withdrawal.method,
    },
    timestamp: new Date().toISOString(),
  };
}

// ── withdrawal_paid ───────────────────────────────────────────
// Fires when a payout is confirmed paid by the provider.
// Moves host_available → host_withdrawn.

export function withdrawal_paid(payout: {
  id: string;
  hostId: string;
  amountFcfa: number;
}): WalletOperation {
  const entry = ledgerPayoutDebit(payout);
  return {
    event: "withdrawal_paid",
    entries: [entry],
    walletDelta: {
      ...emptyDelta(),
      hostAvailableDelta: -payout.amountFcfa,
      hostWithdrawnDelta: payout.amountFcfa,
    },
    auditMetadata: { payoutId: payout.id, hostId: payout.hostId },
    timestamp: new Date().toISOString(),
  };
}

// ── refund_created ────────────────────────────────────────────
// Fires when a refund is approved.
// Debits host_pending (or host_available) and platform wallets.

export function refund_created(refund: {
  id: string;
  bookingId: string;
  bookingReference: string;
  refundAmountFcfa: number;
  commissionReversal: number;
  serviceFeeReversal: number;
}): WalletOperation {
  const entries = ledgerRefund(refund);
  return {
    event: "refund_created",
    entries,
    walletDelta: {
      ...emptyDelta(),
      hostPendingDelta: -refund.refundAmountFcfa,
      platformPendingDelta: -(refund.commissionReversal + refund.serviceFeeReversal),
    },
    auditMetadata: {
      refundId: refund.id,
      bookingId: refund.bookingId,
      reference: refund.bookingReference,
    },
    timestamp: new Date().toISOString(),
  };
}

// ── Balance aggregation helpers ───────────────────────────────

export function applyDelta(
  balance: HostWalletBalance,
  delta: WalletDelta
): HostWalletBalance {
  const pendingBalance = Math.max(0, balance.pendingBalance + delta.hostPendingDelta);
  const availableBalance = Math.max(0, balance.availableBalance + delta.hostAvailableDelta);
  const withdrawnBalance = Math.max(0, balance.withdrawnBalance + delta.hostWithdrawnDelta);
  return {
    ...balance,
    pendingBalance,
    availableBalance,
    withdrawnBalance,
    totalEarned: availableBalance + withdrawnBalance,
    computedAt: new Date().toISOString(),
  };
}

export function applyPlatformDelta(
  balance: PlatformWalletBalance,
  delta: WalletDelta
): PlatformWalletBalance {
  return {
    pendingCommission: Math.max(0, balance.pendingCommission + delta.platformPendingDelta),
    availableCommission: Math.max(0, balance.availableCommission + delta.platformAvailableDelta),
    totalCommission: balance.totalCommission + Math.max(0, delta.platformAvailableDelta),
    currency: "XOF",
    computedAt: new Date().toISOString(),
  };
}
