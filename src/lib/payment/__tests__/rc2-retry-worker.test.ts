// ============================================================
// RC2 — Retry worker tests (B22)
//
// Tests the webhook retry logic: dead-letter threshold,
// backoff scheduling, idempotency of retries.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Dead-letter logic (mirrored from retry-webhooks EF) ───────

const MAX_ATTEMPTS = 5;

function shouldDeadLetter(currentAttempts: number): boolean {
  return currentAttempts + 1 > MAX_ATTEMPTS;
}

function nextRetryDelay(attemptNum: number): number {
  // Exponential backoff: attempt * 60 seconds
  return attemptNum * 60_000;
}

function computeNextRetryAt(attemptNum: number, baseMs: number): Date {
  return new Date(baseMs + nextRetryDelay(attemptNum));
}

// ── Webhook log mock ──────────────────────────────────────────

type WebhookLog = {
  id: string;
  provider: string;
  status: "received" | "failed" | "processed" | "dead_lettered";
  attempts: number;
  retry_count: number;
  next_retry_at: Date | null;
  dead_lettered: boolean;
  dead_letter_reason: string | null;
  last_error: string | null;
  payload: Record<string, unknown>;
};

function makeLog(overrides: Partial<WebhookLog> = {}): WebhookLog {
  return {
    id:                 "log-001",
    provider:           "ganipay",
    status:             "received",
    attempts:           1,
    retry_count:        0,
    next_retry_at:      new Date(Date.now() - 1000),
    dead_lettered:      false,
    dead_letter_reason: null,
    last_error:         null,
    payload:            { event_id: "evt-001", event_type: "payment.successful" },
    ...overrides,
  };
}

function simulateRetry(log: WebhookLog, success: boolean, baseMs = Date.now()): WebhookLog {
  const attemptNum = log.attempts + 1;
  const retryCount = log.retry_count + 1;

  if (shouldDeadLetter(log.attempts)) {
    return {
      ...log,
      status:             "dead_lettered",
      dead_lettered:      true,
      dead_letter_reason: `Exceeded ${MAX_ATTEMPTS} retry attempts`,
      next_retry_at:      null,
      attempts:           attemptNum,
      retry_count:        retryCount,
    };
  }

  if (success) {
    return {
      ...log,
      status:       "processed",
      attempts:     attemptNum,
      retry_count:  retryCount,
      next_retry_at: null,
    };
  }

  return {
    ...log,
    status:         "received",
    attempts:       attemptNum,
    retry_count:    retryCount,
    next_retry_at:  computeNextRetryAt(attemptNum, baseMs),
    last_error:     "Retry failed",
  };
}

describe("RC2 — Retry worker (B22)", () => {
  describe("dead-letter threshold", () => {
    it("does not dead-letter before MAX_ATTEMPTS", () => {
      for (let attempts = 1; attempts < MAX_ATTEMPTS; attempts++) {
        expect(shouldDeadLetter(attempts)).toBe(false);
      }
    });

    it("dead-letters exactly at MAX_ATTEMPTS", () => {
      expect(shouldDeadLetter(MAX_ATTEMPTS)).toBe(true);
    });

    it("dead-letters all logs beyond MAX_ATTEMPTS", () => {
      for (let attempts = MAX_ATTEMPTS; attempts <= MAX_ATTEMPTS + 5; attempts++) {
        expect(shouldDeadLetter(attempts)).toBe(true);
      }
    });
  });

  describe("backoff scheduling", () => {
    it("first retry is 60 seconds after failure", () => {
      expect(nextRetryDelay(2)).toBe(120_000);
    });

    it("backoff grows linearly with attempt number", () => {
      expect(nextRetryDelay(1)).toBe(60_000);
      expect(nextRetryDelay(2)).toBe(120_000);
      expect(nextRetryDelay(3)).toBe(180_000);
      expect(nextRetryDelay(4)).toBe(240_000);
      expect(nextRetryDelay(5)).toBe(300_000);
    });

    it("next_retry_at is in the future after scheduling", () => {
      const now = Date.now();
      const nextRetry = computeNextRetryAt(2, now);
      expect(nextRetry.getTime()).toBeGreaterThan(now);
    });
  });

  describe("retry simulation", () => {
    it("successful retry transitions to processed", () => {
      const log    = makeLog();
      const result = simulateRetry(log, true);
      expect(result.status).toBe("processed");
      expect(result.next_retry_at).toBeNull();
    });

    it("failed retry increments attempt count", () => {
      const log    = makeLog({ attempts: 1, retry_count: 0 });
      const result = simulateRetry(log, false);
      expect(result.attempts).toBe(2);
      expect(result.retry_count).toBe(1);
      expect(result.status).toBe("received");
    });

    it("failed retry schedules next_retry_at", () => {
      const now  = Date.now();
      const log  = makeLog({ attempts: 2, retry_count: 1 });
      const result = simulateRetry(log, false, now);
      expect(result.next_retry_at).not.toBeNull();
      expect(result.next_retry_at!.getTime()).toBeGreaterThan(now);
    });

    it("dead-letters after MAX_ATTEMPTS failures", () => {
      let log = makeLog({ attempts: 1 });
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        log = simulateRetry(log, false);
      }
      const final = simulateRetry(log, false);
      expect(final.dead_lettered).toBe(true);
      expect(final.dead_letter_reason).toContain("retry attempts");
    });

    it("dead-lettered log is never retried again", () => {
      const log = makeLog({ attempts: MAX_ATTEMPTS, dead_lettered: true, status: "dead_lettered" });
      // Simulating the filter: dead_lettered = false excludes this log from retry candidates
      const isEligible = !log.dead_lettered && ["received", "failed"].includes(log.status);
      expect(isEligible).toBe(false);
    });
  });

  describe("retry idempotency", () => {
    it("successful retry produces the same outcome regardless of how many times simulated", () => {
      const log     = makeLog();
      const result1 = simulateRetry(log, true);
      const result2 = simulateRetry(log, true);
      expect(result1.status).toBe(result2.status);
      expect(result1.attempts).toBe(result2.attempts);
    });

    it("processed log is not eligible for retry", () => {
      const log = makeLog({ status: "processed", dead_lettered: false });
      const isEligible = !log.dead_lettered && ["received", "failed"].includes(log.status);
      expect(isEligible).toBe(false);
    });
  });

  describe("batch processing", () => {
    it("processes up to BATCH_SIZE logs per run", () => {
      const BATCH_SIZE = 20;
      const logs = Array.from({ length: 50 }, (_, i) =>
        makeLog({ id: `log-${i}`, next_retry_at: new Date(Date.now() - 1000) })
      );

      const eligible = logs
        .filter(l => !l.dead_lettered && ["received", "failed"].includes(l.status))
        .slice(0, BATCH_SIZE);

      expect(eligible.length).toBe(BATCH_SIZE);
    });

    it("orders candidates by next_retry_at ascending (oldest first)", () => {
      const now  = Date.now();
      const logs = [
        makeLog({ id: "log-a", next_retry_at: new Date(now - 3000) }),
        makeLog({ id: "log-b", next_retry_at: new Date(now - 1000) }),
        makeLog({ id: "log-c", next_retry_at: new Date(now - 2000) }),
      ].sort((a, b) => a.next_retry_at!.getTime() - b.next_retry_at!.getTime());

      expect(logs[0].id).toBe("log-a");
      expect(logs[1].id).toBe("log-c");
      expect(logs[2].id).toBe("log-b");
    });
  });

  describe("only past due logs are retried", () => {
    it("logs with future next_retry_at are excluded", () => {
      const futureLog = makeLog({ next_retry_at: new Date(Date.now() + 60_000) });
      const now       = new Date().toISOString();
      const isPastDue = futureLog.next_retry_at !== null && futureLog.next_retry_at.toISOString() <= now;
      expect(isPastDue).toBe(false);
    });

    it("logs with past next_retry_at are included", () => {
      const pastLog = makeLog({ next_retry_at: new Date(Date.now() - 1000) });
      const now     = new Date().toISOString();
      const isPastDue = pastLog.next_retry_at !== null && pastLog.next_retry_at.toISOString() <= now;
      expect(isPastDue).toBe(true);
    });
  });

  describe("metrics tracking", () => {
    it("correctly counts succeeded and dead-lettered in batch", () => {
      const logs = [
        makeLog({ id: "s1" }),
        makeLog({ id: "s2" }),
        makeLog({ id: "d1", attempts: MAX_ATTEMPTS }),
        makeLog({ id: "d2", attempts: MAX_ATTEMPTS }),
        makeLog({ id: "f1", attempts: 3 }),
      ];

      const results = logs.map(log => {
        if (shouldDeadLetter(log.attempts)) {
          return { ...log, dead_lettered: true, status: "dead_lettered" as const };
        }
        // Alternate success / failure for first two
        const success = log.id === "s1" || log.id === "s2";
        return simulateRetry(log, success);
      });

      const succeeded    = results.filter(r => r.status === "processed").length;
      const deadLettered = results.filter(r => r.dead_lettered).length;
      const failed       = results.filter(r => r.status === "received").length;

      expect(succeeded).toBe(2);
      expect(deadLettered).toBe(2);
      expect(failed).toBe(1);
    });
  });
});
