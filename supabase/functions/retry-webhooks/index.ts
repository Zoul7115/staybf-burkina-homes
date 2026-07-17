// ============================================================
// retry-webhooks — Webhook retry worker (B22)
//
// Queries payment_webhook_logs for entries that:
//   - Have status IN ('received', 'failed')
//   - Have next_retry_at <= now()
//   - Have dead_lettered = false
//
// For each eligible log, re-sends the original payload to the
// payment-webhook Edge Function (GaniPay webhooks only, for now).
//
// Dead-letter limit: MAX_RETRY_ATTEMPTS (5). After that, sets
// dead_lettered = true so the row won't be retried again.
//
// Designed to be called by pg_cron every 5 minutes:
//   SELECT cron.schedule('retry-webhooks', '*/5 * * * *',
//     $$SELECT net.http_post(url := 'https://...supabase.co/functions/v1/retry-webhooks',
//       headers := '{"Authorization": "Bearer <SERVICE_KEY>"}'::jsonb)$$);
//
// Metrics emitted via structured log:
//   - retried_count: number of webhooks retried this run
//   - success_count: number that succeeded
//   - dead_lettered_count: number moved to dead-letter queue
//   - latency_ms: total run duration
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";
import { createLogger, generateRequestId } from "../_shared/logger.ts";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_ATTEMPTS    = 5;
const BATCH_SIZE      = 20;
const REQUEST_TIMEOUT = 30_000;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = generateRequestId();
  const log = createLogger("retry-webhooks", requestId);
  const startMs = Date.now();

  // Require service-role authorization (called by pg_cron or admin only)
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ") || authHeader.slice(7) !== SERVICE_KEY) {
    log.warn("unauthorized retry-webhooks call");
    return err("Unauthorized", 401);
  }

  try {
    const db = makeServiceClient();
    const now = new Date().toISOString();

    // ── Fetch eligible retry candidates ────────────────────────
    const { data: candidates, error: fetchErr } = await db
      .from("payment_webhook_logs")
      .select("id, provider, payload, provider_event_id, attempts, retry_count")
      .in("status", ["received", "failed"])
      .lte("next_retry_at", now)
      .eq("dead_lettered", false)
      .order("next_retry_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) {
      log.error("failed to fetch retry candidates", fetchErr);
      return err(fetchErr.message, 500);
    }

    const rows = candidates ?? [];
    log.info("retry candidates fetched", { count: rows.length });

    if (rows.length === 0) {
      log.end("ok", { retried_count: 0, latency_ms: Date.now() - startMs });
      return ok({ retried: 0, dead_lettered: 0, latency_ms: Date.now() - startMs });
    }

    // ── Process each candidate ─────────────────────────────────
    let retriedCount      = 0;
    let successCount      = 0;
    let deadLetteredCount = 0;

    for (const row of rows as {
      id: string;
      provider: string;
      payload: Record<string, unknown>;
      provider_event_id: string | null;
      attempts: number;
      retry_count: number;
    }[]) {
      const rowLog      = log.child({ webhook_log_id: row.id, provider: row.provider });
      const attemptNum  = (row.attempts ?? 1) + 1;
      const retryCount  = (row.retry_count ?? 0) + 1;
      const isDeadLetter = attemptNum > MAX_ATTEMPTS;

      if (isDeadLetter) {
        await db.from("payment_webhook_logs").update({
          status:             "failed",
          dead_lettered:      true,
          dead_letter_at:     now,
          dead_letter_reason: `Exceeded ${MAX_ATTEMPTS} retry attempts`,
          next_retry_at:      null,
          attempts:           attemptNum,
          retry_count:        retryCount,
        }).eq("id", row.id);

        rowLog.warn("webhook dead-lettered", { attempts: attemptNum });
        deadLetteredCount++;
        continue;
      }

      retriedCount++;

      // Re-send to the payment-webhook EF (provider-specific endpoint)
      // We reconstruct the request as if it came from GaniPay directly.
      // The HMAC verification will be skipped because we call with a special
      // internal bypass header — the signature was already verified on first receipt.
      let statusCode = 0;
      try {
        const targetUrl = `${SUPABASE_URL}/functions/v1/payment-webhook`;
        const payloadStr = JSON.stringify(row.payload);

        const retryRes = await fetch(targetUrl, {
          method:  "POST",
          signal:  AbortSignal.timeout(REQUEST_TIMEOUT),
          headers: {
            "Content-Type":            "application/json",
            "Authorization":           `Bearer ${SERVICE_KEY}`,
            // Internal retry marker — tells the EF to skip HMAC re-verification
            "X-StayBF-Internal-Retry": row.id,
            // Replay the original signature so the EF can verify if desired
            "x-ganipay-signature":     "retry-internal",
          },
          body: payloadStr,
        });

        statusCode = retryRes.status;

        if (retryRes.ok) {
          successCount++;
          rowLog.info("retry succeeded", { attempt: attemptNum, status: statusCode });
          // Mark as processed (the EF will also update its own log row)
          await db.from("payment_webhook_logs").update({
            status:       "processed",
            attempts:     attemptNum,
            retry_count:  retryCount,
            next_retry_at: null,
          }).eq("id", row.id);

        } else {
          const body = await retryRes.text().catch(() => "");
          rowLog.warn("retry failed with non-2xx", { attempt: attemptNum, status: statusCode, body: body.slice(0, 200) });
          throw new Error(`HTTP ${statusCode}: ${body.slice(0, 100)}`);
        }

      } catch (e) {
        // Schedule next retry with exponential backoff: attempt * 60 seconds
        const nextRetryMs  = Date.now() + attemptNum * 60_000;
        const nextRetryAt  = new Date(nextRetryMs).toISOString();
        const lastError    = (e as Error).message;

        await db.from("payment_webhook_logs").update({
          status:         "received",
          attempts:       attemptNum,
          retry_count:    retryCount,
          next_retry_at:  nextRetryAt,
          last_error:     lastError,
        }).eq("id", row.id);

        rowLog.warn("retry failed — scheduled next attempt", {
          attempt:        attemptNum,
          next_retry_at:  nextRetryAt,
          error:          lastError,
        });
      }
    }

    const latencyMs = Date.now() - startMs;
    log.end("ok", {
      retried_count:       retriedCount,
      success_count:       successCount,
      dead_lettered_count: deadLetteredCount,
      latency_ms:          latencyMs,
    });

    return ok({
      retried:       retriedCount,
      succeeded:     successCount,
      dead_lettered: deadLetteredCount,
      latency_ms:    latencyMs,
    });

  } catch (e) {
    log.error("unhandled error", e);
    return err((e as Error).message, 500);
  }
});
