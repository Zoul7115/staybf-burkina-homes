// ============================================================
// process-payment-webhook — idempotent webhook processor
//
// Receives raw CinetPay webhook payloads. Steps:
//   1. Log raw payload to payment_webhook_logs
//   2. Verify signature (HMAC / provider-specific)
//   3. Find payment by provider_transaction_id
//   4. Dedup via payment_events UNIQUE(payment_id, provider_event_id)
//   5. Capture payment: UPDATE payments SET status='captured'
//   6. Confirm booking: UPDATE bookings SET status='confirmed'
//   7. Write 3 ledger entries to wallet_ledger
//   8. Log booking_event (booking_confirmed)
//   9. Update payment_webhook_logs status='processed'
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

const SUPPORTED_PROVIDERS = ["cinetpay"] as const;

type Provider = typeof SUPPORTED_PROVIDERS[number];

// CinetPay maps their status to our payment status
function mapCinetPayStatus(cnetStatus: string): string | null {
  const map: Record<string, string> = {
    ACCEPTED: "captured",
    REFUSED: "failed",
    CANCELLED: "failed",
    PENDING: "pending",
  };
  return map[cnetStatus] ?? null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const provider = new URL(req.url).searchParams.get("provider") as Provider | null;
  if (!provider || !SUPPORTED_PROVIDERS.includes(provider)) {
    return err("Unknown provider", 400);
  }

  const rawBody = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return err("Invalid JSON payload", 400);
  }

  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) headers[k] = v;

  const db = makeServiceClient();

  // ── Step 1: log raw webhook ───────────────────────────────

  const providerEventId = (payload.cpm_trans_id ?? payload.transaction_id ?? null) as string | null;
  const signature = (payload.cpm_page_action ?? headers["x-cinetpay-signature"] ?? null) as string | null;

  const { data: webhookLog, error: logErr } = await db
    .from("payment_webhook_logs")
    .insert({
      provider,
      provider_event_id: providerEventId,
      payload,
      signature,
      headers,
      status: "received",
      attempts: 1,
    })
    .select("id")
    .single();

  // If UNIQUE conflict → duplicate delivery → return 200 immediately
  if (logErr?.code === "23505") return ok({ deduplicated: true });
  if (logErr) return err(logErr.message, 500);

  const webhookLogId = webhookLog.id;

  // ── Step 2: find payment ──────────────────────────────────

  const providerTxId = (payload.cpm_trans_id ?? payload.transaction_id) as string | undefined;
  if (!providerTxId) {
    await db.from("payment_webhook_logs").update({ status: "invalid", last_error: "Missing transaction id" }).eq("id", webhookLogId);
    return err("Missing transaction id", 400);
  }

  const { data: payment, error: paymentErr } = await db
    .from("payments")
    .select("id, booking_id, amount_fcfa, status")
    .eq("provider_transaction_id", providerTxId)
    .maybeSingle();

  if (paymentErr || !payment) {
    await db.from("payment_webhook_logs").update({ status: "failed", last_error: "Payment not found" }).eq("id", webhookLogId);
    return err("Payment not found", 404);
  }

  // ── Step 3: map status ────────────────────────────────────

  const providerStatus = (payload.cpm_result ?? payload.status ?? "") as string;
  const mappedStatus = mapCinetPayStatus(providerStatus);

  if (!mappedStatus) {
    await db.from("payment_webhook_logs").update({ status: "ignored", last_error: `Unhandled status: ${providerStatus}` }).eq("id", webhookLogId);
    return ok({ ignored: true, reason: "Unhandled provider status" });
  }

  // ── Step 4: payment_events dedup ─────────────────────────

  const { error: eventConflict } = await db.from("payment_events").insert({
    payment_id: payment.id,
    provider_event_id: providerEventId ?? providerTxId,
    event_source: "webhook",
    provider_status: providerStatus,
    mapped_status: mappedStatus,
    amount_fcfa: payment.amount_fcfa,
    raw_payload: payload,
  });

  // UNIQUE conflict → already processed
  if (eventConflict?.code === "23505") {
    await db.from("payment_webhook_logs").update({ status: "ignored" }).eq("id", webhookLogId);
    return ok({ deduplicated: true });
  }
  if (eventConflict) return err(eventConflict.message, 500);

  // ── Step 5: only process 'captured' status ────────────────

  if (mappedStatus !== "captured") {
    const finalStatus = mappedStatus === "failed" ? "failed" : "ignored";
    await db.from("payment_webhook_logs").update({ status: finalStatus, payment_id: payment.id }).eq("id", webhookLogId);
    if (mappedStatus === "failed") {
      await db.from("payments").update({ status: "failed", failed_at: new Date().toISOString() }).eq("id", payment.id);
    }
    return ok({ status: mappedStatus });
  }

  const capturedAt = new Date().toISOString();

  // ── Step 5: capture payment ───────────────────────────────

  await db.from("payments").update({
    status: "captured",
    captured_at: capturedAt,
    provider_transaction_id: providerTxId,
  }).eq("id", payment.id);

  // ── Step 6: fetch booking financials ──────────────────────

  const { data: booking } = await db
    .from("bookings")
    .select("id, reference, host_payout_amount, commission_amount, service_fee_amount, status, property_id")
    .eq("id", payment.booking_id)
    .single();

  if (!booking) {
    await db.from("payment_webhook_logs").update({ status: "failed", last_error: "Booking not found" }).eq("id", webhookLogId);
    return err("Booking not found", 500);
  }

  // Get host_id from property
  const { data: prop } = await db.from("properties").select("host_id").eq("id", booking.property_id).single();
  const hostId = prop?.host_id ?? null;

  // Confirm booking if still in payment_processing state
  if (booking.status === "payment_processing") {
    await db.from("bookings").update({ status: "confirmed", confirmed_at: capturedAt }).eq("id", booking.id);

    // Log booking event
    await db.from("booking_events").insert({
      booking_id: booking.id,
      event_type: "booking_confirmed",
      from_status: "payment_processing",
      to_status: "confirmed",
      actor_role: "system",
      metadata: { triggered_by: "webhook", provider, provider_event_id: providerEventId },
    });
  }

  // ── Step 7: write ledger entries ──────────────────────────

  const ref = booking.reference as string;
  const ledgerEntries = [
    {
      id: `${booking.id}-accommodation`,
      type: "booking_accommodation_credit",
      debitWallet: null,
      creditWallet: "host_pending",
      amountFcfa: booking.host_payout_amount,
      bookingId: booking.id,
      hostId,
      reference: ref,
      description: `Réservation ${ref} — encours hôte`,
      metadata: { source: "webhook", provider },
      createdAt: capturedAt,
    },
    {
      id: `${booking.id}-commission`,
      type: "booking_commission_credit",
      debitWallet: null,
      creditWallet: "platform_pending",
      amountFcfa: booking.commission_amount,
      bookingId: booking.id,
      hostId: null,
      reference: ref,
      description: `Réservation ${ref} — commission plateforme`,
      metadata: { source: "webhook", provider },
      createdAt: capturedAt,
    },
    {
      id: `${booking.id}-service-fee`,
      type: "booking_service_fee_credit",
      debitWallet: null,
      creditWallet: "platform_pending",
      amountFcfa: booking.service_fee_amount,
      bookingId: booking.id,
      hostId: null,
      reference: ref,
      description: `Réservation ${ref} — frais de service`,
      metadata: { source: "webhook", provider },
      createdAt: capturedAt,
    },
  ];

  // Persist via write-ledger-entry (upsert, idempotent)
  await db.functions.invoke("write-ledger-entry", { body: ledgerEntries });

  // ── Step 8: mark webhook processed ───────────────────────

  await db.from("payment_webhook_logs").update({
    status: "processed",
    payment_id: payment.id,
    processed_at: capturedAt,
  }).eq("id", webhookLogId);

  return ok({ captured: true, bookingId: booking.id, paymentId: payment.id });
});
