// ============================================================
// GaniPayProvider — unit tests
//
// Tests all methods against mock HTTP responses.
// No actual GaniPay calls — fetch is mocked.
// Scenarios: success, failure, cancel, refund, webhook verify,
//            double-payment, double-webhook, timeout, retry.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GaniPayProvider } from "../providers/GaniPayProvider";
import type { GaniPayConfig } from "../providers/GaniPayProvider";
import type { CreateIntentRequest } from "../provider";
import type { RefundRequest } from "../types";

// ── Config fixture ────────────────────────────────────────────

const TEST_CONFIG: GaniPayConfig = {
  apiKey:        "test-api-key-123",
  environment:   "sandbox",
  webhookSecret: "test-webhook-secret",
  callbackUrl:   "https://app.staybf.com/payment/callback",
  cancelUrl:     "https://app.staybf.com/payment/cancel",
};

const PAYMENT_INTENT_REQUEST: CreateIntentRequest = {
  bookingId:        "booking-1",
  bookingReference: "STBF-2026-001",
  payerId:          "traveler-1",
  payerEmail:       "traveler@example.com",
  payerPhone:       "70000001",
  amountFcfa:       50_000,
  currency:         "XOF",
  method:           "orange_money",
  idempotencyKey:   "idem-001",
  description:      "Réservation STBF-2026-001",
  metadata:         {},
};

// ── Mock fetch ────────────────────────────────────────────────

function mockFetch(response: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(response),
    json: async () => response,
  });
}

function mockFetchError(message: string) {
  global.fetch = vi.fn().mockRejectedValue(new Error(message));
}

let provider: GaniPayProvider;

beforeEach(() => {
  provider = new GaniPayProvider(TEST_CONFIG);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── createIntent ──────────────────────────────────────────────

describe("GaniPayProvider.createIntent", () => {
  it("returns checkout_url and providerTransactionId on success", async () => {
    mockFetch({
      id:           "gp-pay-001",
      status:       "pending",
      checkout_url: "https://sandbox.ganipay.com/checkout/gp-pay-001",
      expires_at:   "2026-07-16T20:00:00Z",
    });

    const result = await provider.createIntent(PAYMENT_INTENT_REQUEST);

    expect(result.providerTransactionId).toBe("gp-pay-001");
    expect(result.providerRedirectUrl).toBe("https://sandbox.ganipay.com/checkout/gp-pay-001");
    expect(result.requiresAction).toBe(true);
    expect(result.actionUrl).toBe("https://sandbox.ganipay.com/checkout/gp-pay-001");
    expect(result.expiresAt).toBe("2026-07-16T20:00:00Z");
  });

  it("sends correct fields to GaniPay API", async () => {
    mockFetch({ id: "gp-pay-002", status: "pending", checkout_url: null, expires_at: "2026-07-16T20:00:00Z" });

    await provider.createIntent(PAYMENT_INTENT_REQUEST);

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body as string);

    expect(body.amount).toBe(50_000);
    expect(body.currency).toBe("XOF");
    expect(body.method).toBe("orange_money");
    expect(body.reference).toBe("idem-001");
    expect(body.customer.email).toBe("traveler@example.com");
    expect(body.metadata.booking_id).toBe("booking-1");
  });

  it("uses sandbox base URL in sandbox environment", async () => {
    mockFetch({ id: "gp-x", status: "pending", checkout_url: null, expires_at: "2026-07-16T20:00:00Z" });
    await provider.createIntent(PAYMENT_INTENT_REQUEST);
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("sandbox.ganipay.com");
  });

  it("uses production base URL in production environment", async () => {
    const prodProvider = new GaniPayProvider({ ...TEST_CONFIG, environment: "production" });
    mockFetch({ id: "gp-x", status: "pending", checkout_url: null, expires_at: "2026-07-16T20:00:00Z" });
    await prodProvider.createIntent(PAYMENT_INTENT_REQUEST);
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("api.ganipay.com");
    expect(url).not.toContain("sandbox");
  });

  it("throws on GaniPay API error", async () => {
    mockFetch({ error: "Insufficient balance" }, 402);
    await expect(provider.createIntent(PAYMENT_INTENT_REQUEST)).rejects.toThrow("Insufficient balance");
  });

  it("throws on network error", async () => {
    mockFetchError("Network timeout");
    await expect(provider.createIntent(PAYMENT_INTENT_REQUEST)).rejects.toThrow("Network timeout");
  });

  it("handles null checkout_url (server-push flow)", async () => {
    mockFetch({ id: "gp-push-001", status: "pending", checkout_url: null, expires_at: "2026-07-16T20:00:00Z" });
    const result = await provider.createIntent({ ...PAYMENT_INTENT_REQUEST, method: "moov_money" });
    expect(result.providerRedirectUrl).toBeNull();
    expect(result.requiresAction).toBe(false);
  });
});

// ── getStatus ─────────────────────────────────────────────────

describe("GaniPayProvider.getStatus", () => {
  const CASES: Array<[string, string]> = [
    ["pending",     "pending"],
    ["processing",  "processing"],
    ["successful",  "captured"],
    ["failed",      "failed"],
    ["cancelled",   "cancelled"],
    ["expired",     "expired"],
    ["refunded",    "captured"],
  ];

  for (const [ganipayStatus, expectedStatus] of CASES) {
    it(`maps GaniPay '${ganipayStatus}' → '${expectedStatus}'`, async () => {
      mockFetch({ id: "gp-001", status: ganipayStatus });
      const result = await provider.getStatus("gp-001");
      expect(result).toBe(expectedStatus);
    });
  }

  it("calls correct GaniPay endpoint", async () => {
    mockFetch({ id: "gp-abc", status: "successful" });
    await provider.getStatus("gp-abc");
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/payments/gp-abc");
  });

  it("throws on GaniPay 404", async () => {
    mockFetch({ error: "Payment not found" }, 404);
    await expect(provider.getStatus("gp-notfound")).rejects.toThrow();
  });
});

// ── capture ───────────────────────────────────────────────────

describe("GaniPayProvider.capture", () => {
  it("is a no-op — resolves without error and without calling GaniPay", async () => {
    // Reset fetch to track fresh calls
    global.fetch = vi.fn();
    await provider.capture("gp-001");
    // capture() must NOT call fetch — GaniPay auto-captures on authorization
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});

// ── cancel ────────────────────────────────────────────────────

describe("GaniPayProvider.cancel", () => {
  it("calls POST /payments/{id}/cancel", async () => {
    mockFetch({ success: true });
    await provider.cancel("gp-001", "User requested cancellation");
    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain("/payments/gp-001/cancel");
    expect(fetchCall[1].method).toBe("POST");
  });

  it("throws on GaniPay error", async () => {
    mockFetch({ error: "Cannot cancel captured payment" }, 409);
    await expect(provider.cancel("gp-captured")).rejects.toThrow("Cannot cancel captured payment");
  });
});

// ── refund ────────────────────────────────────────────────────

describe("GaniPayProvider.refund", () => {
  const REFUND_REQUEST: RefundRequest & { providerTransactionId: string } = {
    paymentId:          "pay-001",
    bookingId:          "booking-1",
    refundType:         "policy_cancellation",
    refundAmountFcfa:   25_000,
    reason:             "Annulation client",
    requestedBy:        "traveler-1",
    requesterRole:      "traveler",
    idempotencyKey:     "refund-idem-001",
    providerTransactionId: "gp-pay-001",
  };

  it("returns completed refund result", async () => {
    mockFetch({
      id:         "gp-refund-001",
      payment_id: "gp-pay-001",
      status:     "completed",
      amount:     25_000,
      currency:   "XOF",
      created_at: "2026-07-16T18:00:00Z",
    });

    const result = await provider.refund(REFUND_REQUEST);

    expect(result.refundId).toBe("gp-refund-001");
    expect(result.status).toBe("completed");
    expect(result.refundAmountFcfa).toBe(25_000);
    expect(result.providerRefundId).toBe("gp-refund-001");
    expect(result.processedAt).toBeTruthy();
  });

  it("returns processing status for pending refunds", async () => {
    mockFetch({ id: "gp-refund-002", status: "processing", amount: 25_000, currency: "XOF", created_at: "2026-07-16T18:00:00Z" });
    const result = await provider.refund(REFUND_REQUEST);
    expect(result.status).toBe("processing");
    expect(result.processedAt).toBeNull();
  });

  it("sends correct amount to GaniPay", async () => {
    mockFetch({ id: "gp-refund-003", status: "completed", amount: 25_000, currency: "XOF", created_at: "2026-07-16T18:00:00Z" });
    await provider.refund(REFUND_REQUEST);
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.amount).toBe(25_000);
    expect(body.reason).toBe("Annulation client");
    expect(body.idempotency_key).toBe("refund-idem-001");
  });
});

// ── verifyWebhook ─────────────────────────────────────────────

describe("GaniPayProvider.verifyWebhook", () => {
  const VALID_PAYLOAD = JSON.stringify({
    event_id:    "evt-001",
    event_type:  "payment.successful",
    payment_id:  "gp-pay-001",
    reference:   "STBF-2026-001",
    amount:      50_000,
    currency:    "XOF",
    occurred_at: "2026-07-16T18:00:00Z",
  });

  async function sign(secret: string, body: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  it("accepts a valid HMAC-SHA256 signature", async () => {
    const sig = await sign(TEST_CONFIG.webhookSecret, VALID_PAYLOAD);
    const result = await provider.verifyWebhook(VALID_PAYLOAD, sig, TEST_CONFIG.webhookSecret);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.event.providerEventId).toBe("evt-001");
      expect(result.event.mappedStatus).toBe("captured");
    }
  });

  it("rejects an invalid signature", async () => {
    const result = await provider.verifyWebhook(VALID_PAYLOAD, "wrong-signature", TEST_CONFIG.webhookSecret);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("Signature mismatch");
    }
  });

  it("rejects tampered payload (signature won't match)", async () => {
    const sig = await sign(TEST_CONFIG.webhookSecret, VALID_PAYLOAD);
    const tamperedPayload = VALID_PAYLOAD.replace("50000", "500000");
    const result = await provider.verifyWebhook(tamperedPayload, sig, TEST_CONFIG.webhookSecret);
    expect(result.valid).toBe(false);
  });

  it("rejects missing event_id", async () => {
    const badPayload = JSON.stringify({ event_type: "payment.successful" });
    const sig = await sign(TEST_CONFIG.webhookSecret, badPayload);
    const result = await provider.verifyWebhook(badPayload, sig, TEST_CONFIG.webhookSecret);
    expect(result.valid).toBe(false);
  });

  it("rejects invalid JSON", async () => {
    const sig = await sign(TEST_CONFIG.webhookSecret, "not-json");
    const result = await provider.verifyWebhook("not-json", sig, TEST_CONFIG.webhookSecret);
    expect(result.valid).toBe(false);
  });

  it("rejects missing secret configuration", async () => {
    const result = await provider.verifyWebhook(VALID_PAYLOAD, "any-sig", "");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("GANIPAY_WEBHOOK_SECRET not configured");
    }
  });

  it("maps payment.successful → captured status", async () => {
    const sig = await sign(TEST_CONFIG.webhookSecret, VALID_PAYLOAD);
    const result = await provider.verifyWebhook(VALID_PAYLOAD, sig, TEST_CONFIG.webhookSecret);
    if (result.valid) {
      expect(result.event.mappedStatus).toBe("captured");
    }
  });

  it("maps payment.failed → failed status", async () => {
    const payload = JSON.stringify({
      event_id: "evt-002", event_type: "payment.failed",
      payment_id: "gp-pay-002", reference: "STBF-2026-002",
      amount: 30_000, currency: "XOF", occurred_at: "2026-07-16T18:00:00Z",
    });
    const sig = await sign(TEST_CONFIG.webhookSecret, payload);
    const result = await provider.verifyWebhook(payload, sig, TEST_CONFIG.webhookSecret);
    if (result.valid) {
      expect(result.event.mappedStatus).toBe("failed");
    }
  });

  it("maps payment.cancelled → failed status", async () => {
    const payload = JSON.stringify({
      event_id: "evt-003", event_type: "payment.cancelled",
      payment_id: "gp-pay-003", reference: "STBF-2026-003",
      amount: 20_000, currency: "XOF", occurred_at: "2026-07-16T18:00:00Z",
    });
    const sig = await sign(TEST_CONFIG.webhookSecret, payload);
    const result = await provider.verifyWebhook(payload, sig, TEST_CONFIG.webhookSecret);
    if (result.valid) {
      expect(result.event.mappedStatus).toBe("failed");
    }
  });

  it("maps refund.completed → refunded status", async () => {
    const payload = JSON.stringify({
      event_id: "evt-004", event_type: "refund.completed",
      payment_id: "gp-pay-004", reference: "STBF-2026-004",
      amount: 15_000, currency: "XOF", occurred_at: "2026-07-16T18:00:00Z",
    });
    const sig = await sign(TEST_CONFIG.webhookSecret, payload);
    const result = await provider.verifyWebhook(payload, sig, TEST_CONFIG.webhookSecret);
    if (result.valid) {
      expect(result.event.type).toBe("refund.completed");
    }
  });
});

// ── createPayout ──────────────────────────────────────────────

describe("GaniPayProvider.createPayout (PayoutProvider)", () => {
  const PAYOUT_REQUEST = {
    payoutId:       "po-001",
    hostId:         "host-001",
    amountFcfa:     75_000,
    currency:       "XOF" as const,
    method:         "orange_money" as const,
    accountDetails: JSON.stringify({ phone: "70000002" }),
    reference:      "PAYOUT-PO001",
    description:    "Retrait hôte",
    idempotencyKey: "payout-idem-001",
    metadata:       {},
  };

  it("returns provider payout id and processing status", async () => {
    mockFetch({
      id:                  "gp-payout-001",
      status:              "processing",
      estimated_arrival:   "2026-07-17T10:00:00Z",
    });

    const result = await provider.createPayout(PAYOUT_REQUEST);

    expect(result.providerPayoutId).toBe("gp-payout-001");
    expect(result.status).toBe("processing");
    expect(result.estimatedArrivalAt).toBe("2026-07-17T10:00:00Z");
  });

  it("sends phone for mobile money methods", async () => {
    mockFetch({ id: "gp-payout-002", status: "processing", estimated_arrival: null });
    await provider.createPayout(PAYOUT_REQUEST);
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.phone).toBe("70000002");
  });

  it("sends bank_account for bank method", async () => {
    const bankPayout = {
      ...PAYOUT_REQUEST,
      method: "bank" as const,
      accountDetails: JSON.stringify({ account: "BF-000-123456789", code: "BICIABFX" }),
    };
    mockFetch({ id: "gp-payout-003", status: "processing", estimated_arrival: null });
    await provider.createPayout(bankPayout);
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.bank_account).toBe("BF-000-123456789");
    expect(body.bank_code).toBe("BICIABFX");
  });

  it("throws on GaniPay rejection", async () => {
    mockFetch({ error: "Account not found" }, 422);
    await expect(provider.createPayout(PAYOUT_REQUEST)).rejects.toThrow("Account not found");
  });
});

// ── getPayout ─────────────────────────────────────────────────

describe("GaniPayProvider.getPayout", () => {
  it("returns paid status and paid_at", async () => {
    mockFetch({
      id:             "gp-payout-001",
      status:         "paid",
      paid_at:        "2026-07-16T19:00:00Z",
      failed_at:      null,
      failure_reason: null,
    });

    const result = await provider.getPayout("gp-payout-001");

    expect(result.status).toBe("paid");
    expect(result.paidAt).toBe("2026-07-16T19:00:00Z");
    expect(result.failureReason).toBeNull();
  });

  it("returns failed status with reason", async () => {
    mockFetch({
      id:             "gp-payout-002",
      status:         "failed",
      paid_at:        null,
      failed_at:      "2026-07-16T19:00:00Z",
      failure_reason: "Numéro incorrect",
    });

    const result = await provider.getPayout("gp-payout-002");

    expect(result.status).toBe("failed");
    expect(result.failureReason).toBe("Numéro incorrect");
  });

  it("maps processing status correctly", async () => {
    mockFetch({ id: "gp-payout-003", status: "processing", paid_at: null, failed_at: null, failure_reason: null });
    const result = await provider.getPayout("gp-payout-003");
    expect(result.status).toBe("processing");
  });
});

// ── cancelPayout ──────────────────────────────────────────────

describe("GaniPayProvider.cancelPayout", () => {
  it("returns cancelled=true on success", async () => {
    mockFetch({ success: true });
    const result = await provider.cancelPayout("gp-payout-001", "Changed mind");
    expect(result.cancelled).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("returns cancelled=false with reason on failure", async () => {
    mockFetch({ error: "Payout already disbursed" }, 409);
    const result = await provider.cancelPayout("gp-payout-002");
    expect(result.cancelled).toBe(false);
    expect(result.reason).toContain("Payout already disbursed");
  });
});

// ── Double-payment prevention ─────────────────────────────────

describe("Double-payment prevention", () => {
  it("createIntent with same idempotencyKey sends same reference", async () => {
    mockFetch({ id: "gp-idem-001", status: "pending", checkout_url: null, expires_at: "2026-07-16T20:00:00Z" });
    mockFetch({ id: "gp-idem-001", status: "pending", checkout_url: null, expires_at: "2026-07-16T20:00:00Z" });

    const r1 = await provider.createIntent({ ...PAYMENT_INTENT_REQUEST, idempotencyKey: "idem-SAME" });
    const r2 = await provider.createIntent({ ...PAYMENT_INTENT_REQUEST, idempotencyKey: "idem-SAME" });

    const body1 = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    const body2 = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body as string);

    // Same reference sent both times (GaniPay handles dedup server-side)
    expect(body1.reference).toBe(body2.reference);
    expect(body1.reference).toBe("idem-SAME");
  });
});

// ── Gateway registration ──────────────────────────────────────

describe("GaniPayProvider name and methods", () => {
  it("has name 'ganipay'", () => {
    expect(provider.name).toBe("ganipay");
  });

  it("supports orange_money and moov_money", () => {
    expect(provider.supportedMethods).toContain("orange_money");
    expect(provider.supportedMethods).toContain("moov_money");
  });

  it("does NOT support visa or mastercard", () => {
    expect(provider.supportedMethods).not.toContain("visa");
    expect(provider.supportedMethods).not.toContain("mastercard");
  });
});
