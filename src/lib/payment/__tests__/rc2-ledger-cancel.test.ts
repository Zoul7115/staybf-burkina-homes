// ============================================================
// RC2 — Ledger cancel-booking tests (B19)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  ledgerBookingCredit,
  ledgerBookingCancelled,
  computeBalanceFromEntries,
} from "@/lib/wallet/ledger";

const BK = {
  id:               "bk-cancel-test-001",
  reference:        "STBF-CANCEL-001",
  hostPayoutAmount: 60_000,
  commissionAmount: 9_000,
  serviceFeeAmount: 6_000,
};

function makeCredits(id = BK.id, ref = BK.reference) {
  return ledgerBookingCredit({
    id, reference: ref,
    hostPayoutAmount: BK.hostPayoutAmount,
    commissionAmount: BK.commissionAmount,
    serviceFeeAmount: BK.serviceFeeAmount,
  });
}

describe("RC2 — Ledger cancel-booking (B19)", () => {
  describe("ledgerBookingCancelled — from HOST_PENDING", () => {
    it("returns 2 reversal entries", () => {
      const entries = ledgerBookingCancelled({
        id: BK.id, reference: BK.reference,
        hostPayoutAmount: BK.hostPayoutAmount,
        commissionAmount: BK.commissionAmount,
        serviceFeeAmount: BK.serviceFeeAmount,
        sourceWallet: "host_pending",
      });
      expect(entries).toHaveLength(2);
    });

    it("both entries have debit_wallet set", () => {
      const entries = ledgerBookingCancelled({
        id: BK.id, reference: BK.reference,
        hostPayoutAmount: BK.hostPayoutAmount,
        commissionAmount: BK.commissionAmount,
        serviceFeeAmount: BK.serviceFeeAmount,
        sourceWallet: "host_pending",
      });
      for (const e of entries) expect(e.debitWallet).toBeTruthy();
    });

    it("first entry debits host_pending", () => {
      const entries = ledgerBookingCancelled({
        id: BK.id, reference: BK.reference,
        hostPayoutAmount: BK.hostPayoutAmount,
        commissionAmount: BK.commissionAmount,
        serviceFeeAmount: BK.serviceFeeAmount,
        sourceWallet: "host_pending",
      });
      expect(entries[0].debitWallet).toBe("host_pending");
      expect(entries[0].amountFcfa).toBe(BK.hostPayoutAmount);
    });

    it("second entry debits platform_pending by commission + service_fee", () => {
      const entries = ledgerBookingCancelled({
        id: BK.id, reference: BK.reference,
        hostPayoutAmount: BK.hostPayoutAmount,
        commissionAmount: BK.commissionAmount,
        serviceFeeAmount: BK.serviceFeeAmount,
        sourceWallet: "host_pending",
      });
      expect(entries[1].debitWallet).toBe("platform_pending");
      expect(entries[1].amountFcfa).toBe(BK.commissionAmount + BK.serviceFeeAmount);
    });
  });

  describe("balance after cancellation (from pending)", () => {
    it("credits + reversals → HOST_PENDING = 0", () => {
      const credits   = makeCredits();
      const reversals = ledgerBookingCancelled({
        id: BK.id, reference: BK.reference,
        hostPayoutAmount: BK.hostPayoutAmount,
        commissionAmount: BK.commissionAmount,
        serviceFeeAmount: BK.serviceFeeAmount,
        sourceWallet: "host_pending",
      });
      const balance = computeBalanceFromEntries([...credits, ...reversals]);
      expect(balance.hostPending).toBe(0);
      expect(balance.platformPending).toBe(0);
    });

    it("cancellation does not touch HOST_AVAILABLE", () => {
      const credits   = makeCredits();
      const reversals = ledgerBookingCancelled({
        id: BK.id, reference: BK.reference,
        hostPayoutAmount: BK.hostPayoutAmount,
        commissionAmount: BK.commissionAmount,
        serviceFeeAmount: BK.serviceFeeAmount,
        sourceWallet: "host_pending",
      });
      const balance = computeBalanceFromEntries([...credits, ...reversals]);
      expect(balance.hostAvailable).toBe(0);
    });
  });

  describe("ledgerBookingCancelled — from HOST_AVAILABLE (post-checkout cancellation)", () => {
    it("debits host_available instead of host_pending", () => {
      const entries = ledgerBookingCancelled({
        id: BK.id, reference: BK.reference,
        hostPayoutAmount: BK.hostPayoutAmount,
        commissionAmount: BK.commissionAmount,
        serviceFeeAmount: BK.serviceFeeAmount,
        sourceWallet: "host_available",
      });
      expect(entries[0].debitWallet).toBe("host_available");
    });
  });

  describe("multiple bookings — cancellation is isolated", () => {
    it("cancelling bk1 does not affect bk2 balance", () => {
      const credits1   = makeCredits("bk-c1", "STBF-C1");
      const credits2   = makeCredits("bk-c2", "STBF-C2");
      const reversals1 = ledgerBookingCancelled({
        id: "bk-c1", reference: "STBF-C1",
        hostPayoutAmount: BK.hostPayoutAmount,
        commissionAmount: BK.commissionAmount,
        serviceFeeAmount: BK.serviceFeeAmount,
        sourceWallet: "host_pending",
      });
      const balance = computeBalanceFromEntries([...credits1, ...credits2, ...reversals1]);
      // Only bk-c1 was cancelled; bk-c2 credits remain
      expect(balance.hostPending).toBe(BK.hostPayoutAmount);
    });
  });

  describe("duplicate reversal is clamped to 0 (idempotency guard)", () => {
    it("double reversal yields hostPending = 0 (not negative)", () => {
      const credits   = makeCredits();
      const reversals = ledgerBookingCancelled({
        id: BK.id, reference: BK.reference,
        hostPayoutAmount: BK.hostPayoutAmount,
        commissionAmount: BK.commissionAmount,
        serviceFeeAmount: BK.serviceFeeAmount,
        sourceWallet: "host_pending",
      });
      const balance = computeBalanceFromEntries([...credits, ...reversals, ...reversals]);
      expect(balance.hostPending).toBe(0); // clamped, not negative
    });
  });

  describe("simulation — 100 cancellations", () => {
    it("100 booking cancellations all zero out correctly", () => {
      for (let i = 0; i < 100; i++) {
        const id  = `bk-cancel-sim-${i}`;
        const ref = `STBF-CS${i}`;
        const credits   = makeCredits(id, ref);
        const reversals = ledgerBookingCancelled({
          id, reference: ref,
          hostPayoutAmount: BK.hostPayoutAmount,
          commissionAmount: BK.commissionAmount,
          serviceFeeAmount: BK.serviceFeeAmount,
          sourceWallet: "host_pending",
        });
        const balance = computeBalanceFromEntries([...credits, ...reversals]);
        expect(balance.hostPending).toBe(0);
        expect(balance.platformPending).toBe(0);
      }
    });
  });

  describe("no captured payment — no ledger entries needed", () => {
    it("empty ledger has all balances at 0", () => {
      const balance = computeBalanceFromEntries([]);
      expect(balance.hostPending).toBe(0);
      expect(balance.platformPending).toBe(0);
    });
  });

  describe("entry type", () => {
    it("reversal entries use booking_cancelled_reversal type", () => {
      const entries = ledgerBookingCancelled({
        id: BK.id, reference: BK.reference,
        hostPayoutAmount: BK.hostPayoutAmount,
        commissionAmount: BK.commissionAmount,
        serviceFeeAmount: BK.serviceFeeAmount,
        sourceWallet: "host_pending",
      });
      for (const e of entries) {
        expect(e.type).toBe("booking_cancelled_reversal");
      }
    });
  });
});
