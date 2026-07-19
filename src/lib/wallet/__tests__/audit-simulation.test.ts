// Wallet audit — 100 booking / cancellation / refund / payout / release cycles
// All amounts must match between ledger entries and direct arithmetic.
// Tolerance: 0 FCFA.
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

type Booking = {
  id: string;
  reference: string;
  hostPayoutAmount: number;
  commissionAmount: number;
  serviceFeeAmount: number;
};

function makeBooking(i: number): Booking {
  return {
    id: `bk-${i}`,
    reference: `STBF-${String(i).padStart(6, "0")}`,
    hostPayoutAmount: 80_000 + (i % 5) * 5_000,
    commissionAmount: 12_000 + (i % 3) * 2_000,
    serviceFeeAmount: 8_000 + (i % 4) * 1_000,
  };
}

// ── 100 bookings — all completed, no payouts ─────────────────

describe("Audit: 100 bookings, all completed, zero payouts", () => {
  it("host_available equals sum of all host_payout_amounts", () => {
    const bookings = Array.from({ length: 100 }, (_, i) => makeBooking(i));
    const entries: LedgerEntry[] = [];
    let expectedHostAvailable = 0;
    let expectedPlatformAvailable = 0;

    for (const b of bookings) {
      entries.push(...ledgerBookingCredit(b));
      entries.push(...ledgerBookingCompleted(b));
      expectedHostAvailable += b.hostPayoutAmount;
      expectedPlatformAvailable += b.commissionAmount + b.serviceFeeAmount;
    }

    const bal = computeBalanceFromEntries(entries);
    expect(bal.hostPending).toBe(0);
    expect(bal.hostAvailable).toBe(expectedHostAvailable);
    expect(bal.hostWithdrawn).toBe(0);
    expect(bal.platformPending).toBe(0);
    expect(bal.platformAvailable).toBe(expectedPlatformAvailable);
  });
});

// ── 100 bookings — all cancelled ─────────────────────────────

describe("Audit: 100 bookings, all cancelled from pending", () => {
  it("all balances return to zero on cancellation", () => {
    const bookings = Array.from({ length: 100 }, (_, i) => makeBooking(i));
    const entries: LedgerEntry[] = [];

    for (const b of bookings) {
      entries.push(...ledgerBookingCredit(b));
      entries.push(...ledgerBookingCancelled({ ...b, sourceWallet: "host_pending" }));
    }

    const bal = computeBalanceFromEntries(entries);
    expect(bal.hostPending).toBe(0);
    expect(bal.hostAvailable).toBe(0);
    expect(bal.platformPending).toBe(0);
    expect(bal.platformAvailable).toBe(0);
  });
});

// ── 100 bookings — all completed + full refund ───────────────

describe("Audit: 100 bookings, all completed, then fully refunded", () => {
  it("all balances return to zero after full refund", () => {
    const bookings = Array.from({ length: 100 }, (_, i) => makeBooking(i));
    const entries: LedgerEntry[] = [];

    for (const b of bookings) {
      entries.push(...ledgerBookingCredit(b));
      entries.push(...ledgerBookingCompleted(b));
      entries.push(...ledgerRefund({
        id: `rf-${b.id}`,
        bookingId: b.id,
        bookingReference: b.reference,
        refundAmountFcfa: b.hostPayoutAmount,
        commissionReversal: b.commissionAmount,
        serviceFeeReversal: b.serviceFeeAmount,
        sourceWallet: "host_available",
        platformSourceWallet: "platform_available",
      }));
    }

    const bal = computeBalanceFromEntries(entries);
    expect(bal.hostPending).toBe(0);
    expect(bal.hostAvailable).toBe(0);
    expect(bal.platformPending).toBe(0);
    expect(bal.platformAvailable).toBe(0);
  });
});

// ── 100 bookings — all completed + all paid out ──────────────

describe("Audit: 100 bookings, all completed + all paid out", () => {
  it("host_withdrawn equals sum of all host_payout_amounts", () => {
    const bookings = Array.from({ length: 100 }, (_, i) => makeBooking(i));
    const entries: LedgerEntry[] = [];
    let expectedWithdrawn = 0;

    for (const b of bookings) {
      entries.push(...ledgerBookingCredit(b));
      entries.push(...ledgerBookingCompleted(b));
      entries.push(ledgerPayoutDebit({ id: `po-${b.id}`, hostId: "h-1", amountFcfa: b.hostPayoutAmount }));
      expectedWithdrawn += b.hostPayoutAmount;
    }

    const bal = computeBalanceFromEntries(entries);
    expect(bal.hostPending).toBe(0);
    expect(bal.hostAvailable).toBe(0);
    expect(bal.hostWithdrawn).toBe(expectedWithdrawn);
  });
});

// ── Mixed: 100 bookings — partial lifecycle ──────────────────

describe("Audit: 100 bookings — mixed lifecycle (credit, complete, cancel, payout)", () => {
  it("all wallet balances match expected arithmetic — 0 FCFA tolerance", () => {
    const bookings = Array.from({ length: 100 }, (_, i) => makeBooking(i));
    const entries: LedgerEntry[] = [];

    let expectedPending = 0;
    let expectedAvailable = 0;
    let expectedWithdrawn = 0;
    let expectedPlatformPending = 0;
    let expectedPlatformAvailable = 0;

    for (let i = 0; i < bookings.length; i++) {
      const b = bookings[i];
      entries.push(...ledgerBookingCredit(b));
      expectedPending += b.hostPayoutAmount;
      expectedPlatformPending += b.commissionAmount + b.serviceFeeAmount;

      if (i % 4 === 3) {
        // Every 4th booking cancelled
        entries.push(...ledgerBookingCancelled({ ...b, sourceWallet: "host_pending" }));
        expectedPending -= b.hostPayoutAmount;
        expectedPlatformPending -= b.commissionAmount + b.serviceFeeAmount;
      } else {
        // Others completed
        entries.push(...ledgerBookingCompleted(b));
        expectedPending -= b.hostPayoutAmount;
        expectedAvailable += b.hostPayoutAmount;
        expectedPlatformPending -= b.commissionAmount + b.serviceFeeAmount;
        expectedPlatformAvailable += b.commissionAmount + b.serviceFeeAmount;

        if (i % 3 === 0) {
          // Every 3rd completed booking paid out
          entries.push(ledgerPayoutDebit({ id: `po-${b.id}`, hostId: "h-1", amountFcfa: b.hostPayoutAmount }));
          expectedAvailable -= b.hostPayoutAmount;
          expectedWithdrawn += b.hostPayoutAmount;
        }
      }
    }

    const bal = computeBalanceFromEntries(entries);
    expect(bal.hostPending,       "hostPending mismatch").toBe(expectedPending);
    expect(bal.hostAvailable,     "hostAvailable mismatch").toBe(expectedAvailable);
    expect(bal.hostWithdrawn,     "hostWithdrawn mismatch").toBe(expectedWithdrawn);
    expect(bal.platformPending,   "platformPending mismatch").toBe(expectedPlatformPending);
    expect(bal.platformAvailable, "platformAvailable mismatch").toBe(expectedPlatformAvailable);
  });
});

// ── 100 partial refunds ──────────────────────────────────────

describe("Audit: 100 bookings — partial refunds", () => {
  it("partial refund (50% accommodation) leaves correct residuals", () => {
    const bookings = Array.from({ length: 100 }, (_, i) => makeBooking(i));
    const entries: LedgerEntry[] = [];
    let expectedAvailable = 0;

    for (const b of bookings) {
      entries.push(...ledgerBookingCredit(b));
      entries.push(...ledgerBookingCompleted(b));
      // Partial refund: only 50% of host payout, no commission reversal
      const partialRefund = Math.floor(b.hostPayoutAmount / 2);
      entries.push(...ledgerRefund({
        id: `rf-${b.id}`,
        bookingId: b.id,
        bookingReference: b.reference,
        refundAmountFcfa: partialRefund,
        commissionReversal: 0,
        serviceFeeReversal: 0,
        sourceWallet: "host_available", // funds moved to available on completion
      }));
      expectedAvailable += b.hostPayoutAmount - partialRefund;
    }

    const bal = computeBalanceFromEntries(entries);
    expect(bal.hostAvailable).toBe(expectedAvailable);
    expect(bal.hostPending).toBe(0);
  });
});
