// ============================================================
// Ledger — every financial movement is an immutable entry
//
// Rules:
//   1. Never modify a balance directly.
//   2. Every operation produces exactly one LedgerEntry.
//   3. Entries are derived from booking_events + payments + refunds.
//   4. Debit + Credit must balance within each transaction group.
// ============================================================

import type {
  LedgerEntry,
  LedgerEntryType,
  LedgerWallet,
  WalletTransaction,
} from "./types";

// ── Entry factory ─────────────────────────────────────────────

let _seq = 0;
function entryId(): string {
  return `ledger-${Date.now()}-${++_seq}`;
}

export function createLedgerEntry(opts: {
  type: LedgerEntryType;
  debitWallet: LedgerWallet | null;
  creditWallet: LedgerWallet | null;
  amountFcfa: number;
  bookingId?: string;
  payoutId?: string;
  refundId?: string;
  reference: string;
  description: string;
  metadata?: Record<string, unknown>;
}): LedgerEntry {
  if (opts.amountFcfa <= 0) throw new Error(`Ledger entry amount must be positive, got ${opts.amountFcfa}`);

  return {
    id: entryId(),
    type: opts.type,
    debitWallet: opts.debitWallet ?? null,
    creditWallet: opts.creditWallet ?? null,
    amountFcfa: opts.amountFcfa,
    currency: "XOF",
    bookingId: opts.bookingId ?? null,
    payoutId: opts.payoutId ?? null,
    refundId: opts.refundId ?? null,
    reference: opts.reference,
    description: opts.description,
    metadata: opts.metadata ?? {},
    createdAt: new Date().toISOString(),
  };
}

// ── Domain entry constructors ─────────────────────────────────

export function ledgerBookingCredit(booking: {
  id: string;
  reference: string;
  hostPayoutAmount: number;
  commissionAmount: number;
  serviceFeeAmount: number;
}): LedgerEntry[] {
  return [
    createLedgerEntry({
      type: "booking_accommodation_credit",
      debitWallet: null,
      creditWallet: "host_pending",
      amountFcfa: booking.hostPayoutAmount,
      bookingId: booking.id,
      reference: booking.reference,
      description: `Réservation ${booking.reference} — encours hôte`,
    }),
    createLedgerEntry({
      type: "booking_commission_credit",
      debitWallet: null,
      creditWallet: "platform_pending",
      amountFcfa: booking.commissionAmount,
      bookingId: booking.id,
      reference: booking.reference,
      description: `Réservation ${booking.reference} — commission plateforme`,
    }),
    createLedgerEntry({
      type: "booking_service_fee_credit",
      debitWallet: null,
      creditWallet: "platform_pending",
      amountFcfa: booking.serviceFeeAmount,
      bookingId: booking.id,
      reference: booking.reference,
      description: `Réservation ${booking.reference} — frais de service`,
    }),
  ];
}

export function ledgerBookingCompleted(booking: {
  id: string;
  reference: string;
  hostPayoutAmount: number;
  commissionAmount: number;
  serviceFeeAmount: number;
}): LedgerEntry[] {
  // Platform release = commission + service_fee (both were credited to platform_pending at booking time)
  const platformReleaseAmount = booking.commissionAmount + booking.serviceFeeAmount;

  return [
    createLedgerEntry({
      type: "booking_completed_release",
      debitWallet: "host_pending",
      creditWallet: "host_available",
      amountFcfa: booking.hostPayoutAmount,
      bookingId: booking.id,
      reference: booking.reference,
      description: `Checkout ${booking.reference} — fonds libérés hôte`,
    }),
    createLedgerEntry({
      type: "booking_completed_release",
      debitWallet: "platform_pending",
      creditWallet: "platform_available",
      amountFcfa: platformReleaseAmount,
      bookingId: booking.id,
      reference: booking.reference,
      description: `Checkout ${booking.reference} — commission + frais disponibles`,
    }),
  ];
}

export function ledgerBookingCancelled(booking: {
  id: string;
  reference: string;
  hostPayoutAmount: number;
  commissionAmount: number;
  serviceFeeAmount: number;
  sourceWallet: "host_pending" | "host_available";
}): LedgerEntry[] {
  const entries: LedgerEntry[] = [
    createLedgerEntry({
      type: "booking_cancelled_reversal",
      debitWallet: booking.sourceWallet,
      creditWallet: null,
      amountFcfa: booking.hostPayoutAmount,
      bookingId: booking.id,
      reference: booking.reference,
      description: `Annulation ${booking.reference} — annulation hôte`,
    }),
    createLedgerEntry({
      type: "booking_cancelled_reversal",
      debitWallet: "platform_pending",
      creditWallet: null,
      amountFcfa: booking.commissionAmount + booking.serviceFeeAmount,
      bookingId: booking.id,
      reference: booking.reference,
      description: `Annulation ${booking.reference} — annulation plateforme`,
    }),
  ];
  return entries;
}

export function ledgerPayoutDebit(payout: {
  id: string;
  hostId: string;
  amountFcfa: number;
}): LedgerEntry {
  return createLedgerEntry({
    type: "payout_debit",
    debitWallet: "host_available",
    creditWallet: "host_withdrawn",
    amountFcfa: payout.amountFcfa,
    payoutId: payout.id,
    reference: `PAYOUT-${payout.id.slice(0, 8).toUpperCase()}`,
    description: `Virement hôte — ${payout.amountFcfa.toLocaleString("fr-FR")} FCFA`,
  });
}

export function ledgerRefund(refund: {
  id: string;
  bookingId: string;
  bookingReference: string;
  refundAmountFcfa: number;
  commissionReversal: number;
  serviceFeeReversal: number;
  // Where host funds currently sit — pending if booking not yet completed, available if completed
  sourceWallet?: "host_pending" | "host_available";
  // Where platform funds sit — pending if not yet completed, available if completed
  platformSourceWallet?: "platform_pending" | "platform_available";
}): LedgerEntry[] {
  const hostSourceWallet = refund.sourceWallet ?? "host_pending";
  const platformSourceWallet = refund.platformSourceWallet ?? "platform_pending";
  return [
    createLedgerEntry({
      type: "refund_accommodation_debit",
      debitWallet: hostSourceWallet,
      creditWallet: null,
      amountFcfa: refund.refundAmountFcfa,
      bookingId: refund.bookingId,
      refundId: refund.id,
      reference: refund.bookingReference,
      description: `Remboursement ${refund.bookingReference} — montant hébergement`,
    }),
    ...(refund.commissionReversal > 0
      ? [createLedgerEntry({
          type: "refund_commission_debit",
          debitWallet: platformSourceWallet,
          creditWallet: null,
          amountFcfa: refund.commissionReversal,
          bookingId: refund.bookingId,
          refundId: refund.id,
          reference: refund.bookingReference,
          description: `Remboursement ${refund.bookingReference} — reversal commission`,
        })]
      : []),
    ...(refund.serviceFeeReversal > 0
      ? [createLedgerEntry({
          type: "refund_service_fee_debit",
          debitWallet: platformSourceWallet,
          creditWallet: null,
          amountFcfa: refund.serviceFeeReversal,
          bookingId: refund.bookingId,
          refundId: refund.id,
          reference: refund.bookingReference,
          description: `Remboursement ${refund.bookingReference} — reversal frais de service`,
        })]
      : []),
  ];
}

// ── Ledger → WalletTransaction projection ────────────────────

export function ledgerEntryToTransaction(
  entry: LedgerEntry,
  hostId: string
): WalletTransaction {
  const isHostWallet = entry.creditWallet?.startsWith("host") || entry.debitWallet?.startsWith("host");
  const direction = entry.creditWallet?.startsWith("host") ? "credit" : "debit";

  return {
    id: entry.id,
    walletOwner: isHostWallet ? "host" : "platform",
    hostId: isHostWallet ? hostId : null,
    direction,
    amountFcfa: entry.amountFcfa,
    currency: "XOF",
    ledgerType: entry.type,
    reference: entry.reference,
    description: entry.description,
    bookingId: entry.bookingId,
    bookingReference: entry.reference,
    payoutId: entry.payoutId,
    createdAt: entry.createdAt,
  };
}

// ── Balance reconciliation from ledger entries ────────────────

export type LedgerBalance = {
  hostPending: number;
  hostAvailable: number;
  hostWithdrawn: number;
  platformPending: number;
  platformAvailable: number;
};

export function computeBalanceFromEntries(entries: LedgerEntry[]): LedgerBalance {
  const balance: LedgerBalance = {
    hostPending: 0, hostAvailable: 0, hostWithdrawn: 0,
    platformPending: 0, platformAvailable: 0,
  };

  for (const e of entries) {
    const walletKey = (w: string) => {
      switch (w) {
        case "host_pending": return "hostPending";
        case "host_available": return "hostAvailable";
        case "host_withdrawn": return "hostWithdrawn";
        case "platform_pending": return "platformPending";
        case "platform_available": return "platformAvailable";
        default: return null;
      }
    };

    if (e.creditWallet) {
      const k = walletKey(e.creditWallet) as keyof LedgerBalance | null;
      if (k) balance[k] += e.amountFcfa;
    }
    if (e.debitWallet) {
      const k = walletKey(e.debitWallet) as keyof LedgerBalance | null;
      if (k) balance[k] = Math.max(0, balance[k] - e.amountFcfa);
    }
  }

  return balance;
}
