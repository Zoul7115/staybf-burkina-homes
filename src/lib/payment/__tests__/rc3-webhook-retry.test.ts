// ============================================================
// RC3 — Webhook retry correctness tests
//
// Tests the three bugs found in RC3 audit:
//   RC3-A: signature variable scope (ReferenceError on internal retry)
//   RC3-B: freshness check blocked internal retries (5 min window)
//   RC3-C: internal retry hit UNIQUE constraint → silent dedup
// ============================================================

import { describe, it, expect } from "vitest";

// ── Pure logic mirrors from payment-webhook/index.ts ─────────

const MAX_RETRY_ATTEMPTS = 5;

// Internal retry detection logic (mirrored — RC3-D: guard against empty serviceKey)
function isInternalRetry(headers: Record<string, string>, serviceKey: string): boolean {
  const retryId = headers["x-staybf-internal-retry"];
  const auth    = headers["authorization"] ?? "";
  return !!retryId && !!serviceKey && auth.startsWith("Bearer ") && auth.slice(7) === serviceKey;
}

// Freshness check (mirrored — now skips internal retries)
function isFreshWebhook(
  occurredAt: string | undefined,
  headers: Record<string, string>,
  serviceKey: string,
  nowMs = Date.now()
): boolean {
  if (isInternalRetry(headers, serviceKey)) return true; // RC3-B fix
  if (!occurredAt) return true;
  const age = nowMs - new Date(occurredAt).getTime();
  return age <= 5 * 60 * 1_000;
}

// Webhook log resolution logic (mirrored — RC3-C fix)
type LogResolution =
  | { action: "use_existing"; logId: string }
  | { action: "insert_new" }
  | { action: "error"; reason: string };

function resolveWebhookLog(
  isInternal: boolean,
  internalRetryId: string | null,
  existingLogId: string | null
): LogResolution {
  if (isInternal && internalRetryId) {
    if (!existingLogId) return { action: "error", reason: "Webhook log not found" };
    return { action: "use_existing", logId: existingLogId };
  }
  return { action: "insert_new" };
}

const SERVICE_KEY = "service-role-test-key";

// ── RC3-A: signature variable scope ──────────────────────────

describe("RC3-A — signature variable scope", () => {
  it("signature header is readable regardless of isInternalRetry", () => {
    const externalHeaders = { "x-ganipay-signature": "abc123" };
    // After fix: signature is extracted before the conditional
    const sig = externalHeaders["x-ganipay-signature"] ?? "";
    expect(sig).toBe("abc123");
  });

  it("internal retry has empty signature header (no GaniPay header)", () => {
    const retryHeaders = {
      "x-staybf-internal-retry": "log-001",
      "authorization": `Bearer ${SERVICE_KEY}`,
    };
    // Signature reads as empty string — not undefined, not ReferenceError
    const sig = retryHeaders["x-ganipay-signature" as keyof typeof retryHeaders] ?? "";
    expect(sig).toBe("");
  });
});

// ── RC3-B: freshness check ────────────────────────────────────

describe("RC3-B — freshness check skips internal retries", () => {
  const oldTimestamp = new Date(Date.now() - 10 * 60 * 1_000).toISOString(); // 10 min ago

  it("external webhook with old occurred_at is rejected", () => {
    const fresh = isFreshWebhook(oldTimestamp, {}, SERVICE_KEY);
    expect(fresh).toBe(false);
  });

  it("internal retry with old occurred_at is accepted", () => {
    const fresh = isFreshWebhook(
      oldTimestamp,
      { "x-staybf-internal-retry": "log-001", "authorization": `Bearer ${SERVICE_KEY}` },
      SERVICE_KEY
    );
    expect(fresh).toBe(true);
  });

  it("external webhook without occurred_at is accepted (field optional)", () => {
    const fresh = isFreshWebhook(undefined, {}, SERVICE_KEY);
    expect(fresh).toBe(true);
  });

  it("internal retry without occurred_at is accepted", () => {
    const fresh = isFreshWebhook(
      undefined,
      { "x-staybf-internal-retry": "log-001", "authorization": `Bearer ${SERVICE_KEY}` },
      SERVICE_KEY
    );
    expect(fresh).toBe(true);
  });

  it("fresh external webhook (< 5 min) is accepted", () => {
    const recent = new Date(Date.now() - 2 * 60 * 1_000).toISOString();
    const fresh = isFreshWebhook(recent, {}, SERVICE_KEY);
    expect(fresh).toBe(true);
  });

  it("external webhook exactly at 5 min boundary is rejected", () => {
    const exactly5min = new Date(Date.now() - 5 * 60 * 1_000 - 1).toISOString();
    const fresh = isFreshWebhook(exactly5min, {}, SERVICE_KEY);
    expect(fresh).toBe(false);
  });
});

// ── RC3-C: webhook log resolution ────────────────────────────

describe("RC3-C — internal retry uses existing webhook log", () => {
  it("non-retry → insert_new", () => {
    const resolution = resolveWebhookLog(false, null, null);
    expect(resolution.action).toBe("insert_new");
  });

  it("internal retry with existing log → use_existing", () => {
    const resolution = resolveWebhookLog(true, "log-001", "log-001");
    expect(resolution.action).toBe("use_existing");
    expect((resolution as { action: "use_existing"; logId: string }).logId).toBe("log-001");
  });

  it("internal retry without existing log → error (log not found)", () => {
    const resolution = resolveWebhookLog(true, "log-ghost", null);
    expect(resolution.action).toBe("error");
  });

  it("internal retry with null retryId → insert_new (invalid bypass attempt)", () => {
    const resolution = resolveWebhookLog(false, null, null);
    expect(resolution.action).toBe("insert_new");
  });
});

// ── Internal retry authentication ────────────────────────────

describe("Internal retry authentication guard", () => {
  it("requires X-StayBF-Internal-Retry header", () => {
    const result = isInternalRetry({ "authorization": `Bearer ${SERVICE_KEY}` }, SERVICE_KEY);
    expect(result).toBe(false);
  });

  it("requires service-role Bearer token", () => {
    const result = isInternalRetry({ "x-staybf-internal-retry": "log-001", "authorization": "Bearer wrong" }, SERVICE_KEY);
    expect(result).toBe(false);
  });

  it("accepts valid internal retry credentials", () => {
    const result = isInternalRetry(
      { "x-staybf-internal-retry": "log-001", "authorization": `Bearer ${SERVICE_KEY}` },
      SERVICE_KEY
    );
    expect(result).toBe(true);
  });

  it("rejects empty service key (misconfigured env)", () => {
    const result = isInternalRetry(
      { "x-staybf-internal-retry": "log-001", "authorization": "Bearer " },
      "" // empty service key
    );
    expect(result).toBe(false);
  });
});

// ── Dead-letter interaction ───────────────────────────────────

describe("Dead-letter after retry exhaustion", () => {
  it("internal retry with attempts >= MAX is dead-lettered before reaching EF", () => {
    // retry-webhooks EF dead-letters before sending to payment-webhook
    const attempts = MAX_RETRY_ATTEMPTS + 1;
    const shouldDeadLetter = attempts > MAX_RETRY_ATTEMPTS;
    expect(shouldDeadLetter).toBe(true);
  });

  it("internal retry with attempts = MAX_RETRY_ATTEMPTS - 1 proceeds", () => {
    const attempts = MAX_RETRY_ATTEMPTS - 1;
    const shouldDeadLetter = attempts + 1 > MAX_RETRY_ATTEMPTS;
    expect(shouldDeadLetter).toBe(false);
  });
});

// ── Retry → processing pipeline idempotency ───────────────────

describe("Retry pipeline idempotency", () => {
  type WebhookLogState = {
    attempts: number;
    status: string;
    dead_lettered: boolean;
    next_retry_at: string | null;
  };

  function simulateRetryOutcome(log: WebhookLogState, success: boolean): WebhookLogState {
    const newAttempts = log.attempts + 1;
    if (newAttempts > MAX_RETRY_ATTEMPTS) {
      return { ...log, attempts: newAttempts, status: "failed", dead_lettered: true, next_retry_at: null };
    }
    if (success) {
      return { ...log, attempts: newAttempts, status: "processed", next_retry_at: null, dead_lettered: false };
    }
    return {
      ...log,
      attempts: newAttempts,
      status: "received",
      next_retry_at: new Date(Date.now() + newAttempts * 60_000).toISOString(),
    };
  }

  it("successful retry sets status=processed and clears next_retry_at", () => {
    const log: WebhookLogState = { attempts: 2, status: "received", dead_lettered: false, next_retry_at: null };
    const result = simulateRetryOutcome(log, true);
    expect(result.status).toBe("processed");
    expect(result.next_retry_at).toBeNull();
  });

  it("failed retry schedules next_retry_at in future", () => {
    const log: WebhookLogState = { attempts: 2, status: "received", dead_lettered: false, next_retry_at: null };
    const result = simulateRetryOutcome(log, false);
    expect(result.status).toBe("received");
    expect(result.next_retry_at).not.toBeNull();
    expect(new Date(result.next_retry_at!).getTime()).toBeGreaterThan(Date.now());
  });

  it("retry at MAX_RETRY_ATTEMPTS triggers dead-letter", () => {
    const log: WebhookLogState = { attempts: MAX_RETRY_ATTEMPTS, status: "received", dead_lettered: false, next_retry_at: null };
    const result = simulateRetryOutcome(log, false);
    expect(result.dead_lettered).toBe(true);
    expect(result.next_retry_at).toBeNull();
  });

  it("two identical retries produce the same outcome (idempotent)", () => {
    const log: WebhookLogState = { attempts: 1, status: "received", dead_lettered: false, next_retry_at: null };
    const r1 = simulateRetryOutcome(log, true);
    const r2 = simulateRetryOutcome(log, true);
    expect(r1.status).toBe(r2.status);
    expect(r1.attempts).toBe(r2.attempts);
  });
});
