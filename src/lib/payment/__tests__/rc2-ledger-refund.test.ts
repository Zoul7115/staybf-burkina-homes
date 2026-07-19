// ============================================================
// RC2 — Ledger refund tests (B18)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  ledgerRefund,
  ledgerBookingCredit,
  computeBalanceFromEntries,
} from "@/lib/wallet/ledger";

const BOOKING = {
  id:                "bk-refund-001",
  reference:         "STBF-R001",
  hostPayoutAmount:  60_000,
  commissionAmount:  9_000,
  serviceFeeAmount:  6_000,
  totalPayment:      75_000,
};

function bookingCredits() {
  return ledgerBookingCredit({
    id:               BOOKING.id,
    reference:        BOOKING.reference,
    hostPayoutAmount: BOOKING.hostPayoutAmount,
    commissionAmount: BOOKING.commissionAmount,
    serviceFeeAmount: BOOKING.serviceFeeAmount,
  });
}

describe("RC2 — Ledger refund (B18)", () => {
  describe("ledgerRefund — full refund", () => {
    it("creates refund entries with debit accounts", () => {
      const entries = ledgerRefund({
        id:                 "ref-001",
        bookingId:          BOOKING.id,
        bookingReference:   BOOKING.reference,
        refundAmountFcfa:   BOOKING.hostPayoutAmount,
        commissionReversal: BOOKING.commissionAmount,
        serviceFeeReversal: BOOKING.serviceFeeAmount,
      });
      expect(entries.length).toBeGreaterThanOrEqual(1);
      for (const e of entries) {
        expect(e.debitWallet).toBeTruthy();
      }
    });

    it("refund entries reference the correct booking", () => {
      const entries = ledgerRefund({
        id:                 "ref-002",
        bookingId:          BOOKING.id,
        bookingReference:   BOOKING.reference,
        refundAmountFcfa:   BOOKING.hostPayoutAmount,
        commissionReversal: BOOKING.commissionAmount,
        serviceFeeReversal: BOOKING.serviceFeeAmount,
      });
      for (const e of entries) {
        expect(e.bookingId).toBe(BOOKING.id);
      }
    });

    it("refund amounts are positive", () => {
      const entries = ledgerRefund({
        id:                 "ref-003",
        bookingId:          BOOKING.id,
        bookingReference:   BOOKING.reference,
        refundAmountFcfa:   BOOKING.hostPayoutAmount,
        commissionReversal: BOOKING.commissionAmount,
        serviceFeeReversal: BOOKING.serviceFeeAmount,
      });
      for (const e of entries) {
        expect(e.amountFcfa).toBeGreaterThan(0);
      }
    });
  });

  describe("ledgerRefund — partial refund", () => {
    it("partial refund uses the provided amount", () => {
      const partialAmount = 30_000;
      const entries = ledgerRefund({
        id:                 "ref-004",
        bookingId:          BOOKING.id,
        bookingReference:   BOOKING.reference,
        refundAmountFcfa:   partialAmount,
        commissionReversal: 4_500,
        serviceFeeReversal: 3_000,
      });
      const hostEntry = entries.find(e => e.type === "refund_accommodation_debit");
      expect(hostEntry?.amountFcfa).toBe(partialAmount);
    });

    it("partial refund leaves residual balance", () => {
      const credits = bookingCredits();
      const partialAmount = 30_000;
      const refundEntries = ledgerRefund({
        id:                 "ref-005",
        bookingId:          BOOKING.id,
        bookingReference:   BOOKING.reference,
        refundAmountFcfa:   partialAmount,
        commissionReversal: 4_500,
        serviceFeeReversal: 3_000,
      });
      const balance = computeBalanceFromEntries([...credits, ...refundEntries]);
      expect(balance.hostPending).toBe(BOOKING.hostPayoutAmount - partialAmount);
    });
  });

  describe("full refund clears host balance", () => {
    it("after full refund, HOST_PENDING = 0", () => {
      const credits = bookingCredits();
      const refundEntries = ledgerRefund({
        id:                 "ref-006",
        bookingId:          BOOKING.id,
        bookingReference:   BOOKING.reference,
        refundAmountFcfa:   BOOKING.hostPayoutAmount,
        commissionReversal: BOOKING.commissionAmount,
        serviceFeeReversal: BOOKING.serviceFeeAmount,
      });
      const balance = computeBalanceFromEntries([...credits, ...refundEntries]);
      expect(balance.hostPending).toBe(0);
      expect(balance.platformPending).toBe(0);
    });
  });

  describe("zero-amount entries throw", () => {
    it("throws for zero refund amount", () => {
      expect(() =>
        ledgerRefund({
          id:                 "ref-007",
          bookingId:          BOOKING.id,
          bookingReference:   BOOKING.reference,
          refundAmountFcfa:   0,
          commissionReversal: 0,
          serviceFeeReversal: 0,
        })
      ).toThrow();
    });
  });

  describe("refund from HOST_AVAILABLE (post-completion)", () => {
    it("uses host_available when sourceWallet is specified", () => {
      const entries = ledgerRefund({
        id:                  "ref-008",
        bookingId:           BOOKING.id,
        bookingReference:    BOOKING.reference,
        refundAmountFcfa:    BOOKING.hostPayoutAmount,
        commissionReversal:  BOOKING.commissionAmount,
        serviceFeeReversal:  BOOKING.serviceFeeAmount,
        sourceWallet:        "host_available",
        platformSourceWallet: "platform_available",
      });
      const hostEntry = entries.find(e => e.type === "refund_accommodation_debit");
      expect(hostEntry?.debitWallet).toBe("host_available");
    });
  });

  describe("commission-only reversal", () => {
    it("skips service_fee entry when serviceFeeReversal = 0", () => {
      const entries = ledgerRefund({
        id:                 "ref-009",
        bookingId:          BOOKING.id,
        bookingReference:   BOOKING.reference,
        refundAmountFcfa:   BOOKING.hostPayoutAmount,
        commissionReversal: BOOKING.commissionAmount,
        serviceFeeReversal: 0,
      });
      const feeEntry = entries.find(e => e.type === "refund_service_fee_debit");
      expect(feeEntry).toBeUndefined();
    });

    it("skips commission entry when commissionReversal = 0", () => {
      const entries = ledgerRefund({
        id:                 "ref-010",
        bookingId:          BOOKING.id,
        bookingReference:   BOOKING.reference,
        refundAmountFcfa:   BOOKING.hostPayoutAmount,
        commissionReversal: 0,
        serviceFeeReversal: BOOKING.serviceFeeAmount,
      });
      const commEntry = entries.find(e => e.type === "refund_commission_debit");
      expect(commEntry).toBeUndefined();
    });
  });

  describe("multiple refunds accumulate", () => {
    it("two partial refunds reduce balance correctly", () => {
      const credits = bookingCredits();
      const r1 = ledgerRefund({
        id: "r1", bookingId: BOOKING.id, bookingReference: BOOKING.reference,
        refundAmountFcfa: 20_000, commissionReversal: 3_000, serviceFeeReversal: 2_000,
      });
      const r2 = ledgerRefund({
        id: "r2", bookingId: BOOKING.id, bookingReference: BOOKING.reference,
        refundAmountFcfa: 20_000, commissionReversal: 3_000, serviceFeeReversal: 2_000,
      });
      const balance = computeBalanceFromEntries([...credits, ...r1, ...r2]);
      expect(balance.hostPending).toBe(BOOKING.hostPayoutAmount - 40_000);
    });
  });

  describe("simulation — 100 refunds", () => {
    it("100 full refunds each clear their booking's balance to 0", () => {
      for (let i = 0; i < 100; i++) {
        const bkId = `bk-r-sim-${i}`;
        const ref  = `STBF-RS${i}`;
        const credits = ledgerBookingCredit({
          id: bkId, reference: ref,
          hostPayoutAmount: 50_000,
          commissionAmount: 7_500,
          serviceFeeAmount: 5_000,
        });
        const refundEntries = ledgerRefund({
          id: `ref-sim-${i}`,
          bookingId: bkId,
          bookingReference: ref,
          refundAmountFcfa: 50_000,
          commissionReversal: 7_500,
          serviceFeeReversal: 5_000,
        });
        const balance = computeBalanceFromEntries([...credits, ...refundEntries]);
        expect(balance.hostPending).toBe(0);
        expect(balance.platformPending).toBe(0);
      }
    });
  });
});
