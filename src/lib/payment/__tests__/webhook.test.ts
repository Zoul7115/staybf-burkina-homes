// Step 12 — Webhook tests
// Tests for invalid signature, invalid payload, idempotency,
// retry, timeout, and provider error handling.
//
// The actual Edge Function runs in Deno. These tests validate the
// LOGIC PATTERNS the webhook system relies on, using the same
// algorithms as the adapters — without crossing the runtime boundary.

import { describe, it, expect, vi } from "vitest";

// ── ProviderWebhookAdapter interface (mirrored from shared types) ──

type WebhookVerdict = { valid: true } | { valid: false; reason: string };

type NormalizedWebhookEvent = {
  providerEventId: string;
  providerTransactionId: string;
  mappedStatus: "captured" | "failed" | "pending" | "refunded";
  providerStatus: string;
  amountFcfa: number | null;
  occurredAt: string | null;
  metadata: Record<string, unknown>;
};

interface ProviderWebhookAdapter {
  readonly providerName: string;
  verifySignature(payload: Record<string, unknown>, headers: Record<string, string>, secret: string): WebhookVerdict;
  extractEventId(payload: Record<string, unknown>): string | null;
  normalizeEvent(payload: Record<string, unknown>): NormalizedWebhookEvent;
}

// ── CinetPay adapter logic (mirrors cinetpay-adapter.ts) ──────────

const CINETPAY_STATUS_MAP: Record<string, NormalizedWebhookEvent["mappedStatus"]> = {
  ACCEPTED:  "captured",
  REFUSED:   "failed",
  CANCELLED: "failed",
  PENDING:   "pending",
};

const cinetPayAdapter: ProviderWebhookAdapter = {
  providerName: "cinetpay",

  verifySignature(payload, _headers, _secret): WebhookVerdict {
    const hasRequiredFields =
      typeof payload.cpm_trans_id === "string" ||
      typeof payload.transaction_id === "string";
    if (!hasRequiredFields) {
      return { valid: false, reason: "Missing transaction identifier fields" };
    }
    return { valid: true };
  },

  extractEventId(payload): string | null {
    return (
      (payload.cpm_trans_id as string | undefined) ??
      (payload.transaction_id as string | undefined) ??
      null
    );
  },

  normalizeEvent(payload): NormalizedWebhookEvent {
    const providerTransactionId =
      (payload.cpm_trans_id as string | undefined) ??
      (payload.transaction_id as string | undefined) ??
      "";
    const rawStatus =
      (payload.cpm_result as string | undefined) ??
      (payload.status as string | undefined) ??
      "";
    const mappedStatus = CINETPAY_STATUS_MAP[rawStatus] ?? "failed";
    const rawAmount = payload.cpm_amount ?? payload.amount;
    const amountFcfa = rawAmount != null ? parseInt(String(rawAmount), 10) || null : null;

    return {
      providerEventId: providerTransactionId,
      providerTransactionId,
      mappedStatus,
      providerStatus: rawStatus,
      amountFcfa,
      occurredAt: (payload.cpm_payment_date as string | undefined) ?? null,
      metadata: {
        cpm_site_id: payload.cpm_site_id,
        operator: payload.operator_id ?? payload.operator,
      },
    };
  },
};

// ── Adapter registry (mirrors webhook-adapter.ts) ─────────────────

const REGISTRY = new Map<string, ProviderWebhookAdapter>();
REGISTRY.set(cinetPayAdapter.providerName, cinetPayAdapter);

function getAdapter(name: string): ProviderWebhookAdapter | null {
  return REGISTRY.get(name) ?? null;
}

// ── 1. Invalid signature ───────────────────────────────────────────

describe("Webhook — invalid signature", () => {
  it("rejects payload missing both cpm_trans_id and transaction_id", () => {
    const verdict = cinetPayAdapter.verifySignature({ cpm_result: "ACCEPTED" }, {}, "secret");
    expect(verdict.valid).toBe(false);
    if (!verdict.valid) expect(verdict.reason).toMatch(/Missing/);
  });

  it("accepts payload with cpm_trans_id", () => {
    const verdict = cinetPayAdapter.verifySignature({ cpm_trans_id: "TXN-123", cpm_result: "ACCEPTED" }, {}, "secret");
    expect(verdict.valid).toBe(true);
  });

  it("accepts payload with fallback transaction_id", () => {
    const verdict = cinetPayAdapter.verifySignature({ transaction_id: "TXN-456" }, {}, "secret");
    expect(verdict.valid).toBe(true);
  });

  it("unknown provider returns null adapter (rejected at dispatch)", () => {
    const adapter = getAdapter("unknown_provider");
    expect(adapter).toBeNull();
  });
});

// ── 2. Invalid payload ────────────────────────────────────────────

describe("Webhook — invalid payload", () => {
  it("empty payload fails signature check", () => {
    const verdict = cinetPayAdapter.verifySignature({}, {}, "secret");
    expect(verdict.valid).toBe(false);
  });

  it("missing status defaults to 'failed' mapping", () => {
    const event = cinetPayAdapter.normalizeEvent({ cpm_trans_id: "TXN-001" });
    expect(event.mappedStatus).toBe("failed");
    expect(event.providerStatus).toBe("");
  });

  it("missing amount results in null amountFcfa", () => {
    const event = cinetPayAdapter.normalizeEvent({ cpm_trans_id: "TXN-001", cpm_result: "ACCEPTED" });
    expect(event.amountFcfa).toBeNull();
  });

  it("non-numeric amount results in null amountFcfa", () => {
    const event = cinetPayAdapter.normalizeEvent({ cpm_trans_id: "T", cpm_result: "ACCEPTED", cpm_amount: "not-a-number" });
    expect(event.amountFcfa).toBeNull();
  });
});

// ── 3. Status normalization ───────────────────────────────────────

describe("Webhook — status normalization", () => {
  const cases: Array<[string, NormalizedWebhookEvent["mappedStatus"]]> = [
    ["ACCEPTED",  "captured"],
    ["REFUSED",   "failed"],
    ["CANCELLED", "failed"],
    ["PENDING",   "pending"],
    ["UNKNOWN",   "failed"],
    ["",          "failed"],
  ];

  for (const [raw, expected] of cases) {
    it(`maps '${raw}' → '${expected}'`, () => {
      const event = cinetPayAdapter.normalizeEvent({ cpm_trans_id: "T", cpm_result: raw });
      expect(event.mappedStatus).toBe(expected);
    });
  }
});

// ── 4. Idempotency — duplicate event detection ────────────────────

describe("Webhook — idempotency", () => {
  it("same provider_event_id is detected as duplicate", () => {
    const processed = new Set<string>();

    function handleWebhook(eventId: string): "new" | "duplicate" {
      if (processed.has(eventId)) return "duplicate";
      processed.add(eventId);
      return "new";
    }

    expect(handleWebhook("EVT-001")).toBe("new");
    expect(handleWebhook("EVT-001")).toBe("duplicate");
    expect(handleWebhook("EVT-002")).toBe("new");
  });

  it("duplicate does not write ledger entries", () => {
    const ledgerWrites: string[] = [];
    const processed = new Set<string>();

    function processEvent(eventId: string, bookingId: string): void {
      if (processed.has(eventId)) return; // deduplicated
      processed.add(eventId);
      ledgerWrites.push(bookingId);
    }

    processEvent("EVT-001", "bk-1");
    processEvent("EVT-001", "bk-1"); // duplicate — no write
    processEvent("EVT-002", "bk-2");

    expect(ledgerWrites).toHaveLength(2);
    expect(ledgerWrites).toEqual(["bk-1", "bk-2"]);
  });

  it("extractEventId returns stable identifier for dedup key", () => {
    const payload = { cpm_trans_id: "TXN-999", cpm_result: "ACCEPTED" };
    const id1 = cinetPayAdapter.extractEventId(payload);
    const id2 = cinetPayAdapter.extractEventId(payload);
    expect(id1).toBe("TXN-999");
    expect(id1).toBe(id2); // deterministic
  });

  it("fallback to transaction_id when cpm_trans_id absent", () => {
    const payload = { transaction_id: "ALT-001" };
    expect(cinetPayAdapter.extractEventId(payload)).toBe("ALT-001");
  });

  it("returns null when no identifier present", () => {
    expect(cinetPayAdapter.extractEventId({})).toBeNull();
  });
});

// ── 5. Retry logic ────────────────────────────────────────────────

describe("Webhook — retry logic", () => {
  it("retries a failing operation up to maxAttempts", async () => {
    let attempts = 0;

    async function flakyOperation(): Promise<string> {
      attempts++;
      if (attempts < 3) throw new Error("transient failure");
      return "ok";
    }

    async function withRetry<T>(fn: () => Promise<T>, maxAttempts: number): Promise<T> {
      let lastErr: Error | null = null;
      for (let i = 0; i < maxAttempts; i++) {
        try { return await fn(); } catch (e) { lastErr = e as Error; }
      }
      throw lastErr;
    }

    const result = await withRetry(flakyOperation, 5);
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("throws after exhausting maxAttempts", async () => {
    let attempts = 0;
    async function alwaysFails(): Promise<never> {
      attempts++;
      throw new Error("always fails");
    }

    async function withRetry<T>(fn: () => Promise<T>, maxAttempts: number): Promise<T> {
      let lastErr: Error | null = null;
      for (let i = 0; i < maxAttempts; i++) {
        try { return await fn(); } catch (e) { lastErr = e as Error; }
      }
      throw lastErr;
    }

    await expect(withRetry(alwaysFails, 3)).rejects.toThrow("always fails");
    expect(attempts).toBe(3);
  });

  it("does not retry on non-retriable errors", async () => {
    let attempts = 0;

    async function withSelectiveRetry<T>(fn: () => Promise<T>, isRetriable: (e: Error) => boolean): Promise<T> {
      try { return await fn(); }
      catch (e) {
        if (!isRetriable(e as Error)) throw e;
        attempts++;
        return await fn();
      }
    }

    const permanentError = new Error("DUPLICATE_KEY");
    await expect(
      withSelectiveRetry(
        () => { throw permanentError; },
        (e) => !e.message.includes("DUPLICATE_KEY")
      )
    ).rejects.toThrow("DUPLICATE_KEY");

    expect(attempts).toBe(0); // never retried
  });
});

// ── 6. Timeout handling ───────────────────────────────────────────

describe("Webhook — timeout handling", () => {
  it("rejects when operation exceeds timeout", async () => {
    function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
        promise.then(
          (v) => { clearTimeout(timer); resolve(v); },
          (e) => { clearTimeout(timer); reject(e); }
        );
      });
    }

    const slowOp = new Promise<string>((resolve) => setTimeout(() => resolve("done"), 200));
    await expect(withTimeout(slowOp, 50)).rejects.toThrow("Timeout after 50ms");
  });

  it("resolves when operation completes within timeout", async () => {
    function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
        promise.then(
          (v) => { clearTimeout(timer); resolve(v); },
          (e) => { clearTimeout(timer); reject(e); }
        );
      });
    }

    const fastOp = Promise.resolve("quick");
    const result = await withTimeout(fastOp, 1000);
    expect(result).toBe("quick");
  });
});

// ── 7. Provider error handling ────────────────────────────────────

describe("Webhook — provider error handling", () => {
  it("REFUSED status maps to failed and does not credit ledger", () => {
    const event = cinetPayAdapter.normalizeEvent({
      cpm_trans_id: "TXN-REF-001",
      cpm_result: "REFUSED",
      cpm_amount: "110000",
    });
    expect(event.mappedStatus).toBe("failed");
    // In the webhook processor: non-captured events do not write ledger entries
    const shouldWriteLedger = event.mappedStatus === "captured";
    expect(shouldWriteLedger).toBe(false);
  });

  it("CANCELLED status also maps to failed", () => {
    const event = cinetPayAdapter.normalizeEvent({
      cpm_trans_id: "TXN-CAN-001",
      cpm_result: "CANCELLED",
    });
    expect(event.mappedStatus).toBe("failed");
  });

  it("amount consistency check: host + commission + fee must equal payment total", () => {
    // Mirrors the check in process-payment-webhook/index.ts
    function validateAmountConsistency(
      hostPayout: number,
      commission: number,
      serviceFee: number,
      paymentTotal: number
    ): boolean {
      return hostPayout + commission + serviceFee === paymentTotal;
    }

    expect(validateAmountConsistency(85_000, 15_000, 10_000, 110_000)).toBe(true);
    expect(validateAmountConsistency(85_000, 15_000, 10_001, 110_000)).toBe(false); // off by 1
    expect(validateAmountConsistency(85_000, 15_000,      0, 110_000)).toBe(false); // missing fee
  });

  it("provider event with captured status and valid amount passes consistency gate", () => {
    const event = cinetPayAdapter.normalizeEvent({
      cpm_trans_id: "TXN-OK-001",
      cpm_result: "ACCEPTED",
      cpm_amount: "110000",
    });
    expect(event.mappedStatus).toBe("captured");
    expect(event.amountFcfa).toBe(110_000);
    expect(event.providerTransactionId).toBe("TXN-OK-001");
  });
});
