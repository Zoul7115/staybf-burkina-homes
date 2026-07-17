// ============================================================
// RC2 — Atomic withdrawal tests (B09)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  validateWithdrawalRequest,
  isValidWithdrawalTransition,
  canRetryWithdrawal,
} from "@/lib/wallet/withdrawals";
import {
  ledgerBookingCredit,
  ledgerBookingCompleted,
  ledgerPayoutDebit,
  computeBalanceFromEntries,
} from "@/lib/wallet/ledger";

const HOST_ID = "host-atomic-001";

function makeBalance(availableBalance: number) {
  return {
    availableBalance,
    pendingBalance:   0,
    withdrawnBalance: 0,
    totalEarned:      availableBalance,
  };
}

function makeRequest(amountFcfa: number, method = "orange_money") {
  return {
    hostId:            HOST_ID,
    amountFcfa,
    method,
    description:       "Test withdrawal",
    accountDetails:    "237 XX XX XX",
  };
}

describe("RC2 — Atomic withdrawal validation (B09)", () => {
  describe("balance validation", () => {
    it("accepts withdrawal at exact available balance", () => {
      const result = validateWithdrawalRequest({
        request:                     makeRequest(50_000),
        balance:                     makeBalance(50_000),
        kycVerified:                 true,
        payoutMethod:                "orange_money",
        payoutAccount:               "237 XX XX XX",
        totalWithdrawnTodayFcfa:     0,
        totalWithdrawnThisMonthFcfa: 0,
      });
      expect(result.valid).toBe(true);
    });

    it("rejects withdrawal exceeding available balance", () => {
      const result = validateWithdrawalRequest({
        request:                     makeRequest(50_001),
        balance:                     makeBalance(50_000),
        kycVerified:                 true,
        payoutMethod:                "orange_money",
        payoutAccount:               "237 XX XX XX",
        totalWithdrawnTodayFcfa:     0,
        totalWithdrawnThisMonthFcfa: 0,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects withdrawal below minimum (5 000 FCFA)", () => {
      const result = validateWithdrawalRequest({
        request:                     makeRequest(4_999),
        balance:                     makeBalance(100_000),
        kycVerified:                 true,
        payoutMethod:                "orange_money",
        payoutAccount:               "237 XX XX XX",
        totalWithdrawnTodayFcfa:     0,
        totalWithdrawnThisMonthFcfa: 0,
      });
      expect(result.valid).toBe(false);
    });

    it("accepts withdrawal at exactly minimum (5 000 FCFA)", () => {
      const result = validateWithdrawalRequest({
        request:                     makeRequest(5_000),
        balance:                     makeBalance(100_000),
        kycVerified:                 true,
        payoutMethod:                "orange_money",
        payoutAccount:               "237 XX XX XX",
        totalWithdrawnTodayFcfa:     0,
        totalWithdrawnThisMonthFcfa: 0,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("double-spend prevention via ledger", () => {
    it("second withdrawal fails when first already debited the ledger", () => {
      const bkId = "bk-double-spend";
      const credits  = ledgerBookingCredit({ id: bkId, reference: "STBF-DS", hostPayoutAmount: 100_000, commissionAmount: 15_000, serviceFeeAmount: 10_000 });
      const released = ledgerBookingCompleted({ id: bkId, reference: "STBF-DS", hostPayoutAmount: 100_000, commissionAmount: 15_000, serviceFeeAmount: 10_000 });
      const debit1   = ledgerPayoutDebit({ id: "p1", hostId: HOST_ID, amountFcfa: 80_000 });

      const balAfterFirst = computeBalanceFromEntries([...credits, ...released, debit1]);

      // Second withdrawal request with the post-debit balance
      const result = validateWithdrawalRequest({
        request:                     makeRequest(80_000),
        balance:                     makeBalance(balAfterFirst.hostAvailable),
        kycVerified:                 true,
        payoutMethod:                "orange_money",
        payoutAccount:               "237 XX XX XX",
        totalWithdrawnTodayFcfa:     80_000,
        totalWithdrawnThisMonthFcfa: 80_000,
      });

      expect(result.valid).toBe(false);
      expect(balAfterFirst.hostAvailable).toBe(20_000);
    });

    it("ledger tracks balance accurately after multiple withdrawals", () => {
      const bkId = "bk-multi-w";
      const credits  = ledgerBookingCredit({ id: bkId, reference: "STBF-MW", hostPayoutAmount: 200_000, commissionAmount: 30_000, serviceFeeAmount: 20_000 });
      const released = ledgerBookingCompleted({ id: bkId, reference: "STBF-MW", hostPayoutAmount: 200_000, commissionAmount: 30_000, serviceFeeAmount: 20_000 });
      const debit1   = ledgerPayoutDebit({ id: "p-w1", hostId: HOST_ID, amountFcfa: 60_000 });
      const debit2   = ledgerPayoutDebit({ id: "p-w2", hostId: HOST_ID, amountFcfa: 80_000 });

      const balance = computeBalanceFromEntries([...credits, ...released, debit1, debit2]);
      expect(balance.hostAvailable).toBe(60_000);
      expect(balance.hostWithdrawn).toBe(140_000);
    });
  });

  describe("daily cap", () => {
    it("rejects when daily total + amount > 500 000 FCFA", () => {
      const result = validateWithdrawalRequest({
        request:                     makeRequest(100_000),
        balance:                     makeBalance(1_000_000),
        kycVerified:                 true,
        payoutMethod:                "orange_money",
        payoutAccount:               "237 XX XX XX",
        totalWithdrawnTodayFcfa:     450_000,
        totalWithdrawnThisMonthFcfa: 450_000,
      });
      expect(result.valid).toBe(false);
    });

    it("accepts when daily total + amount = 500 000 FCFA exactly", () => {
      const result = validateWithdrawalRequest({
        request:                     makeRequest(50_000),
        balance:                     makeBalance(1_000_000),
        kycVerified:                 true,
        payoutMethod:                "orange_money",
        payoutAccount:               "237 XX XX XX",
        totalWithdrawnTodayFcfa:     450_000,
        totalWithdrawnThisMonthFcfa: 450_000,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("monthly cap", () => {
    it("rejects when monthly total + amount > 5 000 000 FCFA", () => {
      const result = validateWithdrawalRequest({
        request:                     makeRequest(200_000),
        balance:                     makeBalance(10_000_000),
        kycVerified:                 true,
        payoutMethod:                "orange_money",
        payoutAccount:               "237 XX XX XX",
        totalWithdrawnTodayFcfa:     0,
        totalWithdrawnThisMonthFcfa: 4_900_000,
      });
      expect(result.valid).toBe(false);
    });

    it("accepts when monthly total + amount = 5 000 000 FCFA exactly", () => {
      const result = validateWithdrawalRequest({
        request:                     makeRequest(100_000),
        balance:                     makeBalance(10_000_000),
        kycVerified:                 true,
        payoutMethod:                "orange_money",
        payoutAccount:               "237 XX XX XX",
        totalWithdrawnTodayFcfa:     0,
        totalWithdrawnThisMonthFcfa: 4_900_000,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("state machine correctness", () => {
    const validTransitions: [string, string][] = [
      ["pending",    "approved"],
      ["pending",    "cancelled"],
      ["pending",    "scheduled"],
      ["pending",    "on_hold"],
      ["approved",   "processing"],
      ["approved",   "cancelled"],
      ["scheduled",  "processing"],
      ["processing", "paid"],
      ["processing", "failed"],
      ["failed",     "approved"],
      ["paid",       "reversed"],
    ];

    for (const [from, to] of validTransitions) {
      it(`${from} → ${to} is valid`, () => {
        expect(isValidWithdrawalTransition(from as never, to as never)).toBe(true);
      });
    }

    const invalidTransitions: [string, string][] = [
      ["cancelled", "approved"],
      ["cancelled", "pending"],
      ["reversed",  "paid"],
      ["paid",      "approved"],
    ];

    for (const [from, to] of invalidTransitions) {
      it(`${from} → ${to} is invalid`, () => {
        expect(isValidWithdrawalTransition(from as never, to as never)).toBe(false);
      });
    }
  });

  describe("retry logic", () => {
    it("allows retry when retry_count < 3", () => {
      expect(canRetryWithdrawal({ status: "failed", retryCount: 0 })).toBe(true);
      expect(canRetryWithdrawal({ status: "failed", retryCount: 2 })).toBe(true);
    });

    it("blocks retry at retry_count = 3", () => {
      expect(canRetryWithdrawal({ status: "failed", retryCount: 3 })).toBe(false);
    });

    it("only failed payouts can be retried", () => {
      expect(canRetryWithdrawal({ status: "processing", retryCount: 0 })).toBe(false);
      expect(canRetryWithdrawal({ status: "paid",       retryCount: 0 })).toBe(false);
      expect(canRetryWithdrawal({ status: "cancelled",  retryCount: 0 })).toBe(false);
    });
  });

  describe("KYC and account status", () => {
    it("rejects unverified KYC", () => {
      const result = validateWithdrawalRequest({
        request: makeRequest(10_000), balance: makeBalance(100_000),
        kycVerified: false, payoutMethod: "orange_money", payoutAccount: "237 XX XX XX",
        totalWithdrawnTodayFcfa: 0, totalWithdrawnThisMonthFcfa: 0,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects missing payout method", () => {
      const result = validateWithdrawalRequest({
        request: makeRequest(10_000), balance: makeBalance(100_000),
        kycVerified: true, payoutMethod: null, payoutAccount: "237 XX XX XX",
        totalWithdrawnTodayFcfa: 0, totalWithdrawnThisMonthFcfa: 0,
      });
      expect(result.valid).toBe(false);
    });

    it("rejects method mismatch", () => {
      const result = validateWithdrawalRequest({
        request: makeRequest(10_000, "orange_money"), balance: makeBalance(100_000),
        kycVerified: true, payoutMethod: "moov_money", payoutAccount: "237 XX XX XX",
        totalWithdrawnTodayFcfa: 0, totalWithdrawnThisMonthFcfa: 0,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("ledger integrity after withdrawal", () => {
    it("total withdrawn matches sum of payout debits", () => {
      const bkId = "bk-integrity";
      const credits  = ledgerBookingCredit({ id: bkId, reference: "STBF-INT", hostPayoutAmount: 300_000, commissionAmount: 45_000, serviceFeeAmount: 30_000 });
      const released = ledgerBookingCompleted({ id: bkId, reference: "STBF-INT", hostPayoutAmount: 300_000, commissionAmount: 45_000, serviceFeeAmount: 30_000 });
      const debit1   = ledgerPayoutDebit({ id: "pi1", hostId: HOST_ID, amountFcfa: 100_000 });
      const debit2   = ledgerPayoutDebit({ id: "pi2", hostId: HOST_ID, amountFcfa: 150_000 });

      const balance = computeBalanceFromEntries([...credits, ...released, debit1, debit2]);
      expect(balance.hostWithdrawn).toBe(250_000);
      expect(balance.hostAvailable).toBe(50_000);
    });

    it("available + withdrawn = total earned", () => {
      const bkId = "bk-integrity2";
      const credits  = ledgerBookingCredit({ id: bkId, reference: "STBF-I2", hostPayoutAmount: 100_000, commissionAmount: 15_000, serviceFeeAmount: 10_000 });
      const released = ledgerBookingCompleted({ id: bkId, reference: "STBF-I2", hostPayoutAmount: 100_000, commissionAmount: 15_000, serviceFeeAmount: 10_000 });
      const debit    = ledgerPayoutDebit({ id: "pi3", hostId: HOST_ID, amountFcfa: 70_000 });

      const balance = computeBalanceFromEntries([...credits, ...released, debit]);
      expect(balance.hostAvailable + balance.hostWithdrawn).toBe(100_000);
    });
  });
});
