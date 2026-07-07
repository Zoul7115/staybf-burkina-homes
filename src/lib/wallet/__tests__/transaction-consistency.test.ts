// ── Story 5 — Transaction amount consistency ──────────────────
// Verifies that the canonical booking amount equation holds:
//   payment.amount_fcfa = host_payout_amount + commission_amount + service_fee_amount
//
// Also verifies ledger entries reflect the same amounts.
import { describe, it, expect } from "vitest";
import {
  ledgerBookingCredit,
  ledgerBookingCompleted,
  ledgerPayoutDebit,
  ledgerRefund,
  computeBalanceFromEntries,
} from "../ledger";

type BookingAmounts = {
  id: string;
  reference: string;
  hostPayoutAmount: number;
  commissionAmount: number;
  serviceFeeAmount: number;
};

function totalPayment(b: BookingAmounts): number {
  return b.hostPayoutAmount + b.commissionAmount + b.serviceFeeAmount;
}

const BASE: BookingAmounts = {
  id: "bk-1",
  reference: "STBF-000001",
  hostPayoutAmount: 80_000,
  commissionAmount: 12_000,
  serviceFeeAmount: 8_000,
};

describe("Transaction amount consistency", () => {
  it("total payment = host_payout + commission + service_fee", () => {
    expect(totalPayment(BASE)).toBe(100_000);
  });

  it("ledger credit entries sum to total payment amount", () => {
    const entries = ledgerBookingCredit(BASE);
    const creditTotal = entries.reduce((s, e) => s + e.amountFcfa, 0);
    expect(creditTotal).toBe(totalPayment(BASE));
  });

  it("host_pending credit equals hostPayoutAmount", () => {
    const entries = ledgerBookingCredit(BASE);
    const hostCredit = entries.filter((e) => e.creditWallet === "host_pending");
    expect(hostCredit.length).toBe(1);
    expect(hostCredit[0].amountFcfa).toBe(BASE.hostPayoutAmount);
  });

  it("platform_pending credit equals commission + service_fee", () => {
    const entries = ledgerBookingCredit(BASE);
    const platformCredits = entries.filter((e) => e.creditWallet === "platform_pending");
    const platformTotal = platformCredits.reduce((s, e) => s + e.amountFcfa, 0);
    expect(platformTotal).toBe(BASE.commissionAmount + BASE.serviceFeeAmount);
  });

  it("on completion, host_available receives exact hostPayoutAmount", () => {
    const credit = ledgerBookingCredit(BASE);
    const release = ledgerBookingCompleted(BASE);
    const entries = [...credit, ...release];
    const bal = computeBalanceFromEntries(entries);
    expect(bal.hostAvailable).toBe(BASE.hostPayoutAmount);
  });

  it("on completion, platform_available receives commission + service_fee", () => {
    const credit = ledgerBookingCredit(BASE);
    const release = ledgerBookingCompleted(BASE);
    const entries = [...credit, ...release];
    const bal = computeBalanceFromEntries(entries);
    expect(bal.platformAvailable).toBe(BASE.commissionAmount + BASE.serviceFeeAmount);
  });

  it("payout debit moves exact amount from available to withdrawn", () => {
    const entries = [
      ...ledgerBookingCredit(BASE),
      ...ledgerBookingCompleted(BASE),
      ledgerPayoutDebit({ id: "po-1", hostId: "h-1", amountFcfa: BASE.hostPayoutAmount }),
    ];
    const bal = computeBalanceFromEntries(entries);
    expect(bal.hostAvailable).toBe(0);
    expect(bal.hostWithdrawn).toBe(BASE.hostPayoutAmount);
  });

  it("full refund after completion zeros all balances", () => {
    const entries = [
      ...ledgerBookingCredit(BASE),
      ...ledgerBookingCompleted(BASE),
      ...ledgerRefund({
        id: "rf-1",
        bookingId: BASE.id,
        bookingReference: BASE.reference,
        refundAmountFcfa: BASE.hostPayoutAmount,
        commissionReversal: BASE.commissionAmount,
        serviceFeeReversal: BASE.serviceFeeAmount,
        sourceWallet: "host_available",
        platformSourceWallet: "platform_available",
      }),
    ];
    const bal = computeBalanceFromEntries(entries);
    expect(bal.hostAvailable).toBe(0);
    expect(bal.platformAvailable).toBe(0);
  });

  it("multiple bookings — total amount consistency holds for each", () => {
    const bookings: BookingAmounts[] = [
      { id: "bk-1", reference: "STBF-000001", hostPayoutAmount: 80_000, commissionAmount: 12_000, serviceFeeAmount:  8_000 },
      { id: "bk-2", reference: "STBF-000002", hostPayoutAmount: 50_000, commissionAmount:  8_000, serviceFeeAmount:  6_000 },
      { id: "bk-3", reference: "STBF-000003", hostPayoutAmount: 95_000, commissionAmount: 14_000, serviceFeeAmount: 11_000 },
    ];

    for (const b of bookings) {
      const creditEntries = ledgerBookingCredit(b);
      const creditSum = creditEntries.reduce((s, e) => s + e.amountFcfa, 0);
      expect(creditSum, `booking ${b.id} credit sum`).toBe(totalPayment(b));
    }
  });

  it("commission + service_fee cover the full platform share", () => {
    // Platform takes exactly commission + service_fee, never more
    const entries = [...ledgerBookingCredit(BASE), ...ledgerBookingCompleted(BASE)];
    const bal = computeBalanceFromEntries(entries);
    const platformTotal = bal.platformAvailable + bal.platformPending;
    expect(platformTotal).toBe(BASE.commissionAmount + BASE.serviceFeeAmount);
  });

  it("host total earned = available + withdrawn after payout", () => {
    const payoutAmount = 40_000; // partial payout
    const entries = [
      ...ledgerBookingCredit(BASE),
      ...ledgerBookingCompleted(BASE),
      ledgerPayoutDebit({ id: "po-1", hostId: "h-1", amountFcfa: payoutAmount }),
    ];
    const bal = computeBalanceFromEntries(entries);
    expect(bal.hostAvailable + bal.hostWithdrawn).toBe(BASE.hostPayoutAmount);
  });
});
