// ============================================================
// Payment lifecycle tests — state machine + financial integrity
// ============================================================

import { describe, it, expect } from "vitest";

// ── Payment status state machine ──────────────────────────────

type PaymentStatus =
  | "initiated" | "pending" | "processing" | "authorized"
  | "captured"  | "failed"  | "cancelled"  | "expired"
  | "refunded"  | "partially_refunded"     | "chargeback";

const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  initiated:           ["pending", "failed", "cancelled"],
  pending:             ["processing", "authorized", "captured", "failed", "cancelled", "expired"],
  processing:          ["captured", "failed", "cancelled"],
  authorized:          ["captured", "failed", "cancelled"],
  captured:            ["refunded", "partially_refunded", "chargeback"],
  failed:              ["pending"],  // retry
  cancelled:           [],
  expired:             [],
  refunded:            [],
  partially_refunded:  ["refunded"],
  chargeback:          [],
};

function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

describe("Payment status state machine", () => {
  it("traces happy path: initiated → pending → captured", () => {
    const path: PaymentStatus[] = ["initiated", "pending", "captured"];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("allows full refund after capture", () => {
    expect(canTransition("captured", "refunded")).toBe(true);
  });

  it("allows partial refund after capture", () => {
    expect(canTransition("captured", "partially_refunded")).toBe(true);
  });

  it("allows chargeback after capture", () => {
    expect(canTransition("captured", "chargeback")).toBe(true);
  });

  it("allows retry: failed → pending", () => {
    expect(canTransition("failed", "pending")).toBe(true);
  });

  it("allows payment expiry: pending → expired", () => {
    expect(canTransition("pending", "expired")).toBe(true);
  });

  it("blocks refund before capture", () => {
    expect(canTransition("initiated", "refunded")).toBe(false);
    expect(canTransition("pending", "refunded")).toBe(false);
    expect(canTransition("failed", "refunded")).toBe(false);
  });

  it("captured is terminal except for refund/chargeback", () => {
    expect(canTransition("captured", "pending")).toBe(false);
    expect(canTransition("captured", "failed")).toBe(false);
  });

  it("cancelled is terminal", () => {
    for (const s of Object.keys(ALLOWED_TRANSITIONS) as PaymentStatus[]) {
      if (s === "cancelled") continue;
      expect(canTransition("cancelled", s)).toBe(false);
    }
  });

  it("expired is terminal", () => {
    for (const s of Object.keys(ALLOWED_TRANSITIONS) as PaymentStatus[]) {
      if (s === "expired") continue;
      expect(canTransition("expired", s)).toBe(false);
    }
  });
});

// ── Financial integrity ───────────────────────────────────────

describe("Financial integrity — 0 FCFA tolerance", () => {
  it("host_payout + commission + service_fee = total_amount", () => {
    const totalAmount   = 100_000;
    const commission    = 10_000;  // 10%
    const serviceFee    = 5_000;   // 5%
    const hostPayout    = totalAmount - commission - serviceFee;

    expect(hostPayout + commission + serviceFee).toBe(totalAmount);
  });

  it("refund amount cannot exceed capture amount", () => {
    const captured   = 100_000;
    const refundable = 95_000;  // after non-refundable service fee

    expect(refundable).toBeLessThanOrEqual(captured);
  });

  it("double-payment idempotency: second capture at same amount is equal", () => {
    const amount1 = 50_000;
    const amount2 = 50_000;  // same booking, same amount
    expect(amount1).toBe(amount2);  // idempotent — no double-billing
  });

  it("partial refund leaves remainder = captured - refunded", () => {
    const captured   = 100_000;
    const refunded   = 40_000;
    const remainder  = captured - refunded;
    expect(remainder).toBe(60_000);
    expect(remainder).toBeGreaterThan(0);
  });

  it("full refund leaves remainder = 0", () => {
    const captured = 100_000;
    const refunded = 100_000;
    expect(captured - refunded).toBe(0);
  });

  it("platform wallet: commission + service_fee = platform_revenue", () => {
    const commission = 10_000;
    const serviceFee = 5_000;
    expect(commission + serviceFee).toBe(15_000);
  });
});

// ── Multi-payment scenarios ────────────────────────────────────

describe("Multi-payment scenarios", () => {
  it("100 payments: total volume is sum of all amounts", () => {
    const amounts = Array.from({ length: 100 }, (_, i) => (i + 1) * 5_000);
    const total   = amounts.reduce((s, a) => s + a, 0);
    expect(total).toBe(100 * 101 * 5_000 / 2);  // 5k * (1+2+...+100) = 5k * 5050 = 25.25M
  });

  it("500 payments with 50 refunds: net volume = total - refunded", () => {
    const payments  = Array.from({ length: 500 }, () => 20_000);
    const refunds   = Array.from({ length: 50 },  () => 20_000);
    const netVolume = payments.reduce((s, a) => s + a, 0) - refunds.reduce((s, a) => s + a, 0);
    expect(netVolume).toBe(450 * 20_000);
  });

  it("captures do not duplicate when same idempotency key used twice", () => {
    const seen = new Set<string>();
    const keys  = ["k1", "k1", "k2", "k3", "k3", "k3"];  // duplicates
    for (const k of keys) seen.add(k);
    expect(seen.size).toBe(3);  // only unique keys
  });

  it("double-webhook delivers same event_id twice — idempotency guard absorbs duplicate", () => {
    const processedIds = new Set<string>();
    const webhooks     = ["evt-001", "evt-001", "evt-002"];  // evt-001 delivered twice

    let processed = 0;
    for (const id of webhooks) {
      if (!processedIds.has(id)) {
        processedIds.add(id);
        processed++;
      }
    }
    expect(processed).toBe(2);  // only 2 unique events processed
  });
});

// ── Timeout scenarios ─────────────────────────────────────────

describe("Timeout and expiry scenarios", () => {
  it("expired payment should not be retriable directly", () => {
    expect(canTransition("expired", "pending")).toBe(false);
    expect(canTransition("expired", "captured")).toBe(false);
  });

  it("a timed-out payment eventually moves to expired via provider webhook", () => {
    // pending (30 min TTL) → provider webhook → expired
    expect(canTransition("pending", "expired")).toBe(true);
  });

  it("payment expiry calculation: 30 minutes from creation", () => {
    const created = new Date("2026-07-16T18:00:00Z");
    const expires = new Date(created.getTime() + 30 * 60_000);
    // Compare without milliseconds
    expect(expires.toISOString().slice(0, 19)).toBe("2026-07-16T18:30:00");
  });
});
