import { describe, it, expect } from "vitest";
import {
  booking_created,
  booking_completed,
  booking_cancelled,
  withdrawal_paid,
  refund_created,
  applyDelta,
} from "../walletEngine";
import type { HostWalletBalance } from "../types";

const BOOKING = {
  id: "bk-1",
  reference: "STBF-001",
  hostPayoutAmount: 85_000,
  commissionAmount: 15_000,
  serviceFeeAmount: 10_000,
};

const ZERO_WALLET: HostWalletBalance = {
  hostId: "h-1",
  pendingBalance: 0,
  availableBalance: 0,
  withdrawnBalance: 0,
  totalEarned: 0,
  currency: "XOF",
  computedAt: new Date().toISOString(),
};

describe("booking_created", () => {
  it("credits host_pending and platform_pending", () => {
    const op = booking_created(BOOKING);
    expect(op.walletDelta.hostPendingDelta).toBe(85_000);
    expect(op.walletDelta.platformPendingDelta).toBe(25_000);
    expect(op.entries).toHaveLength(3);
  });
});

describe("booking_completed", () => {
  it("transfers pending → available for host and platform", () => {
    const op = booking_completed(BOOKING);
    expect(op.walletDelta.hostPendingDelta).toBe(-85_000);
    expect(op.walletDelta.hostAvailableDelta).toBe(85_000);
    expect(op.walletDelta.platformPendingDelta).toBe(-15_000);
    expect(op.walletDelta.platformAvailableDelta).toBe(15_000);
  });
});

describe("booking_cancelled", () => {
  it("reverses pending when booking was not completed", () => {
    const op = booking_cancelled({ ...BOOKING, wasCompleted: false });
    expect(op.walletDelta.hostPendingDelta).toBe(-85_000);
    expect(op.walletDelta.platformPendingDelta).toBe(-25_000);
    expect(op.walletDelta.hostAvailableDelta).toBe(0);
  });

  it("reverses available when booking was completed", () => {
    const op = booking_cancelled({ ...BOOKING, wasCompleted: true });
    expect(op.walletDelta.hostAvailableDelta).toBe(-85_000);
    expect(op.walletDelta.platformAvailableDelta).toBe(-25_000);
    expect(op.walletDelta.hostPendingDelta).toBe(0);
  });
});

describe("withdrawal_paid", () => {
  it("moves available → withdrawn", () => {
    const op = withdrawal_paid({ id: "po-1", hostId: "h-1", amountFcfa: 50_000 });
    expect(op.walletDelta.hostAvailableDelta).toBe(-50_000);
    expect(op.walletDelta.hostWithdrawnDelta).toBe(50_000);
    expect(op.entries).toHaveLength(1);
  });
});

describe("refund_created", () => {
  it("debits host_pending and platform_pending", () => {
    const op = refund_created({
      id: "rf-1",
      bookingId: "bk-1",
      bookingReference: "STBF-001",
      refundAmountFcfa: 85_000,
      commissionReversal: 15_000,
      serviceFeeReversal: 10_000,
    });
    expect(op.walletDelta.hostPendingDelta).toBe(-85_000);
    expect(op.walletDelta.platformPendingDelta).toBe(-25_000);
  });
});

describe("applyDelta", () => {
  it("applies positive deltas correctly", () => {
    const op = booking_created(BOOKING);
    const result = applyDelta(ZERO_WALLET, op.walletDelta);
    expect(result.pendingBalance).toBe(85_000);
    expect(result.totalEarned).toBe(0); // not yet available
  });

  it("clamps to zero on over-debit", () => {
    const wallet: HostWalletBalance = { ...ZERO_WALLET, pendingBalance: 10_000 };
    const result = applyDelta(wallet, { hostPendingDelta: -999_999, hostAvailableDelta: 0, hostWithdrawnDelta: 0, platformPendingDelta: 0, platformAvailableDelta: 0 });
    expect(result.pendingBalance).toBe(0);
  });

  it("full lifecycle: confirm → complete → withdraw", () => {
    const confirmed = applyDelta(ZERO_WALLET, booking_created(BOOKING).walletDelta);
    const completed = applyDelta(confirmed, booking_completed(BOOKING).walletDelta);
    const withdrawn = applyDelta(completed, withdrawal_paid({ id: "po-1", hostId: "h-1", amountFcfa: 85_000 }).walletDelta);

    expect(confirmed.pendingBalance).toBe(85_000);
    expect(completed.pendingBalance).toBe(0);
    expect(completed.availableBalance).toBe(85_000);
    expect(withdrawn.availableBalance).toBe(0);
    expect(withdrawn.withdrawnBalance).toBe(85_000);
    expect(withdrawn.totalEarned).toBe(85_000);
  });
});
