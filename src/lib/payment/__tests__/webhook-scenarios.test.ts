// ============================================================
// Webhook scenarios — edge cases and security tests
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GaniPayProvider } from "../providers/GaniPayProvider";
import type { GaniPayConfig } from "../providers/GaniPayProvider";

const CONFIG: GaniPayConfig = {
  apiKey:        "test-key",
  environment:   "sandbox",
  webhookSecret: "super-secret-123",
  callbackUrl:   "https://app.test/callback",
  cancelUrl:     "https://app.test/cancel",
};

async function sign(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig  = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function makePayload(overrides?: Record<string, unknown>) {
  return JSON.stringify({
    event_id:    "evt-001",
    event_type:  "payment.successful",
    payment_id:  "gp-001",
    reference:   "REF-001",
    amount:      50_000,
    currency:    "XOF",
    occurred_at: "2026-07-16T18:00:00Z",
    ...overrides,
  });
}

let provider: GaniPayProvider;
beforeEach(() => { provider = new GaniPayProvider(CONFIG); });

// ── Timing-safe comparison ────────────────────────────────────

describe("Webhook signature timing-safe comparison", () => {
  it("rejects a one-character-off signature (not short-circuits)", async () => {
    const payload = makePayload();
    const sig     = await sign(CONFIG.webhookSecret, payload);
    const badSig  = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    const result  = await provider.verifyWebhook(payload, badSig, CONFIG.webhookSecret);
    expect(result.valid).toBe(false);
  });

  it("rejects signature of different length", async () => {
    const payload = makePayload();
    const result  = await provider.verifyWebhook(payload, "short", CONFIG.webhookSecret);
    expect(result.valid).toBe(false);
  });

  it("rejects empty signature", async () => {
    const result = await provider.verifyWebhook(makePayload(), "", CONFIG.webhookSecret);
    expect(result.valid).toBe(false);
  });
});

// ── Duplicate webhook (double-delivery) ───────────────────────

describe("Double-webhook scenario", () => {
  it("two identical webhooks produce the same event data", async () => {
    const payload = makePayload();
    const sig     = await sign(CONFIG.webhookSecret, payload);

    const r1 = await provider.verifyWebhook(payload, sig, CONFIG.webhookSecret);
    const r2 = await provider.verifyWebhook(payload, sig, CONFIG.webhookSecret);

    expect(r1.valid).toBe(true);
    expect(r2.valid).toBe(true);

    if (r1.valid && r2.valid) {
      // Same event_id → idempotency guard in EF deduplicates
      expect(r1.event.providerEventId).toBe(r2.event.providerEventId);
    }
  });
});

// ── Payload manipulation attacks ──────────────────────────────

describe("Payload manipulation attacks", () => {
  it("rejects amount injection (modifying amount in signed payload)", async () => {
    const originalPayload = makePayload({ amount: 50_000 });
    const sig             = await sign(CONFIG.webhookSecret, originalPayload);
    const tamperedPayload = originalPayload.replace("50000", "1");

    const result = await provider.verifyWebhook(tamperedPayload, sig, CONFIG.webhookSecret);
    expect(result.valid).toBe(false);
  });

  it("rejects status injection (modifying event_type in signed payload)", async () => {
    const originalPayload = makePayload({ event_type: "payment.failed" });
    const sig             = await sign(CONFIG.webhookSecret, originalPayload);
    const tamperedPayload = originalPayload.replace("payment.failed", "payment.successful");

    const result = await provider.verifyWebhook(tamperedPayload, sig, CONFIG.webhookSecret);
    expect(result.valid).toBe(false);
  });

  it("rejects payment_id injection", async () => {
    const originalPayload = makePayload({ payment_id: "gp-victim" });
    const sig             = await sign(CONFIG.webhookSecret, originalPayload);
    const tamperedPayload = originalPayload.replace("gp-victim", "gp-attacker");

    const result = await provider.verifyWebhook(tamperedPayload, sig, CONFIG.webhookSecret);
    expect(result.valid).toBe(false);
  });

  it("rejects replay of old webhook for a different amount", async () => {
    const payload1 = makePayload({ event_id: "evt-100", amount: 50_000 });
    const sig1     = await sign(CONFIG.webhookSecret, payload1);

    // Attacker tries to replay with same signature but different amount
    const payload2 = makePayload({ event_id: "evt-100", amount: 500_000 });

    const r1 = await provider.verifyWebhook(payload1, sig1, CONFIG.webhookSecret);
    const r2 = await provider.verifyWebhook(payload2, sig1, CONFIG.webhookSecret);

    expect(r1.valid).toBe(true);
    expect(r2.valid).toBe(false);
  });
});

// ── Double-click / double-payment UI ─────────────────────────

describe("Double-click protection", () => {
  it("two createIntent calls with same idempotencyKey send same reference", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        text: async () => JSON.stringify({ id: "gp-x", status: "pending", checkout_url: "https://sandbox.ganipay.com/checkout/gp-x", expires_at: "2026-07-16T20:00:00Z" }),
        json: async () => ({ id: "gp-x", status: "pending", checkout_url: "https://sandbox.ganipay.com/checkout/gp-x", expires_at: "2026-07-16T20:00:00Z" }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        text: async () => JSON.stringify({ id: "gp-x", status: "pending", checkout_url: "https://sandbox.ganipay.com/checkout/gp-x", expires_at: "2026-07-16T20:00:00Z" }),
        json: async () => ({ id: "gp-x", status: "pending", checkout_url: "https://sandbox.ganipay.com/checkout/gp-x", expires_at: "2026-07-16T20:00:00Z" }),
      });

    const key = "double-click-key";
    const r1  = await provider.createIntent({
      bookingId: "b-1", bookingReference: "REF-1", payerId: "u-1",
      payerEmail: "a@b.com", payerPhone: "70000001", amountFcfa: 50_000,
      currency: "XOF", method: "orange_money", idempotencyKey: key,
      description: "test", metadata: {},
    });
    const r2  = await provider.createIntent({
      bookingId: "b-1", bookingReference: "REF-1", payerId: "u-1",
      payerEmail: "a@b.com", payerPhone: "70000001", amountFcfa: 50_000,
      currency: "XOF", method: "orange_money", idempotencyKey: key,
      description: "test", metadata: {},
    });

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(JSON.parse(calls[0][1].body).reference).toBe(JSON.parse(calls[1][1].body).reference);
    expect(r1.providerTransactionId).toBe(r2.providerTransactionId);

    vi.restoreAllMocks();
  });
});

// ── Payment lifecycle events ──────────────────────────────────

describe("Payment lifecycle webhook events", () => {
  const TEST_EVENTS = [
    { event_type: "payment.successful", expectedStatus: "captured",  expectedType: "payment.captured" },
    { event_type: "payment.failed",     expectedStatus: "failed",    expectedType: "payment.failed" },
    { event_type: "payment.cancelled",  expectedStatus: "cancelled", expectedType: "payment.cancelled" },
    { event_type: "refund.completed",   expectedStatus: "refunded",  expectedType: "refund.completed" },
  ];

  for (const { event_type, expectedStatus, expectedType } of TEST_EVENTS) {
    it(`'${event_type}' → status '${expectedStatus}', type '${expectedType}'`, async () => {
      const payload = makePayload({ event_type });
      const sig     = await sign(CONFIG.webhookSecret, payload);
      const result  = await provider.verifyWebhook(payload, sig, CONFIG.webhookSecret);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.event.mappedStatus).toBe(expectedStatus);
        expect(result.event.type).toBe(expectedType);
      }
    });
  }
});

// ── Refund scenarios ──────────────────────────────────────────

describe("Refund edge cases", () => {
  it("partial refund returns correct amount", async () => {
    const refundPartialData = { id: "gp-refund-partial", status: "completed", amount: 15_000, currency: "XOF", created_at: "2026-07-16T18:00:00Z" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify(refundPartialData),
      json: async () => refundPartialData,
    });

    const result = await provider.refund({
      paymentId: "pay-1", bookingId: "b-1", refundType: "goodwill",
      refundAmountFcfa: 15_000, reason: "Partial refund", requestedBy: "admin-1",
      requesterRole: "admin", idempotencyKey: "refund-partial-1",
      providerTransactionId: "gp-pay-001",
    });

    expect(result.refundAmountFcfa).toBe(15_000);
    expect(result.status).toBe("completed");
  });

  it("failed refund returns failed status", async () => {
    const refundFailData = { id: "gp-refund-fail", status: "failed", amount: 25_000, currency: "XOF", created_at: "2026-07-16T18:00:00Z" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify(refundFailData),
      json: async () => refundFailData,
    });

    const result = await provider.refund({
      paymentId: "pay-2", bookingId: "b-2", refundType: "policy_cancellation",
      refundAmountFcfa: 25_000, reason: "Policy", requestedBy: "system",
      requesterRole: "admin", idempotencyKey: "refund-fail-1",
      providerTransactionId: "gp-pay-002",
    });

    expect(result.status).toBe("failed");
  });
});

// ── Payout scenarios ──────────────────────────────────────────

describe("Payout retry after failure", () => {
  it("getPayout returns failed status with reason", async () => {
    const payoutFailData = { id: "gp-po-fail", status: "failed", paid_at: null, failed_at: "2026-07-16T18:00:00Z", failure_reason: "Numéro Orange Money invalide" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify(payoutFailData),
      json: async () => payoutFailData,
    });

    const result = await provider.getPayout("gp-po-fail");

    expect(result.status).toBe("failed");
    expect(result.failureReason).toBe("Numéro Orange Money invalide");
  });

  it("cancelPayout succeeds for pending payouts", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify({ success: true }),
      json: async () => ({ success: true }),
    });

    const result = await provider.cancelPayout("gp-po-pending", "Admin cancelled");
    expect(result.cancelled).toBe(true);
  });

  it("cancelPayout gracefully handles already-disbursed payout", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 409,
      text: async () => JSON.stringify({ error: "Payout already disbursed" }),
      json: async () => ({ error: "Payout already disbursed" }),
    });

    const result = await provider.cancelPayout("gp-po-paid");
    expect(result.cancelled).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});
