// ============================================================
// payment-webhook — GaniPay payment webhook processor
//
// Dedicated endpoint for GaniPay webhooks. Uses the existing
// process-payment-webhook pipeline via the GaniPay adapter,
// adding HMAC-SHA256 signature verification before delegation.
//
// Pipeline:
//   1. Read raw body
//   2. Verify HMAC-SHA256 signature (X-GaniPay-Signature header)
//   3. Log raw webhook (idempotency guard on provider_event_id)
//   4. Parse & normalize event via GaniPay adapter
//   5. Find payment by provider_transaction_id
//   6. Deduplicate via payment_events table
//   7. If captured: confirm booking + write ledger + notify
//   8. If failed:   mark payment failed + notify
//   9. If refunded: update refund record
//  10. Mark webhook processed
//
// Dead-letter: after MAX_RETRY_ATTEMPTS, mark as dead_lettered.
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";
import { validateLedgerEntries } from "../_shared/validate-ledger.ts";
import { createLogger, generateRequestId } from "../_shared/logger.ts";

// Import GaniPay adapter (self-registers)
import "../_shared/ganipay-adapter.ts";
import { getAdapter } from "../_shared/webhook-adapter.ts";

const GANIPAY_WEBHOOK_SECRET = Deno.env.get("GANIPAY_WEBHOOK_SECRET") ?? "";
const MAX_RETRY_ATTEMPTS     = 5;

// ── HMAC-SHA256 verification ──────────────────────────────────

async function verifyHmac(secret: string, rawBody: string, signature: string): Promise<boolean> {
  // Never allow an empty secret — an absent env var must hard-fail, not open the gate
  if (!secret) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig    = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hexSig = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");

  // Timing-safe comparison
  if (hexSig.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hexSig.length; i++) {
    diff |= hexSig.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = generateRequestId();
  const log = createLogger("payment-webhook", requestId);

  // ── Read raw body ─────────────────────────────────────────

  const rawBody = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    log.warn("Invalid JSON payload");
    return err("Invalid JSON payload", 400);
  }

  // ── Verify HMAC signature ─────────────────────────────────
  // Internal retries (from retry-webhooks EF) carry X-StayBF-Internal-Retry
  // with the original webhook_log_id. The signature was already verified on
  // first receipt — skip re-verification for internal calls.

  const internalRetryId = req.headers.get("x-staybf-internal-retry");
  // BUG-FIX RC3-D: guard against empty SUPABASE_SERVICE_ROLE_KEY — an unset env var
  // would let any caller with "Bearer " (empty token) pass the internal retry check.
  const _serviceKey     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const isInternalRetry = !!internalRetryId
    && !!_serviceKey
    && req.headers.get("authorization")?.slice(7) === _serviceKey;

  // BUG-FIX RC3-A: declare signature before the conditional so it is in scope
  // at the webhook_logs INSERT below regardless of isInternalRetry.
  const signature = req.headers.get("x-ganipay-signature") ?? "";

  if (!isInternalRetry) {
    const sigValid = await verifyHmac(GANIPAY_WEBHOOK_SECRET, rawBody, signature);

    if (!sigValid) {
      log.warn("GaniPay webhook signature verification failed");
      return err("Invalid webhook signature", 401);
    }
  } else {
    log.info("internal retry — HMAC verification skipped", { original_log_id: internalRetryId });
  }

  const db = makeServiceClient();

  // ── Freshness check (replay-attack guard) ─────────────────
  // Reject webhooks with occurred_at older than 5 minutes.
  // BUG-FIX RC3-B: skip this check for internal retries — their occurred_at
  // timestamps are always older than 5 min (they are replays of old events).
  // The HMAC was already verified on first receipt; the internal bypass above
  // is sufficient to authenticate the caller.
  const occurredAt = payload.occurred_at as string | undefined;
  if (!isInternalRetry && occurredAt) {
    const age = Date.now() - new Date(occurredAt).getTime();
    if (age > 5 * 60 * 1_000) {
      log.warn("Stale webhook rejected", { occurred_at: occurredAt, age_ms: age });
      return err("Webhook timestamp too old", 400);
    }
  }

  // ── Extract event id ──────────────────────────────────────

  const providerEventId  = (payload.event_id as string | undefined) ?? null;
  const eventType        = (payload.event_type as string | undefined) ?? "";
  const providerTxId     = (payload.payment_id as string | undefined)
    ?? (payload.payout_id as string | undefined)
    ?? (payload.reference as string | undefined)
    ?? null;

  if (!providerEventId) {
    log.warn("Missing event_id in payload");
    return err("Missing event_id", 400);
  }

  // ── Log raw webhook (idempotency guard) ───────────────────
  // BUG-FIX RC3-C: for internal retries the original webhook_log already exists
  // with this provider_event_id. Re-inserting would hit the UNIQUE constraint
  // (23505) and the handler would return ok({deduplicated:true}), silently
  // abandoning the retry. Instead, look up the existing row by the log ID
  // that the retry-webhooks EF passes in X-StayBF-Internal-Retry.

  let webhookLogId: string;

  if (isInternalRetry && internalRetryId) {
    // Reuse the existing log row; bump its attempts counter
    const { data: existingLog, error: lookupErr } = await db
      .from("payment_webhook_logs")
      .select("id")
      .eq("id", internalRetryId)
      .maybeSingle();

    if (lookupErr || !existingLog) {
      log.warn("internal retry log not found", { internalRetryId });
      return err("Webhook log not found", 404);
    }
    webhookLogId = existingLog.id;
  } else {
    const { data: webhookLog, error: logErr } = await db
      .from("payment_webhook_logs")
      .insert({
        provider:          "ganipay",
        provider_event_id: providerEventId,
        payload,
        signature:         signature || null,
        headers:           Object.fromEntries(req.headers.entries()),
        status:            "received",
        attempts:          1,
      })
      .select("id")
      .single();

    if (logErr?.code === "23505") {
      log.info("Duplicate GaniPay webhook — ignored", { providerEventId });
      return ok({ deduplicated: true });
    }
    if (logErr) {
      log.error("Failed to log webhook", logErr);
      return err(logErr.message, 500);
    }
    webhookLogId = webhookLog.id;
  }

  const childLog = log.child({ webhook_log_id: webhookLogId, event_type: eventType });

  // ── Handle payout events separately ──────────────────────

  if (eventType === "payout.paid" || eventType === "payout.failed") {
    await handlePayoutEvent(db, payload, eventType, webhookLogId, childLog);
    await db.from("payment_webhook_logs")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", webhookLogId);
    return ok({ processed: true, eventType });
  }

  // ── Normalize event via adapter ───────────────────────────

  const adapter = getAdapter("ganipay");
  if (!adapter) {
    await db.from("payment_webhook_logs").update({ status: "failed", last_error: "No ganipay adapter" }).eq("id", webhookLogId);
    return err("No GaniPay adapter registered", 500);
  }

  let normalized;
  try {
    normalized = adapter.normalizeEvent(payload);
  } catch (e) {
    const msg = (e as Error).message;
    await db.from("payment_webhook_logs").update({ status: "invalid", last_error: msg }).eq("id", webhookLogId);
    childLog.error("Normalization failed", e);
    return err("Failed to normalize event", 400);
  }

  const { providerTransactionId, mappedStatus, providerStatus, amountFcfa } = normalized;

  if (!providerTransactionId) {
    await db.from("payment_webhook_logs").update({ status: "invalid", last_error: "Missing transaction id" }).eq("id", webhookLogId);
    return err("Missing transaction id", 400);
  }

  // ── Find payment ──────────────────────────────────────────

  const { data: payment, error: paymentErr } = await db
    .from("payments")
    .select("id, booking_id, amount_fcfa, status")
    .eq("provider_transaction_id", providerTransactionId)
    .maybeSingle();

  if (paymentErr || !payment) {
    await db.from("payment_webhook_logs").update({ status: "failed", last_error: "Payment not found" }).eq("id", webhookLogId);
    childLog.warn("Payment not found", { providerTransactionId });
    return err("Payment not found", 404);
  }

  // ── Deduplicate via payment_events ────────────────────────

  const { error: eventConflict } = await db.from("payment_events").insert({
    payment_id:        payment.id,
    provider_event_id: providerEventId,
    event_source:      "webhook",
    provider_status:   providerStatus,
    mapped_status:     mappedStatus,
    amount_fcfa:       amountFcfa ?? payment.amount_fcfa,
    raw_payload:       payload,
  });

  if (eventConflict?.code === "23505") {
    await db.from("payment_webhook_logs").update({ status: "ignored" }).eq("id", webhookLogId);
    return ok({ deduplicated: true });
  }
  if (eventConflict) {
    // Increment retry count; dead-letter after MAX_RETRY_ATTEMPTS
    const { data: logRow } = await db
      .from("payment_webhook_logs")
      .select("attempts")
      .eq("id", webhookLogId)
      .single();
    const attempts = (logRow?.attempts ?? 1) + 1;
    const deadLettered = attempts > MAX_RETRY_ATTEMPTS;
    await db.from("payment_webhook_logs").update({
      status:             deadLettered ? "failed" : "received",
      attempts,
      retry_count:        attempts - 1,
      dead_lettered:      deadLettered,
      dead_letter_at:     deadLettered ? new Date().toISOString() : null,
      dead_letter_reason: deadLettered ? eventConflict.message : null,
      next_retry_at:      deadLettered ? null : new Date(Date.now() + attempts * 60_000).toISOString(),
      last_error:         eventConflict.message,
    }).eq("id", webhookLogId);
    childLog.error("Failed to insert payment event", eventConflict, { attempts, deadLettered });
    return err(eventConflict.message, 500);
  }

  // ── Handle non-captured status ────────────────────────────

  if (mappedStatus !== "captured") {
    if (mappedStatus === "failed" || mappedStatus === "cancelled") {
      const paymentStatus = mappedStatus === "cancelled" ? "cancelled" : "failed";
      await db.from("payments").update({ status: paymentStatus, failed_at: new Date().toISOString() }).eq("id", payment.id);

      // Revert booking to pending_payment so traveler can retry (only if cancelled — failed always retryable too)
      await db.from("bookings")
        .update({ status: "pending_payment" })
        .eq("id", payment.booking_id)
        .eq("status", "payment_processing");

      await db.from("booking_events").insert({
        booking_id:  payment.booking_id,
        event_type:  mappedStatus === "cancelled" ? "payment_cancelled" : "payment_failed",
        from_status: "payment_processing",
        to_status:   "pending_payment",
        actor_role:  "system",
        metadata:    { triggered_by: "ganipay_webhook", provider_event_id: providerEventId, mapped_status: mappedStatus },
      }).catch(() => undefined);

      // Notify traveler
      const { data: bk } = await db.from("bookings").select("traveler_id, reference").eq("id", payment.booking_id).single();
      if (bk) {
        await db.from("notifications").insert({
          user_id: bk.traveler_id,
          type:    mappedStatus === "cancelled" ? "payment_cancelled" : "payment_failed",
          title:   mappedStatus === "cancelled" ? "Paiement annulé" : "Paiement échoué",
          body:    `Votre paiement pour la réservation ${bk.reference} a ${mappedStatus === "cancelled" ? "été annulé" : "échoué"}. Veuillez réessayer.`,
          data:    { booking_id: payment.booking_id, payment_id: payment.id },
        }).catch(() => undefined);
      }

    } else if (mappedStatus === "refunded") {
      // ── B18: Write ledger entries on refund.completed ──────────────────────
      // Reverse the original booking credits proportional to the refund amount.
      await handleRefundLedger(db, payment, providerEventId, amountFcfa, childLog);
    }

    await db.from("payment_webhook_logs").update({
      status:     ["failed", "cancelled", "refunded"].includes(mappedStatus) ? "processed" : "ignored",
      payment_id: payment.id,
    }).eq("id", webhookLogId);
    return ok({ status: mappedStatus });
  }

  // ── Process captured payment ──────────────────────────────

  const capturedAt = new Date().toISOString();

  const { error: captureErr } = await db.from("payments").update({
    status:      "captured",
    captured_at: capturedAt,
  }).eq("id", payment.id);

  if (captureErr) {
    childLog.error("Failed to capture payment", captureErr);
    return err(captureErr.message, 500);
  }

  // ── Fetch booking + host ──────────────────────────────────

  const { data: booking } = await db
    .from("bookings")
    .select("id, reference, status, traveler_id, property_id, host_payout_amount, commission_amount, service_fee_amount")
    .eq("id", payment.booking_id)
    .single();

  if (!booking) {
    await db.from("payment_webhook_logs").update({ status: "failed", last_error: "Booking not found" }).eq("id", webhookLogId);
    return err("Booking not found", 500);
  }

  const { data: prop } = await db.from("properties").select("host_id, instant_book").eq("id", booking.property_id).single();
  const hostId      = prop?.host_id ?? null;
  const instantBook = prop?.instant_book ?? false;

  // ── Confirm booking ───────────────────────────────────────

  if (booking.status === "payment_processing") {
    const nextStatus = instantBook ? "confirmed" : "awaiting_host";
    const updateData: Record<string, unknown> = { status: nextStatus };
    if (instantBook) updateData.confirmed_at = capturedAt;

    await Promise.all([
      db.from("bookings").update(updateData).eq("id", booking.id).eq("status", "payment_processing"),
      db.from("booking_events").insert({
        booking_id:  booking.id,
        event_type:  instantBook ? "booking_confirmed" : "booking_awaiting_host",
        from_status: "payment_processing",
        to_status:   nextStatus,
        actor_role:  "system",
        metadata:    { triggered_by: "ganipay_webhook", provider_event_id: providerEventId },
      }),
    ]);
  }

  // ── Write ledger entries ──────────────────────────────────

  const ref = booking.reference as string;
  const ledgerRows = [
    {
      id:             `${booking.id}-accommodation`,
      entry_type:     "booking_accommodation_credit",
      debit_account:  null as string | null,
      credit_account: "HOST_PENDING",
      amount_fcfa:    booking.host_payout_amount,
      currency:       "XOF",
      booking_id:     booking.id,
      payout_id:      null as string | null,
      refund_id:      null as string | null,
      host_id:        hostId,
      reference:      ref,
      description:    `Réservation ${ref} — encours hôte`,
      metadata:       { source: "ganipay_webhook", provider_event_id: providerEventId, payment_id: payment.id },
      created_at:     capturedAt,
    },
    {
      id:             `${booking.id}-commission`,
      entry_type:     "booking_commission_credit",
      debit_account:  null as string | null,
      credit_account: "PLATFORM_PENDING",
      amount_fcfa:    booking.commission_amount,
      currency:       "XOF",
      booking_id:     booking.id,
      payout_id:      null as string | null,
      refund_id:      null as string | null,
      host_id:        null as string | null,
      reference:      ref,
      description:    `Réservation ${ref} — commission plateforme`,
      metadata:       { source: "ganipay_webhook", payment_id: payment.id },
      created_at:     capturedAt,
    },
    {
      id:             `${booking.id}-service-fee`,
      entry_type:     "booking_service_fee_credit",
      debit_account:  null as string | null,
      credit_account: "PLATFORM_PENDING",
      amount_fcfa:    booking.service_fee_amount,
      currency:       "XOF",
      booking_id:     booking.id,
      payout_id:      null as string | null,
      refund_id:      null as string | null,
      host_id:        null as string | null,
      reference:      ref,
      description:    `Réservation ${ref} — frais de service`,
      metadata:       { source: "ganipay_webhook", payment_id: payment.id },
      created_at:     capturedAt,
    },
  ];

  // Validate amounts
  const totalCredited = booking.host_payout_amount + booking.commission_amount + booking.service_fee_amount;
  if (totalCredited !== payment.amount_fcfa) {
    const reason = `Amount mismatch: ${totalCredited} ≠ ${payment.amount_fcfa}`;
    await db.from("payment_webhook_logs").update({ status: "failed", last_error: reason }).eq("id", webhookLogId);
    return err(reason, 500);
  }

  const validation = validateLedgerEntries(
    ledgerRows.map((r) => ({ debitAccount: r.debit_account, creditAccount: r.credit_account, amountFcfa: r.amount_fcfa })),
    { requireBalance: false }
  );

  if (!validation.valid) {
    await db.from("payment_webhook_logs").update({ status: "failed", last_error: validation.reason }).eq("id", webhookLogId);
    return err(`Ledger validation failed: ${validation.reason}`, 500);
  }

  const { error: ledgerErr } = await db
    .from("wallet_ledger")
    .upsert(ledgerRows, { onConflict: "id", ignoreDuplicates: true });

  if (ledgerErr) {
    childLog.error("Ledger write failed", ledgerErr);
    return err(ledgerErr.message, 500);
  }

  // ── Notifications ─────────────────────────────────────────

  await Promise.all([
    db.from("notifications").insert({
      user_id: booking.traveler_id,
      type:    "booking_confirmed",
      title:   "Réservation confirmée",
      body:    `Votre réservation ${booking.reference} est confirmée. Merci !`,
      data:    { booking_id: booking.id, payment_id: payment.id },
    }).catch(() => undefined),
    hostId ? db.from("notifications").insert({
      user_id: hostId,
      type:    "new_booking",
      title:   "Nouvelle réservation",
      body:    `Nouvelle réservation confirmée (${booking.reference}) — ${(booking.host_payout_amount ?? 0).toLocaleString("fr-FR")} FCFA à recevoir.`,
      data:    { booking_id: booking.id },
    }).catch(() => undefined) : Promise.resolve(),
  ]);

  // ── Mark webhook processed ────────────────────────────────

  await db.from("payment_webhook_logs").update({
    status:       "processed",
    payment_id:   payment.id,
    processed_at: capturedAt,
  }).eq("id", webhookLogId);

  childLog.end("ok", { captured: true });

  return ok({ captured: true, booking_id: booking.id, payment_id: payment.id, request_id: requestId });
});

// ── Payout event handler ──────────────────────────────────────

async function handlePayoutEvent(
  db: ReturnType<typeof makeServiceClient>,
  payload: Record<string, unknown>,
  eventType: string,
  webhookLogId: string,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  const providerPayoutId = payload.payout_id as string | undefined;
  if (!providerPayoutId) {
    await db.from("payment_webhook_logs").update({ status: "invalid", last_error: "Missing payout_id" }).eq("id", webhookLogId);
    return;
  }

  const { data: payout } = await db
    .from("payouts")
    .select("id, host_id, amount_fcfa, status, method")
    .eq("provider_payout_id", providerPayoutId)
    .maybeSingle();

  if (!payout) {
    log.warn("Payout not found for provider_payout_id", { providerPayoutId });
    return;
  }

  if (eventType === "payout.paid") {
    await db.from("payouts").update({
      status:     "paid",
      paid_at:    (payload.occurred_at as string | undefined) ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", payout.id).eq("status", "processing");

    await db.from("notifications").insert({
      user_id: payout.host_id,
      type:    "payout_paid",
      title:   "Retrait effectué",
      body:    `Votre retrait de ${(payout.amount_fcfa ?? 0).toLocaleString("fr-FR")} FCFA a bien été versé.`,
      data:    { payout_id: payout.id, amount_fcfa: payout.amount_fcfa },
    }).catch(() => undefined);

  } else if (eventType === "payout.failed") {
    const failureReason = (payload.failure_reason as string | undefined) ?? "GaniPay a rejeté le virement";
    await db.from("payouts").update({
      status:         "failed",
      failure_reason: failureReason,
      updated_at:     new Date().toISOString(),
    }).eq("id", payout.id).eq("status", "processing");

    await db.from("notifications").insert({
      user_id: payout.host_id,
      type:    "payout_failed",
      title:   "Retrait échoué",
      body:    `Votre retrait de ${(payout.amount_fcfa ?? 0).toLocaleString("fr-FR")} FCFA a échoué. Motif : ${failureReason}`,
      data:    { payout_id: payout.id, failure_reason: failureReason },
    }).catch(() => undefined);
  }
}

// ── Refund ledger handler ─────────────────────────────────────
// Called when GaniPay sends a refund.completed webhook.
// Writes proportional ledger debit entries to reverse the original
// booking credits (HOST_PENDING or HOST_AVAILABLE, PLATFORM_PENDING or
// PLATFORM_AVAILABLE depending on whether the booking was already completed).

async function handleRefundLedger(
  db: ReturnType<typeof makeServiceClient>,
  payment: { id: string; booking_id: string; amount_fcfa: number },
  providerEventId: string | null,
  refundAmountFcfa: number | null,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  const refundAmount = refundAmountFcfa ?? payment.amount_fcfa;

  // Fetch booking financial breakdown
  const { data: booking } = await db
    .from("bookings")
    .select("id, reference, host_payout_amount, commission_amount, service_fee_amount, property_id")
    .eq("id", payment.booking_id)
    .single();

  if (!booking) {
    log.warn("booking not found for refund ledger", { booking_id: payment.booking_id });
    return;
  }

  const { data: prop } = await db
    .from("properties")
    .select("host_id")
    .eq("id", booking.property_id)
    .maybeSingle();

  // Determine which accounts to debit: check if booking_completed_release exists
  const { data: releaseEntry } = await db
    .from("wallet_ledger")
    .select("id")
    .eq("booking_id", booking.id)
    .eq("entry_type", "booking_completed_release")
    .maybeSingle();

  const hostAccount     = releaseEntry ? "HOST_AVAILABLE"     : "HOST_PENDING";
  const platformAccount = releaseEntry ? "PLATFORM_AVAILABLE" : "PLATFORM_PENDING";

  // Compute proportional refund split
  const total = payment.amount_fcfa;
  const hostPortion     = total > 0 ? Math.round(refundAmount * (booking.host_payout_amount / total)) : 0;
  const platformPortion = refundAmount - hostPortion;

  // Guard: skip if refund entries already written (idempotency)
  const { data: existingRefundEntry } = await db
    .from("wallet_ledger")
    .select("id")
    .eq("booking_id", booking.id)
    .in("entry_type", ["refund_accommodation_debit", "refund_commission_debit", "refund_service_fee_debit"])
    .maybeSingle();

  if (existingRefundEntry) {
    log.info("refund ledger entries already written — skipped", { booking_id: booking.id });
    return;
  }

  const now = new Date().toISOString();
  const ref = booking.reference as string;
  const entries = [];

  if (hostPortion > 0) {
    entries.push({
      entry_type:    "refund_accommodation_debit",
      debit_account: hostAccount,
      credit_account: null as string | null,
      amount_fcfa:   hostPortion,
      currency:      "XOF",
      booking_id:    booking.id,
      host_id:       prop?.host_id ?? null,
      reference:     ref,
      description:   `Remboursement ${ref} — débit hôte ${hostAccount}`,
      metadata:      { refund_amount: refundAmount, provider_event_id: providerEventId, payment_id: payment.id },
      created_at:    now,
    });
  }

  if (platformPortion > 0) {
    const commissionShare   = booking.commission_amount ?? 0;
    const serviceFeeShare   = booking.service_fee_amount ?? 0;
    const platformTotal     = commissionShare + serviceFeeShare;
    const commissionPortion = platformTotal > 0 ? Math.round(platformPortion * (commissionShare / platformTotal)) : 0;
    const serviceFeePortion = platformPortion - commissionPortion;

    if (commissionPortion > 0) {
      entries.push({
        entry_type:    "refund_commission_debit",
        debit_account: platformAccount,
        credit_account: null as string | null,
        amount_fcfa:   commissionPortion,
        currency:      "XOF",
        booking_id:    booking.id,
        host_id:       null as string | null,
        reference:     ref,
        description:   `Remboursement ${ref} — commission plateforme`,
        metadata:      { refund_amount: refundAmount, provider_event_id: providerEventId },
        created_at:    now,
      });
    }

    if (serviceFeePortion > 0) {
      entries.push({
        entry_type:    "refund_service_fee_debit",
        debit_account: platformAccount,
        credit_account: null as string | null,
        amount_fcfa:   serviceFeePortion,
        currency:      "XOF",
        booking_id:    booking.id,
        host_id:       null as string | null,
        reference:     ref,
        description:   `Remboursement ${ref} — frais de service`,
        metadata:      { refund_amount: refundAmount, provider_event_id: providerEventId },
        created_at:    now,
      });
    }
  }

  if (entries.length > 0) {
    const { error: ledgerErr } = await db.from("wallet_ledger").insert(entries);
    if (ledgerErr) {
      log.error("refund ledger write failed", ledgerErr, { booking_id: booking.id });
    } else {
      log.info("refund ledger entries written", { booking_id: booking.id, count: entries.length, refund_amount: refundAmount });
    }
  }
}
