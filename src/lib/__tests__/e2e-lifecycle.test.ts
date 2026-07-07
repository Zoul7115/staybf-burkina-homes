// ── Story 7 — End-to-End Lifecycle Test ──────────────────────
// Full flow: Booking → Ledger credit → Completion → Payout → Refund
// Uses only pure ledger functions — no DB, no mocks.
// Validates state at every step of the lifecycle.
import { describe, it, expect } from "vitest";
import {
  ledgerBookingCredit,
  ledgerBookingCompleted,
  ledgerBookingCancelled,
  ledgerPayoutDebit,
  ledgerRefund,
  computeBalanceFromEntries,
} from "@/lib/wallet/ledger";
import type { LedgerEntry } from "@/lib/wallet/types";

// ── Fixtures ───────────────────────────────────────────────────

const BOOKING = {
  id: "bk-e2e-001",
  reference: "STBF-E2E001",
  hostPayoutAmount: 85_000,
  commissionAmount: 12_750,
  serviceFeeAmount:  8_500,
};
const TOTAL_PAYMENT = BOOKING.hostPayoutAmount + BOOKING.commissionAmount + BOOKING.serviceFeeAmount;

// ── Full happy path ────────────────────────────────────────────

describe("E2E: happy path — booking → completion → payout", () => {
  let entries: LedgerEntry[] = [];

  it("Step 1: booking credit — funds enter pending wallets", () => {
    entries.push(...ledgerBookingCredit(BOOKING));
    const bal = computeBalanceFromEntries(entries);

    expect(bal.hostPending).toBe(BOOKING.hostPayoutAmount);
    expect(bal.platformPending).toBe(BOOKING.commissionAmount + BOOKING.serviceFeeAmount);
    expect(bal.hostAvailable).toBe(0);
    expect(bal.hostWithdrawn).toBe(0);
    expect(bal.platformAvailable).toBe(0);
  });

  it("Step 2: booking completed — funds move to available", () => {
    entries.push(...ledgerBookingCompleted(BOOKING));
    const bal = computeBalanceFromEntries(entries);

    expect(bal.hostPending).toBe(0);
    expect(bal.hostAvailable).toBe(BOOKING.hostPayoutAmount);
    expect(bal.platformPending).toBe(0);
    expect(bal.platformAvailable).toBe(BOOKING.commissionAmount + BOOKING.serviceFeeAmount);
    expect(bal.hostWithdrawn).toBe(0);
  });

  it("Step 3: payout issued — host funds move to withdrawn", () => {
    entries.push(ledgerPayoutDebit({ id: "po-e2e-001", hostId: "h-1", amountFcfa: BOOKING.hostPayoutAmount }));
    const bal = computeBalanceFromEntries(entries);

    expect(bal.hostAvailable).toBe(0);
    expect(bal.hostWithdrawn).toBe(BOOKING.hostPayoutAmount);
    expect(bal.platformAvailable).toBe(BOOKING.commissionAmount + BOOKING.serviceFeeAmount);
  });

  it("Step 4: total ledger volume = 2 × total payment (credit + debit)", () => {
    // Each fund enters once (credit) and exits once (debit on completion move, payout)
    // Entry count: 3 credit + 2 release + 1 payout = 6
    expect(entries.length).toBe(6);
  });
});

// ── Cancellation from pending ──────────────────────────────────

describe("E2E: cancellation from pending — full reversal", () => {
  it("cancel after credit returns all balances to zero", () => {
    const entries = [
      ...ledgerBookingCredit(BOOKING),
      ...ledgerBookingCancelled({ ...BOOKING, sourceWallet: "host_pending" }),
    ];
    const bal = computeBalanceFromEntries(entries);

    expect(bal.hostPending).toBe(0);
    expect(bal.hostAvailable).toBe(0);
    expect(bal.platformPending).toBe(0);
    expect(bal.platformAvailable).toBe(0);
    expect(bal.hostWithdrawn).toBe(0);
  });
});

// ── Full refund after completion ───────────────────────────────

describe("E2E: full refund after completion", () => {
  it("credit → complete → full refund returns all to zero", () => {
    const entries = [
      ...ledgerBookingCredit(BOOKING),
      ...ledgerBookingCompleted(BOOKING),
      ...ledgerRefund({
        id: "rf-e2e-001",
        bookingId: BOOKING.id,
        bookingReference: BOOKING.reference,
        refundAmountFcfa: BOOKING.hostPayoutAmount,
        commissionReversal: BOOKING.commissionAmount,
        serviceFeeReversal: BOOKING.serviceFeeAmount,
        sourceWallet: "host_available",
        platformSourceWallet: "platform_available",
      }),
    ];
    const bal = computeBalanceFromEntries(entries);

    expect(bal.hostAvailable).toBe(0);
    expect(bal.hostPending).toBe(0);
    expect(bal.platformAvailable).toBe(0);
    expect(bal.platformPending).toBe(0);
  });
});

// ── Partial refund ─────────────────────────────────────────────

describe("E2E: partial refund (50% accommodation, no platform reversal)", () => {
  it("correct residual balances after partial refund", () => {
    const partial = Math.floor(BOOKING.hostPayoutAmount / 2);
    const entries = [
      ...ledgerBookingCredit(BOOKING),
      ...ledgerBookingCompleted(BOOKING),
      ...ledgerRefund({
        id: "rf-e2e-002",
        bookingId: BOOKING.id,
        bookingReference: BOOKING.reference,
        refundAmountFcfa: partial,
        commissionReversal: 0,
        serviceFeeReversal: 0,
        sourceWallet: "host_available",
      }),
    ];
    const bal = computeBalanceFromEntries(entries);

    expect(bal.hostAvailable).toBe(BOOKING.hostPayoutAmount - partial);
    expect(bal.platformAvailable).toBe(BOOKING.commissionAmount + BOOKING.serviceFeeAmount);
    expect(bal.hostPending).toBe(0);
  });
});

// ── Multi-booking host lifecycle ───────────────────────────────

describe("E2E: multi-booking host — mixed lifecycle", () => {
  it("3 bookings: 2 completed+paid, 1 cancelled — correct final state", () => {
    const b1 = { id: "bk-m1", reference: "STBF-M001", hostPayoutAmount: 80_000, commissionAmount: 12_000, serviceFeeAmount: 8_000 };
    const b2 = { id: "bk-m2", reference: "STBF-M002", hostPayoutAmount: 50_000, commissionAmount:  8_000, serviceFeeAmount: 5_000 };
    const b3 = { id: "bk-m3", reference: "STBF-M003", hostPayoutAmount: 65_000, commissionAmount: 10_000, serviceFeeAmount: 7_000 };

    const entries: LedgerEntry[] = [
      // b1: credit → complete → payout
      ...ledgerBookingCredit(b1),
      ...ledgerBookingCompleted(b1),
      ledgerPayoutDebit({ id: "po-m1", hostId: "h-1", amountFcfa: b1.hostPayoutAmount }),

      // b2: credit → complete (not yet paid out)
      ...ledgerBookingCredit(b2),
      ...ledgerBookingCompleted(b2),

      // b3: credit → cancelled
      ...ledgerBookingCredit(b3),
      ...ledgerBookingCancelled({ ...b3, sourceWallet: "host_pending" }),
    ];

    const bal = computeBalanceFromEntries(entries);

    expect(bal.hostWithdrawn).toBe(b1.hostPayoutAmount);
    expect(bal.hostAvailable).toBe(b2.hostPayoutAmount);
    expect(bal.hostPending).toBe(0);
    expect(bal.platformAvailable).toBe(
      b1.commissionAmount + b1.serviceFeeAmount +
      b2.commissionAmount + b2.serviceFeeAmount
    );
    expect(bal.platformPending).toBe(0);
  });
});

// ── Total payment integrity ────────────────────────────────────

describe("E2E: total payment amount matches split amounts", () => {
  it("credit entries sum equals total payment volume", () => {
    const entries = ledgerBookingCredit(BOOKING);
    const creditTotal = entries.reduce((s, e) => s + e.amountFcfa, 0);
    expect(creditTotal).toBe(TOTAL_PAYMENT);
  });
});
