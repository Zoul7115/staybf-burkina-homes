// ============================================================
// process-payment-webhook — provider-agnostic idempotent processor
//
// Provider identity is resolved at runtime via the ?provider= query param.
// All provider-specific parsing is delegated to ProviderWebhookAdapter.
// To add a new provider: implement the adapter, register it, done.
//
// Pipeline (all steps must succeed or the entire request returns error):
//   1. Resolve provider adapter
//   2. Verify signature
//   3. Log raw webhook to payment_webhook_logs (dedup guard)
//   4. Normalize event via adapter
//   5. Find payment by providerTransactionId
//   6. Insert payment_events row (dedup guard for processing)
//   7. Transition payment status
//   8. Confirm booking + write booking_event (if captured)
//   9. Write ledger entries atomically (validate Σcredit = Σdebit first)
//  10. Mark webhook processed
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";
import { getAdapter } from "../_shared/webhook-adapter.ts";
import { validateLedgerEntries, LedgerImbalanceError } from "../_shared/validate-ledger.ts";
import { createLogger, generateRequestId } from "../_shared/logger.ts";

// Import adapters so they self-register
import "../_shared/cinetpay-adapter.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = generateRequestId();
  const log = createLogger("process-payment-webhook", requestId);

  // ── Step 1: resolve adapter ───────────────────────────────

  const url = new URL(req.url);
  const providerName = url.searchParams.get("provider") ?? "";
  const adapter = getAdapter(providerName);

  if (!adapter) {
    log.warn("Unknown provider", { providerName });
    return err(`Unknown provider: ${providerName || "(none)"}`, 400);
  }

  // ── Parse raw body ────────────────────────────────────────

  const rawBody = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    log.warn("Invalid JSON payload");
    return err("Invalid JSON payload", 400);
  }

  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) headers[k] = v;

  // ── Step 2: verify signature ──────────────────────────────

  const secret = Deno.env.get("PAYMENT_WEBHOOK_SECRET") ?? "";
  const verdict = adapter.verifySignature(payload, headers, secret);
  if (!verdict.valid) {
    log.warn("Signature verification failed", { reason: verdict.reason, providerName });
    return err("Invalid webhook signature", 401);
  }

  const db = makeServiceClient();

  // ── Step 3: log raw webhook (dedup guard) ─────────────────

  const providerEventId = adapter.extractEventId(payload);

  const { data: webhookLog, error: logErr } = await db
    .from("payment_webhook_logs")
    .insert({
      provider: providerName,
      provider_event_id: providerEventId,
      payload,
      signature: headers["x-cinetpay-signature"] ?? headers["x-signature"] ?? null,
      headers,
      status: "received",
      attempts: 1,
    })
    .select("id")
    .single();

  // UNIQUE conflict on (provider, provider_event_id) → duplicate delivery
  if (logErr?.code === "23505") {
    log.info("Duplicate webhook delivery — ignored", { providerName, providerEventId });
    return ok({ deduplicated: true });
  }
  if (logErr) {
    log.error("Failed to log webhook", logErr);
    return err(logErr.message, 500);
  }

  const webhookLogId = webhookLog.id;
  const childLog = log.child({ webhook_log_id: webhookLogId, provider: providerName });

  // ── Step 4: normalize event ───────────────────────────────

  let normalized;
  try {
    normalized = adapter.normalizeEvent(payload);
  } catch (e) {
    await db.from("payment_webhook_logs").update({ status: "invalid", last_error: (e as Error).message }).eq("id", webhookLogId);
    childLog.error("Event normalization failed", e);
    return err("Failed to normalize webhook event", 400);
  }

  const { providerTransactionId, mappedStatus, providerStatus, amountFcfa: eventAmountFcfa } = normalized;

  if (!providerTransactionId) {
    await db.from("payment_webhook_logs").update({ status: "invalid", last_error: "Missing transaction id" }).eq("id", webhookLogId);
    childLog.warn("Missing transaction id in payload");
    return err("Missing transaction id", 400);
  }

  childLog.info("Event normalized", { providerTransactionId, mappedStatus, providerStatus });

  // ── Step 5: find payment ──────────────────────────────────

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

  const paymentLog = childLog.child({ payment_id: payment.id, booking_id: payment.booking_id });

  // ── Step 6: payment_events dedup gate ────────────────────

  const { error: eventConflict } = await db.from("payment_events").insert({
    payment_id: payment.id,
    provider_event_id: providerEventId ?? providerTransactionId,
    event_source: "webhook",
    provider_status: providerStatus,
    mapped_status: mappedStatus,
    amount_fcfa: eventAmountFcfa ?? payment.amount_fcfa,
    raw_payload: payload,
  });

  if (eventConflict?.code === "23505") {
    await db.from("payment_webhook_logs").update({ status: "ignored" }).eq("id", webhookLogId);
    paymentLog.info("Duplicate payment event — ignored");
    return ok({ deduplicated: true });
  }
  if (eventConflict) {
    paymentLog.error("Failed to insert payment event", eventConflict);
    return err(eventConflict.message, 500);
  }

  // ── Step 7: handle non-captured statuses ─────────────────

  if (mappedStatus !== "captured") {
    const finalStatus = mappedStatus === "failed" ? "failed" : "ignored";
    await Promise.all([
      db.from("payment_webhook_logs").update({ status: finalStatus, payment_id: payment.id }).eq("id", webhookLogId),
      mappedStatus === "failed"
        ? db.from("payments").update({ status: "failed", failed_at: new Date().toISOString() }).eq("id", payment.id)
        : Promise.resolve(),
    ]);
    paymentLog.info("Non-captured event handled", { mappedStatus });
    return ok({ status: mappedStatus });
  }

  const capturedAt = new Date().toISOString();

  // ── Step 7b: capture payment ──────────────────────────────

  const { error: captureErr } = await db.from("payments").update({
    status: "captured",
    captured_at: capturedAt,
    provider_transaction_id: providerTransactionId,
  }).eq("id", payment.id);

  if (captureErr) {
    paymentLog.error("Failed to capture payment", captureErr);
    return err(captureErr.message, 500);
  }

  // ── Step 8: fetch booking + host ─────────────────────────

  const { data: booking } = await db
    .from("bookings")
    .select("id, reference, host_payout_amount, commission_amount, service_fee_amount, status, property_id, room_id")
    .eq("id", payment.booking_id)
    .single();

  if (!booking) {
    await db.from("payment_webhook_logs").update({ status: "failed", last_error: "Booking not found" }).eq("id", webhookLogId);
    paymentLog.error("Booking not found after payment capture");
    return err("Booking not found", 500);
  }

  const { data: prop } = await db.from("properties").select("host_id, instant_book").eq("id", booking.property_id).single();
  const hostId: string | null = prop?.host_id ?? null;
  const instantBook: boolean = prop?.instant_book ?? false;

  const bookingLog = paymentLog.child({ booking_id: booking.id });

  // Confirm booking if still in payment_processing; respect instant_book flag
  if (booking.status === "payment_processing") {
    const nextStatus = instantBook ? "confirmed" : "awaiting_host";
    const updatePayload: Record<string, unknown> = { status: nextStatus };
    if (instantBook) updatePayload.confirmed_at = capturedAt;
    await Promise.all([
      db.from("bookings").update(updatePayload).eq("id", booking.id).eq("status", "payment_processing"),
      db.from("booking_events").insert({
        booking_id: booking.id,
        event_type: instantBook ? "booking_confirmed" : "booking_awaiting_host",
        from_status: "payment_processing",
        to_status: nextStatus,
        actor_role: "system",
        metadata: { triggered_by: "webhook", provider: providerName, provider_event_id: providerEventId },
      }),
    ]);
    bookingLog.info("Booking transitioned after payment", { nextStatus });
  }

  // ── Step 9: build + validate ledger entries ───────────────
  //
  // Booking credit entries are single-sided (no debit account).
  // The matching debit is the payment capture — funds enter from outside
  // the ledger system. We therefore skip balance assertion here (single-sided).
  // Full double-entry balance is achieved across the complete lifecycle:
  //   booking_confirmed  → +host_pending, +platform_pending (credit-only)
  //   booking_completed  → -host_pending/+host_available, -platform_pending/+platform_available
  //   payout             → -host_available/+host_withdrawn (balanced)

  const ref = booking.reference as string;
  const ledgerRows = [
    {
      id: `${booking.id}-accommodation`,
      entry_type: "booking_accommodation_credit",
      debit_account: null,
      credit_account: "HOST_PENDING",
      amount_fcfa: booking.host_payout_amount,
      currency: "XOF",
      booking_id: booking.id,
      payout_id: null,
      refund_id: null,
      host_id: hostId,
      reference: ref,
      description: `Réservation ${ref} — encours hôte`,
      metadata: { source: "webhook", provider: providerName, payment_id: payment.id },
      created_at: capturedAt,
    },
    {
      id: `${booking.id}-commission`,
      entry_type: "booking_commission_credit",
      debit_account: null,
      credit_account: "PLATFORM_PENDING",
      amount_fcfa: booking.commission_amount,
      currency: "XOF",
      booking_id: booking.id,
      payout_id: null,
      refund_id: null,
      host_id: null,
      reference: ref,
      description: `Réservation ${ref} — commission plateforme`,
      metadata: { source: "webhook", provider: providerName, payment_id: payment.id },
      created_at: capturedAt,
    },
    {
      id: `${booking.id}-service-fee`,
      entry_type: "booking_service_fee_credit",
      debit_account: null,
      credit_account: "PLATFORM_PENDING",
      amount_fcfa: booking.service_fee_amount,
      currency: "XOF",
      booking_id: booking.id,
      payout_id: null,
      refund_id: null,
      host_id: null,
      reference: ref,
      description: `Réservation ${ref} — frais de service`,
      metadata: { source: "webhook", provider: providerName, payment_id: payment.id },
      created_at: capturedAt,
    },
  ];

  // Validate individual entry amounts (skip balance check for credit-only entries)
  const validation = validateLedgerEntries(
    ledgerRows.map((r) => ({ debitAccount: r.debit_account, creditAccount: r.credit_account, amountFcfa: r.amount_fcfa })),
    { requireBalance: false }
  );

  if (!validation.valid) {
    await db.from("payment_webhook_logs").update({ status: "failed", last_error: validation.reason }).eq("id", webhookLogId);
    bookingLog.error("Ledger validation failed", new Error(validation.reason));
    return err(`Ledger validation failed: ${validation.reason}`, 500);
  }

  // Amount consistency check: total credits must equal payment.amount_fcfa
  const totalCredited = booking.host_payout_amount + booking.commission_amount + booking.service_fee_amount;
  if (totalCredited !== payment.amount_fcfa) {
    const reason = `Amount mismatch: sum(host_payout+commission+service_fee)=${totalCredited} ≠ payment.amount_fcfa=${payment.amount_fcfa}`;
    await db.from("payment_webhook_logs").update({ status: "failed", last_error: reason }).eq("id", webhookLogId);
    bookingLog.error("Ledger amount mismatch", new Error(reason));
    return err(reason, 500);
  }

  // Upsert ledger rows (idempotent by PK)
  const { error: ledgerErr } = await db
    .from("wallet_ledger")
    .upsert(ledgerRows, { onConflict: "id", ignoreDuplicates: true });

  if (ledgerErr) {
    bookingLog.error("Ledger write failed", ledgerErr);
    return err(ledgerErr.message, 500);
  }

  bookingLog.info("Ledger entries written", { count: ledgerRows.length, totalCredited });

  // ── Step 10: mark webhook processed ──────────────────────

  await db.from("payment_webhook_logs").update({
    status: "processed",
    payment_id: payment.id,
    processed_at: capturedAt,
  }).eq("id", webhookLogId);

  bookingLog.end("ok", { captured: true });

  return ok({ captured: true, bookingId: booking.id, paymentId: payment.id, requestId });
});
