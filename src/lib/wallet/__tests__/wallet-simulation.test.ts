// Step 11 — Wallet simulation tests
// Simulate 100 / 500 / 1 000 bookings.
// Recalculate the wallet entirely from ledger entries.
// Compare against direct arithmetic — no discrepancy tolerated.

import { describe, it, expect } from "vitest";
import {
  ledgerBookingCredit,
  ledgerBookingCompleted,
  ledgerPayoutDebit,
  computeBalanceFromEntries,
} from "../ledger";
import type { LedgerEntry } from "../types";

type SimBooking = {
  id: string;
  reference: string;
  hostPayoutAmount: number;
  commissionAmount: number;
  serviceFeeAmount: number;
};

function makeBookings(count: number): SimBooking[] {
  return Array.from({ length: count }, (_, i) => ({
    id:               `bk-${i}`,
    reference:        `STBF-${String(i).padStart(6, "0")}`,
    hostPayoutAmount: 85_000 + (i % 3) * 5_000,
    commissionAmount: 15_000 + (i % 2) * 2_500,
    serviceFeeAmount: 10_000 + (i % 4) * 1_000,
  }));
}

function simulateLifecycle(
  bookings: SimBooking[],
  completedIndices: Set<number>,
  payoutHostIndices: Set<number>
): { entries: LedgerEntry[]; expectedBalance: Record<string, number> } {
  const entries: LedgerEntry[] = [];

  let expectedHostPending   = 0;
  let expectedHostAvailable = 0;
  let expectedHostWithdrawn = 0;
  let expectedPlatformPending   = 0;
  let expectedPlatformAvailable = 0;

  for (let i = 0; i < bookings.length; i++) {
    const b = bookings[i];
    entries.push(...ledgerBookingCredit(b));
    expectedHostPending       += b.hostPayoutAmount;
    expectedPlatformPending   += b.commissionAmount + b.serviceFeeAmount;

    if (completedIndices.has(i)) {
      entries.push(...ledgerBookingCompleted(b));
      expectedHostPending       -= b.hostPayoutAmount;
      expectedHostAvailable     += b.hostPayoutAmount;
      expectedPlatformPending   -= b.commissionAmount + b.serviceFeeAmount;
      expectedPlatformAvailable += b.commissionAmount + b.serviceFeeAmount;

      if (payoutHostIndices.has(i)) {
        entries.push(ledgerPayoutDebit({ id: `po-${i}`, hostId: "h-1", amountFcfa: b.hostPayoutAmount }));
        expectedHostAvailable -= b.hostPayoutAmount;
        expectedHostWithdrawn += b.hostPayoutAmount;
      }
    }
  }

  return {
    entries,
    expectedBalance: {
      hostPending:       expectedHostPending,
      hostAvailable:     expectedHostAvailable,
      hostWithdrawn:     expectedHostWithdrawn,
      platformPending:   expectedPlatformPending,
      platformAvailable: expectedPlatformAvailable,
    },
  };
}

function runSimulation(count: number): void {
  const bookings = makeBookings(count);

  // Simulate: first 60% completed, first 30% paid out
  const completedCount = Math.floor(count * 0.6);
  const payoutCount    = Math.floor(count * 0.3);
  const completedSet   = new Set(Array.from({ length: completedCount }, (_, i) => i));
  const payoutSet      = new Set(Array.from({ length: payoutCount }, (_, i) => i));

  const { entries, expectedBalance } = simulateLifecycle(bookings, completedSet, payoutSet);
  const computed = computeBalanceFromEntries(entries);

  expect(computed.hostPending,       `hostPending (${count} bookings)`).toBe(expectedBalance.hostPending);
  expect(computed.hostAvailable,     `hostAvailable (${count} bookings)`).toBe(expectedBalance.hostAvailable);
  expect(computed.hostWithdrawn,     `hostWithdrawn (${count} bookings)`).toBe(expectedBalance.hostWithdrawn);
  expect(computed.platformPending,   `platformPending (${count} bookings)`).toBe(expectedBalance.platformPending);
  expect(computed.platformAvailable, `platformAvailable (${count} bookings)`).toBe(expectedBalance.platformAvailable);
}

describe("Wallet simulation — projections match direct arithmetic", () => {
  it("100 bookings (60% completed, 30% paid out)", () => {
    runSimulation(100);
  });

  it("500 bookings (60% completed, 30% paid out)", () => {
    runSimulation(500);
  });

  it("1 000 bookings (60% completed, 30% paid out)", () => {
    runSimulation(1_000);
  });

  it("all bookings confirmed + all paid out = zero available balance", () => {
    const bookings = makeBookings(50);
    const entries: LedgerEntry[] = [];

    for (const b of bookings) {
      entries.push(...ledgerBookingCredit(b));
      entries.push(...ledgerBookingCompleted(b));
      entries.push(ledgerPayoutDebit({ id: `po-${b.id}`, hostId: "h-1", amountFcfa: b.hostPayoutAmount }));
    }

    const bal = computeBalanceFromEntries(entries);
    expect(bal.hostPending).toBe(0);
    expect(bal.hostAvailable).toBe(0);
    const totalWithdrawn = bookings.reduce((s, b) => s + b.hostPayoutAmount, 0);
    expect(bal.hostWithdrawn).toBe(totalWithdrawn);
  });

  it("ledger projection balance matches arithmetic sum — zero discrepancy", () => {
    const count = 200;
    const bookings = makeBookings(count);
    const { entries, expectedBalance } = simulateLifecycle(
      bookings,
      new Set(Array.from({ length: count }, (_, i) => i)), // all completed
      new Set()                                             // none paid out
    );

    const computed = computeBalanceFromEntries(entries);

    // No discrepancy allowed
    expect(computed.hostPending).toBe(expectedBalance.hostPending);
    expect(computed.hostAvailable).toBe(expectedBalance.hostAvailable);
    expect(computed.platformPending).toBe(expectedBalance.platformPending);
    expect(computed.platformAvailable).toBe(expectedBalance.platformAvailable);

    // Host available must equal total of all host_payout_amounts (all paid + none withdrawn)
    const totalHostPayout = bookings.reduce((s, b) => s + b.hostPayoutAmount, 0);
    expect(computed.hostAvailable).toBe(totalHostPayout);
  });
});
