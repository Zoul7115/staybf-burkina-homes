import { describe, it, expect } from "vitest";
import {
  validateWithdrawalRequest,
  isValidWithdrawalTransition,
  canRetryWithdrawal,
} from "../withdrawals";
import type { HostWalletBalance, WithdrawalTransaction } from "../types";

const MINIMUM = 5_000;
const DAILY_LIMIT = 500_000;
const MONTHLY_LIMIT = 5_000_000;

const wallet: HostWalletBalance = {
  hostId: "h-1",
  pendingBalance: 0,
  availableBalance: 100_000,
  withdrawnBalance: 0,
  totalEarned: 100_000,
  currency: "XOF",
  computedAt: new Date().toISOString(),
};

const validOpts = {
  request: { amountFcfa: 50_000, method: "orange_money" as const, accountDetails: "123456789" },
  balance: wallet,
  kycVerified: true,
  payoutMethod: "orange_money",
  payoutAccount: "123456789",
  totalWithdrawnTodayFcfa: 0,
  totalWithdrawnThisMonthFcfa: 0,
};

describe("validateWithdrawalRequest", () => {
  it("accepts a valid request", () => {
    const result = validateWithdrawalRequest(validOpts);
    expect(result.valid).toBe(true);
  });

  it("rejects unverified KYC", () => {
    expect(validateWithdrawalRequest({ ...validOpts, kycVerified: false }).valid).toBe(false);
  });

  it("rejects missing payout account", () => {
    expect(validateWithdrawalRequest({ ...validOpts, payoutAccount: null }).valid).toBe(false);
    expect(validateWithdrawalRequest({ ...validOpts, payoutMethod: null }).valid).toBe(false);
  });

  it(`rejects amount below ${MINIMUM} FCFA`, () => {
    const r = validateWithdrawalRequest({ ...validOpts, request: { ...validOpts.request, amountFcfa: MINIMUM - 1 } });
    expect(r.valid).toBe(false);
  });

  it("rejects amount exceeding available balance", () => {
    const r = validateWithdrawalRequest({ ...validOpts, request: { ...validOpts.request, amountFcfa: 200_000 } });
    expect(r.valid).toBe(false);
  });

  it("rejects when daily cap would be exceeded", () => {
    const r = validateWithdrawalRequest({ ...validOpts, totalWithdrawnTodayFcfa: DAILY_LIMIT - 10_000, balance: { ...wallet, availableBalance: 600_000 }, request: { ...validOpts.request, amountFcfa: 50_000 } });
    expect(r.valid).toBe(false);
  });

  it("rejects when monthly cap would be exceeded", () => {
    const r = validateWithdrawalRequest({ ...validOpts, totalWithdrawnThisMonthFcfa: MONTHLY_LIMIT - 10_000, balance: { ...wallet, availableBalance: 600_000 }, request: { ...validOpts.request, amountFcfa: 50_000 } });
    expect(r.valid).toBe(false);
  });

  it("rejects method mismatch", () => {
    const r = validateWithdrawalRequest({ ...validOpts, request: { ...validOpts.request, method: "moov_money" } });
    expect(r.valid).toBe(false);
  });
});

describe("isValidWithdrawalTransition — 7-state machine", () => {
  // pending →
  it("allows pending → approved", () => expect(isValidWithdrawalTransition("pending", "approved")).toBe(true));
  it("allows pending → cancelled", () => expect(isValidWithdrawalTransition("pending", "cancelled")).toBe(true));
  it("allows pending → scheduled (legacy)", () => expect(isValidWithdrawalTransition("pending", "scheduled")).toBe(true));
  it("allows pending → on_hold", () => expect(isValidWithdrawalTransition("pending", "on_hold")).toBe(true));
  it("rejects pending → processing (must go through approved first)", () => expect(isValidWithdrawalTransition("pending", "processing")).toBe(false));
  it("rejects pending → paid", () => expect(isValidWithdrawalTransition("pending", "paid")).toBe(false));

  // approved →
  it("allows approved → processing", () => expect(isValidWithdrawalTransition("approved", "processing")).toBe(true));
  it("allows approved → cancelled", () => expect(isValidWithdrawalTransition("approved", "cancelled")).toBe(true));
  it("rejects approved → pending", () => expect(isValidWithdrawalTransition("approved", "pending")).toBe(false));

  // scheduled → (legacy path)
  it("allows scheduled → processing", () => expect(isValidWithdrawalTransition("scheduled", "processing")).toBe(true));
  it("allows scheduled → on_hold", () => expect(isValidWithdrawalTransition("scheduled", "on_hold")).toBe(true));
  it("allows scheduled → approved (promote)", () => expect(isValidWithdrawalTransition("scheduled", "approved")).toBe(true));

  // on_hold →
  it("allows on_hold → approved", () => expect(isValidWithdrawalTransition("on_hold", "approved")).toBe(true));
  it("allows on_hold → scheduled", () => expect(isValidWithdrawalTransition("on_hold", "scheduled")).toBe(true));
  it("allows on_hold → cancelled", () => expect(isValidWithdrawalTransition("on_hold", "cancelled")).toBe(true));

  // processing →
  it("allows processing → paid", () => expect(isValidWithdrawalTransition("processing", "paid")).toBe(true));
  it("allows processing → failed", () => expect(isValidWithdrawalTransition("processing", "failed")).toBe(true));

  // failed →
  it("allows failed → approved (new retry path)", () => expect(isValidWithdrawalTransition("failed", "approved")).toBe(true));
  it("allows failed → scheduled (legacy retry)", () => expect(isValidWithdrawalTransition("failed", "scheduled")).toBe(true));
  it("allows failed → on_hold", () => expect(isValidWithdrawalTransition("failed", "on_hold")).toBe(true));

  // paid →
  it("allows paid → reversed", () => expect(isValidWithdrawalTransition("paid", "reversed")).toBe(true));
  it("rejects paid → pending (terminal→non-terminal)", () => expect(isValidWithdrawalTransition("paid", "pending")).toBe(false));
  it("rejects paid → processing", () => expect(isValidWithdrawalTransition("paid", "processing")).toBe(false));

  // terminal →
  it("rejects cancelled → anything", () => {
    expect(isValidWithdrawalTransition("cancelled", "pending")).toBe(false);
    expect(isValidWithdrawalTransition("cancelled", "approved")).toBe(false);
  });
  it("rejects reversed → anything", () => {
    expect(isValidWithdrawalTransition("reversed", "pending")).toBe(false);
    expect(isValidWithdrawalTransition("reversed", "paid")).toBe(false);
  });
});

describe("canRetryWithdrawal", () => {
  const base: WithdrawalTransaction = {
    id: "po-1", hostId: "h-1", status: "failed", amountFcfa: 50_000, currency: "XOF",
    method: "orange_money", payoutAccountSnapshot: "", periodStart: "", periodEnd: "",
    scheduledFor: null, dispatchedAt: null, paidAt: null, failedAt: null,
    failureReason: null, retryCount: 0, createdAt: "",
  };

  it("allows retry when retryCount < 3 and status is failed", () => {
    expect(canRetryWithdrawal({ ...base, retryCount: 0 })).toBe(true);
    expect(canRetryWithdrawal({ ...base, retryCount: 2 })).toBe(true);
  });

  it("disallows retry after 3 failures", () => {
    expect(canRetryWithdrawal({ ...base, retryCount: 3 })).toBe(false);
  });

  it("disallows retry for non-failed status", () => {
    expect(canRetryWithdrawal({ ...base, status: "paid", retryCount: 0 })).toBe(false);
  });
});
