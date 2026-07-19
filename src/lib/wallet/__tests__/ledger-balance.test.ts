// Step 10 — Ledger balance tests
// Every transaction type must satisfy Σdebit = Σcredit across the lifecycle.
// Single-sided entries (booking credit, payout credit) are valid asymmetrically,
// but a complete lifecycle MUST net to zero (no money created or destroyed).

import { describe, it, expect } from "vitest";
import {
  ledgerBookingCredit,
  ledgerBookingCompleted,
  ledgerBookingCancelled,
  ledgerPayoutDebit,
  ledgerRefund,
  computeBalanceFromEntries,
} from "../ledger";
import type { LedgerEntry } from "../types";

// ── helpers ────────────────────────────────────────────────────

function sumCredits(entries: LedgerEntry[]): number {
  return entries.filter((e) => e.creditWallet).reduce((s, e) => s + e.amountFcfa, 0);
}

function sumDebits(entries: LedgerEntry[]): number {
  return entries.filter((e) => e.debitWallet).reduce((s, e) => s + e.amountFcfa, 0);
}

// For transfer entries both debit and credit must match
function assertTransferBalance(entries: LedgerEntry[], label: string): void {
  const credits = sumCredits(entries);
  const debits  = sumDebits(entries);
  expect(credits, `${label}: credit total`).toBe(debits);
}

const BOOKING = {
  id: "bk-test",
  reference: "STBF-TEST",
  hostPayoutAmount: 85_000,
  commissionAmount: 15_000,
  serviceFeeAmount: 10_000,
};

// ── booking credit (single-sided: only credits) ───────────────

describe("ledgerBookingCredit", () => {
  it("total credits equal payment.amount_fcfa", () => {
    const entries = ledgerBookingCredit(BOOKING);
    const credits = sumCredits(entries);
    // accommodation + commission + service_fee = total payment
    const expectedTotal = BOOKING.hostPayoutAmount + BOOKING.commissionAmount + BOOKING.serviceFeeAmount;
    expect(credits).toBe(expectedTotal);
    // No debits for an initial booking credit
    expect(sumDebits(entries)).toBe(0);
  });
});

// ── booking completed (balanced transfer) ─────────────────────

describe("ledgerBookingCompleted", () => {
  it("is a balanced transfer (Σcredit = Σdebit)", () => {
    const entries = ledgerBookingCompleted(BOOKING);
    assertTransferBalance(entries, "booking_completed");
  });

  it("releases full platform pending (commission + service_fee)", () => {
    const entries = ledgerBookingCompleted(BOOKING);
    const platformRelease = entries.find((e) => e.debitWallet === "platform_pending");
    expect(platformRelease?.amountFcfa).toBe(BOOKING.commissionAmount + BOOKING.serviceFeeAmount);
  });
});

// ── booking cancelled (debit-only reversal) ───────────────────
// Cancellation removes money from the ledger (debit-only).
// Credits stay at 0; debits equal the original credit amounts.

describe("ledgerBookingCancelled", () => {
  it("from pending: debits equal the original credit amounts", () => {
    const entries = ledgerBookingCancelled({ ...BOOKING, sourceWallet: "host_pending" });
    expect(sumCredits(entries)).toBe(0);
    expect(sumDebits(entries)).toBe(BOOKING.hostPayoutAmount + BOOKING.commissionAmount + BOOKING.serviceFeeAmount);
  });

  it("from available: debits equal the original credit amounts", () => {
    const entries = ledgerBookingCancelled({ ...BOOKING, sourceWallet: "host_available" });
    expect(sumCredits(entries)).toBe(0);
    expect(sumDebits(entries)).toBe(BOOKING.hostPayoutAmount + BOOKING.commissionAmount + BOOKING.serviceFeeAmount);
  });

  it("total reversal equals total original credit", () => {
    const credits = ledgerBookingCredit(BOOKING);
    const reversals = ledgerBookingCancelled({ ...BOOKING, sourceWallet: "host_pending" });
    expect(sumDebits(reversals)).toBe(sumCredits(credits));
  });
});

// ── payout debit (balanced transfer) ─────────────────────────

describe("ledgerPayoutDebit", () => {
  it("is a balanced transfer", () => {
    const entry = ledgerPayoutDebit({ id: "po-1", hostId: "h-1", amountFcfa: 85_000 });
    expect(entry.creditWallet).not.toBeNull();
    expect(entry.debitWallet).not.toBeNull();
    // Single entry: credit amount = debit amount (same entry, by construction)
    expect(entry.amountFcfa).toBeGreaterThan(0);
  });
});

// ── refund (balanced transfer) ─────────────────────────────────

describe("ledgerRefund", () => {
  it("total debits equal total refund amount", () => {
    const entries = ledgerRefund({
      id: "rf-1",
      bookingId: "bk-1",
      bookingReference: "STBF-001",
      refundAmountFcfa: 85_000,
      commissionReversal: 15_000,
      serviceFeeReversal: 10_000,
    });
    expect(sumDebits(entries)).toBe(85_000 + 15_000 + 10_000);
    // Refunds are debit-only (money leaves the ledger back to the traveler)
    expect(sumCredits(entries)).toBe(0);
  });

  it("partial refund only debits what is specified", () => {
    const entries = ledgerRefund({
      id: "rf-2",
      bookingId: "bk-1",
      bookingReference: "STBF-001",
      refundAmountFcfa: 50_000,
      commissionReversal: 0,
      serviceFeeReversal: 0,
    });
    expect(sumDebits(entries)).toBe(50_000);
  });
});

// ── Full lifecycle balance tests ──────────────────────────────

describe("Full lifecycle — net zero balance", () => {
  it("booking + completion + payout = zero net movement in host_pending and host_available", () => {
    const credit    = ledgerBookingCredit(BOOKING);
    const completed = ledgerBookingCompleted(BOOKING);
    const payout    = ledgerPayoutDebit({ id: "po-1", hostId: "h-1", amountFcfa: BOOKING.hostPayoutAmount });

    const bal = computeBalanceFromEntries([...credit, ...completed, payout]);
    expect(bal.hostPending).toBe(0);
    expect(bal.hostAvailable).toBe(0);
    expect(bal.hostWithdrawn).toBe(BOOKING.hostPayoutAmount);
  });

  it("booking + completion: platform fully released to available", () => {
    const credit    = ledgerBookingCredit(BOOKING);
    const completed = ledgerBookingCompleted(BOOKING);

    const bal = computeBalanceFromEntries([...credit, ...completed]);
    expect(bal.platformPending).toBe(0);
    expect(bal.platformAvailable).toBe(BOOKING.commissionAmount + BOOKING.serviceFeeAmount);
  });

  it("booking + cancellation: all wallets return to zero", () => {
    const credit  = ledgerBookingCredit(BOOKING);
    const cancel  = ledgerBookingCancelled({ ...BOOKING, sourceWallet: "host_pending" });

    const bal = computeBalanceFromEntries([...credit, ...cancel]);
    expect(bal.hostPending).toBe(0);
    expect(bal.platformPending).toBe(0);
  });

  it("booking + refund: balances reflect partial reversal", () => {
    const credit  = ledgerBookingCredit(BOOKING);
    const refund  = ledgerRefund({
      id: "rf-1",
      bookingId: BOOKING.id,
      bookingReference: BOOKING.reference,
      refundAmountFcfa: BOOKING.hostPayoutAmount,
      commissionReversal: BOOKING.commissionAmount,
      serviceFeeReversal: BOOKING.serviceFeeAmount,
    });

    const bal = computeBalanceFromEntries([...credit, ...refund]);
    expect(bal.hostPending).toBe(0);
    expect(bal.platformPending).toBe(0);
  });

  it("multiple bookings accumulate correctly", () => {
    const BOOKINGS = Array.from({ length: 10 }, (_, i) => ({
      id: `bk-${i}`,
      reference: `STBF-${String(i).padStart(3, "0")}`,
      hostPayoutAmount: 85_000,
      commissionAmount: 15_000,
      serviceFeeAmount: 10_000,
    }));

    const allEntries = BOOKINGS.flatMap((b) => ledgerBookingCredit(b));
    const allCompletions = BOOKINGS.flatMap((b) => ledgerBookingCompleted(b));

    const bal = computeBalanceFromEntries([...allEntries, ...allCompletions]);
    expect(bal.hostPending).toBe(0);
    expect(bal.hostAvailable).toBe(10 * 85_000);
    expect(bal.platformPending).toBe(0);
    expect(bal.platformAvailable).toBe(10 * (15_000 + 10_000));
  });
});
