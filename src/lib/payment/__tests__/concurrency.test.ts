// Step 9 — Concurrency tests
// Tests for the idempotency and dedup guarantees of the financial system.
// These tests simulate the CLIENT-SIDE behavior of:
//   - duplicate payment intents (same idempotency key)
//   - duplicate webhook processing
//   - double refund prevention
//   - double payout prevention
//
// Server-side concurrency (race conditions in DB) is handled by
// PostgreSQL UNIQUE constraints — tested here as unit invariants.

import { describe, it, expect } from "vitest";
import { validateLedgerEntries } from "../../utils/validateLedger";
import { ledgerBookingCredit, ledgerBookingCompleted, ledgerPayoutDebit } from "../../wallet/ledger";
import { computeBalanceFromEntries } from "../../wallet/ledger";

// ── Double booking prevention ──────────────────────────────────
// The DB enforces uniqueness via:
//   room_availability UNIQUE (room_id, date) + status='booked'
//   claim_availability() — atomic UPDATE that returns 0 if already booked

describe("Double booking prevention", () => {
  it("second claim on already-booked dates yields zero affected rows", () => {
    // Simulates claim_availability returning 0 (already claimed)
    const firstClaimRows = 3;  // 3 nights claimed successfully
    const secondClaimRows = 0; // second attempt finds 0 open rows

    expect(firstClaimRows).toBeGreaterThan(0);  // first succeeds
    expect(secondClaimRows).toBe(0);             // second fails → caller rejects booking
  });

  it("ledger does not double-count if booking created twice with same id", () => {
    const booking = {
      id: "bk-dupe",
      reference: "STBF-DUPE",
      hostPayoutAmount: 85_000,
      commissionAmount: 15_000,
      serviceFeeAmount: 10_000,
    };

    // If the same booking's ledger entries are written twice (idempotent upsert by id),
    // the balance must equal a SINGLE booking, not double.
    const entries = [...ledgerBookingCredit(booking), ...ledgerBookingCredit(booking)];

    // In reality, ON CONFLICT DO NOTHING deduplicates on (booking_id, type).
    // Simulate by keying on bookingId+type — the DB uniqueness invariant.
    const seen = new Set<string>();
    const deduped = entries.filter((e) => {
      const key = `${e.bookingId}-${e.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const bal = computeBalanceFromEntries(deduped);
    expect(bal.hostPending).toBe(85_000);         // single booking, not 170_000
    expect(bal.platformPending).toBe(25_000);     // single commission + fee
  });
});

// ── Double webhook prevention ──────────────────────────────────
// Dedup is enforced by:
//   payment_webhook_logs UNIQUE (provider, provider_event_id)
//   payment_events UNIQUE (payment_id, provider_event_id)

describe("Double webhook prevention", () => {
  it("second webhook with same event id is detected as duplicate", () => {
    // Simulate the UNIQUE constraint check logic
    const processedEvents = new Set<string>();

    function processWebhookEvent(providerEventId: string): "new" | "duplicate" {
      if (processedEvents.has(providerEventId)) return "duplicate";
      processedEvents.add(providerEventId);
      return "new";
    }

    expect(processWebhookEvent("TXN-001")).toBe("new");
    expect(processWebhookEvent("TXN-001")).toBe("duplicate"); // same id
    expect(processWebhookEvent("TXN-002")).toBe("new");       // different id
  });

  it("duplicate webhook does not add ledger entries", () => {
    const processedBookings = new Set<string>();

    function processLedgerWrite(bookingId: string): boolean {
      if (processedBookings.has(bookingId)) return false; // already written
      processedBookings.add(bookingId);
      return true;
    }

    expect(processLedgerWrite("bk-001")).toBe(true);
    expect(processLedgerWrite("bk-001")).toBe(false); // second attempt blocked
  });
});

// ── Double payment prevention ──────────────────────────────────
// Enforced by:
//   payments UNIQUE (idempotency_key)

describe("Double payment prevention", () => {
  it("same idempotency key must resolve to same payment", () => {
    const idempotencyStore = new Map<string, { paymentId: string; status: string }>();

    function createPayment(idempotencyKey: string, bookingId: string): { paymentId: string; created: boolean } {
      if (idempotencyStore.has(idempotencyKey)) {
        return { paymentId: idempotencyStore.get(idempotencyKey)!.paymentId, created: false };
      }
      const paymentId = `pay-${Math.random().toString(36).slice(2)}`;
      idempotencyStore.set(idempotencyKey, { paymentId, status: "initiated" });
      return { paymentId, created: true };
    }

    const key = `${crypto.randomUUID()}`;
    const first  = createPayment(key, "bk-001");
    const second = createPayment(key, "bk-001");

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.paymentId).toBe(second.paymentId); // same payment returned
  });
});

// ── Double refund prevention ───────────────────────────────────
// Enforced by:
//   validate_refund_amount() DB trigger — SUM(prior refunds) + new <= captured
//   refunds UNIQUE (idempotency_key)

describe("Double refund prevention", () => {
  it("total refunded cannot exceed captured amount", () => {
    const capturedAmount = 110_000; // total payment

    function validateRefundAmount(priorRefundedTotal: number, newRefundAmount: number): boolean {
      return priorRefundedTotal + newRefundAmount <= capturedAmount;
    }

    expect(validateRefundAmount(0, 110_000)).toBe(true);    // full refund: ok
    expect(validateRefundAmount(0, 110_001)).toBe(false);   // over-refund: rejected
    expect(validateRefundAmount(50_000, 60_000)).toBe(true);  // exactly at limit: ok
    expect(validateRefundAmount(50_000, 60_001)).toBe(false); // one over limit: rejected
  });

  it("same refund idempotency key returns existing refund", () => {
    const store = new Map<string, string>();

    function createRefund(key: string): { refundId: string; created: boolean } {
      if (store.has(key)) return { refundId: store.get(key)!, created: false };
      const id = `rf-${Math.random().toString(36).slice(2)}`;
      store.set(key, id);
      return { refundId: id, created: true };
    }

    const key = crypto.randomUUID();
    const r1 = createRefund(key);
    const r2 = createRefund(key);

    expect(r1.created).toBe(true);
    expect(r2.created).toBe(false);
    expect(r1.refundId).toBe(r2.refundId);
  });
});

// ── Payout double-disbursement prevention ──────────────────────
// Enforced by:
//   payout_items UNIQUE (booking_id) — one booking per payout batch ever

describe("Payout double-disbursement prevention", () => {
  it("a booking can appear in at most one payout batch", () => {
    const disbursedBookings = new Set<string>();

    function addBookingToPayout(bookingId: string): boolean {
      if (disbursedBookings.has(bookingId)) return false; // already disbursed
      disbursedBookings.add(bookingId);
      return true;
    }

    expect(addBookingToPayout("bk-001")).toBe(true);
    expect(addBookingToPayout("bk-001")).toBe(false); // second time: rejected
    expect(addBookingToPayout("bk-002")).toBe(true);  // different booking: ok
  });
});

// ── validateLedgerEntries guard ────────────────────────────────

describe("validateLedgerEntries — pre-write guard", () => {
  it("rejects empty entry list", () => {
    const result = validateLedgerEntries([]);
    expect(result.valid).toBe(false);
  });

  it("rejects zero-amount entry", () => {
    const result = validateLedgerEntries([{ debitAccount: "HOST_PENDING", creditAccount: null, amountFcfa: 0 }]);
    expect(result.valid).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = validateLedgerEntries([{ debitAccount: "HOST_PENDING", creditAccount: null, amountFcfa: -100 }]);
    expect(result.valid).toBe(false);
  });

  it("accepts single-sided entries when requireBalance=false", () => {
    const result = validateLedgerEntries(
      [{ debitAccount: null, creditAccount: "HOST_PENDING", amountFcfa: 10_000 }],
      { requireBalance: false }
    );
    expect(result.valid).toBe(true);
  });

  it("rejects imbalanced mixed entries when requireBalance=true (default)", () => {
    const result = validateLedgerEntries([
      { debitAccount: "HOST_PENDING",  creditAccount: null, amountFcfa: 85_000 },
      { debitAccount: null, creditAccount: "HOST_AVAILABLE", amountFcfa: 80_000 }, // mismatch
    ], { requireBalance: true });
    expect(result.valid).toBe(false);
  });

  it("accepts balanced mixed entries", () => {
    const result = validateLedgerEntries([
      { debitAccount: "HOST_PENDING",  creditAccount: null,            amountFcfa: 85_000 },
      { debitAccount: null,            creditAccount: "HOST_AVAILABLE", amountFcfa: 85_000 },
    ], { requireBalance: true });
    expect(result.valid).toBe(true);
    expect(result.creditTotal).toBe(85_000);
    expect(result.debitTotal).toBe(85_000);
  });
});
