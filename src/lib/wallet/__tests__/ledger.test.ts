import { describe, it, expect } from "vitest";
import {
  createLedgerEntry,
  ledgerBookingCredit,
  ledgerBookingCompleted,
  ledgerBookingCancelled,
  ledgerPayoutDebit,
  ledgerRefund,
  computeBalanceFromEntries,
} from "../ledger";

const BOOKING = {
  id: "bk-1",
  reference: "STBF-001",
  hostPayoutAmount: 85_000,
  commissionAmount: 15_000,
  serviceFeeAmount: 10_000,
};

describe("createLedgerEntry", () => {
  it("rejects zero or negative amounts", () => {
    expect(() => createLedgerEntry({ type: "payout_debit", debitWallet: "host_available", creditWallet: null, amountFcfa: 0, reference: "X", description: "X" })).toThrow();
    expect(() => createLedgerEntry({ type: "payout_debit", debitWallet: "host_available", creditWallet: null, amountFcfa: -100, reference: "X", description: "X" })).toThrow();
  });

  it("creates a valid entry with defaults", () => {
    const entry = createLedgerEntry({
      type: "payout_debit",
      debitWallet: "host_available",
      creditWallet: "host_withdrawn",
      amountFcfa: 50_000,
      reference: "REF",
      description: "Test",
    });
    expect(entry.currency).toBe("XOF");
    expect(entry.id).toMatch(/^ledger-/);
    expect(entry.metadata).toEqual({});
  });
});

describe("ledgerBookingCredit", () => {
  it("produces 3 entries for a confirmed booking", () => {
    const entries = ledgerBookingCredit(BOOKING);
    expect(entries).toHaveLength(3);

    const [accommodation, commission, serviceFee] = entries;
    expect(accommodation.type).toBe("booking_accommodation_credit");
    expect(accommodation.creditWallet).toBe("host_pending");
    expect(accommodation.amountFcfa).toBe(85_000);

    expect(commission.type).toBe("booking_commission_credit");
    expect(commission.creditWallet).toBe("platform_pending");
    expect(commission.amountFcfa).toBe(15_000);

    expect(serviceFee.type).toBe("booking_service_fee_credit");
    expect(serviceFee.creditWallet).toBe("platform_pending");
    expect(serviceFee.amountFcfa).toBe(10_000);
  });

  it("all entries share the same booking reference", () => {
    const entries = ledgerBookingCredit(BOOKING);
    expect(entries.every((e) => e.reference === BOOKING.reference)).toBe(true);
    expect(entries.every((e) => e.bookingId === BOOKING.id)).toBe(true);
  });
});

describe("ledgerBookingCompleted", () => {
  it("moves host pending → available and platform pending → available", () => {
    const entries = ledgerBookingCompleted(BOOKING);
    expect(entries).toHaveLength(2);

    const [hostRelease, platformRelease] = entries;
    expect(hostRelease.debitWallet).toBe("host_pending");
    expect(hostRelease.creditWallet).toBe("host_available");
    expect(hostRelease.amountFcfa).toBe(85_000);

    expect(platformRelease.debitWallet).toBe("platform_pending");
    expect(platformRelease.creditWallet).toBe("platform_available");
    expect(platformRelease.amountFcfa).toBe(25_000); // commission + service_fee
  });
});

describe("ledgerBookingCancelled", () => {
  it("reverses pending credits when cancelled from pending state", () => {
    const entries = ledgerBookingCancelled({ ...BOOKING, sourceWallet: "host_pending" });
    expect(entries).toHaveLength(2);
    expect(entries[0].debitWallet).toBe("host_pending");
    expect(entries[0].amountFcfa).toBe(85_000);
  });

  it("reverses available credits when cancelled from available state", () => {
    const entries = ledgerBookingCancelled({ ...BOOKING, sourceWallet: "host_available" });
    expect(entries[0].debitWallet).toBe("host_available");
  });
});

describe("ledgerPayoutDebit", () => {
  it("moves host available → withdrawn", () => {
    const entry = ledgerPayoutDebit({ id: "po-1", hostId: "h-1", amountFcfa: 50_000 });
    expect(entry.debitWallet).toBe("host_available");
    expect(entry.creditWallet).toBe("host_withdrawn");
    expect(entry.amountFcfa).toBe(50_000);
    expect(entry.payoutId).toBe("po-1");
  });
});

describe("ledgerRefund", () => {
  it("produces accommodation + commission + service fee entries when all > 0", () => {
    const entries = ledgerRefund({
      id: "rf-1",
      bookingId: "bk-1",
      bookingReference: "STBF-001",
      refundAmountFcfa: 85_000,
      commissionReversal: 15_000,
      serviceFeeReversal: 10_000,
    });
    expect(entries).toHaveLength(3);
  });

  it("omits commission and fee entries when reversals are 0", () => {
    const entries = ledgerRefund({
      id: "rf-2",
      bookingId: "bk-1",
      bookingReference: "STBF-001",
      refundAmountFcfa: 85_000,
      commissionReversal: 0,
      serviceFeeReversal: 0,
    });
    expect(entries).toHaveLength(1);
  });
});

describe("computeBalanceFromEntries — full lifecycle", () => {
  it("computes correct balance after booking + completion", () => {
    const credit = ledgerBookingCredit(BOOKING);
    const release = ledgerBookingCompleted(BOOKING);
    const all = [...credit, ...release];

    const bal = computeBalanceFromEntries(all);
    // host pending fully released
    expect(bal.hostPending).toBe(0);
    expect(bal.hostAvailable).toBe(85_000);
    // both commission and service_fee released together on completion
    expect(bal.platformPending).toBe(0);
    expect(bal.platformAvailable).toBe(25_000);
  });

  it("computes correct balance after payout", () => {
    const credit = ledgerBookingCredit(BOOKING);
    const release = ledgerBookingCompleted(BOOKING);
    const payout = ledgerPayoutDebit({ id: "po-1", hostId: "h-1", amountFcfa: 85_000 });

    const bal = computeBalanceFromEntries([...credit, ...release, payout]);
    expect(bal.hostAvailable).toBe(0);
    expect(bal.hostWithdrawn).toBe(85_000);
  });

  it("does not produce negative balances on over-debit from host_available", () => {
    const credit = ledgerBookingCredit({ ...BOOKING, hostPayoutAmount: 10_000, commissionAmount: 2_000, serviceFeeAmount: 1_000 });
    // Payout debits host_available (which is 0 — credits went to host_pending, not available yet)
    const payout = ledgerPayoutDebit({ id: "po-1", hostId: "h-1", amountFcfa: 999_999 });

    const bal = computeBalanceFromEntries([...credit, payout]);
    // host_pending still has the booking credit (not yet released via completed)
    expect(bal.hostPending).toBe(10_000);
    // host_available clamped to 0 on over-debit
    expect(bal.hostAvailable).toBe(0);
  });
});
