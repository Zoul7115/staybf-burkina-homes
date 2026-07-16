// ============================================================
// payment-init — Initiate a GaniPay payment
//
// Flow:
//   1. Authenticate traveler
//   2. Verify booking (pending_payment, amount match)
//   3. Idempotency: return existing if same idempotency_key
//   4. Create payment row (status=initiated)
//   5. Call GaniPay /payments → get checkout_url
//   6. Update payment with provider_transaction_id
//   7. Transition booking → payment_processing
//   8. Return { payment_id, checkout_url, provider_transaction_id }
//
// No business logic — only bridges DB ↔ GaniPay.
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

const GANIPAY_API_KEY      = Deno.env.get("GANIPAY_API_KEY") ?? "";
const GANIPAY_ENV          = Deno.env.get("GANIPAY_ENV") ?? "sandbox";
const GANIPAY_CALLBACK_URL = Deno.env.get("GANIPAY_CALLBACK_URL") ?? "";
const GANIPAY_CANCEL_URL   = Deno.env.get("GANIPAY_CANCEL_URL") ?? "";

const GANIPAY_BASE_URL = GANIPAY_ENV === "production"
  ? "https://api.ganipay.com/v1"
  : "https://sandbox.ganipay.com/v1";

async function ganipayPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${GANIPAY_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GANIPAY_API_KEY}`,
      "Content-Type":  "application/json",
      "Accept":        "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`GaniPay returned non-JSON: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = (json.message ?? json.error ?? `GaniPay error ${res.status}`) as string;
    throw new Error(msg);
  }

  return json;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const {
      booking_id,
      method,
      idempotency_key,
      payer_phone = "",
      payer_email = "",
    }: {
      booking_id: string;
      method: string;
      idempotency_key: string;
      payer_phone?: string;
      payer_email?: string;
    } = body;

    if (!booking_id || !method || !idempotency_key) {
      return err("booking_id, method, and idempotency_key are required");
    }

    const db = makeServiceClient();

    // ── Verify booking ────────────────────────────────────────

    const { data: booking, error: bookingErr } = await db
      .from("bookings")
      .select("id, reference, status, total_amount, traveler_id, property_id, host_payout_amount, commission_amount, service_fee_amount")
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) return err("Booking not found", 404);
    if (booking.traveler_id !== user.id) return err("Forbidden", 403);
    if (booking.status !== "pending_payment") {
      return err(`Cannot initiate payment for booking in status '${booking.status}'`);
    }

    // ── Idempotency guard ─────────────────────────────────────

    const { data: existing } = await db
      .from("payments")
      .select("id, status, provider_transaction_id")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();

    if (existing) {
      // Return existing intent — may already have checkout_url
      const { data: paymentRow } = await db
        .from("payments")
        .select("id, status, provider_transaction_id, raw_payload")
        .eq("id", existing.id)
        .single();

      return ok({
        payment_id:              existing.id,
        provider_transaction_id: existing.provider_transaction_id,
        checkout_url:            (paymentRow?.raw_payload as Record<string, unknown> | null)?.checkout_url ?? null,
        idempotent:              true,
      });
    }

    // ── Create payment row (status=initiated) ─────────────────

    const { data: payment, error: insertErr } = await db
      .from("payments")
      .insert({
        booking_id,
        payer_id:              user.id,
        method,
        provider:              "ganipay",
        status:                "initiated",
        amount_fcfa:           booking.total_amount,
        processor_fee_fcfa:    0,
        idempotency_key,
        attempt_number:        1,
        currency:              "XOF",
        provider_transaction_id: null,
        raw_payload:           {},
      })
      .select("id")
      .single();

    if (insertErr || !payment) return err(insertErr?.message ?? "Failed to create payment", 500);

    const paymentId = payment.id;

    // ── Call GaniPay /payments ────────────────────────────────

    let ganipayResponse: Record<string, unknown>;
    try {
      ganipayResponse = await ganipayPost("/payments", {
        reference:    idempotency_key,
        amount:       booking.total_amount,
        currency:     "XOF",
        method,
        description:  `Réservation ${booking.reference}`,
        callback_url: GANIPAY_CALLBACK_URL || `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-webhook`,
        cancel_url:   GANIPAY_CANCEL_URL,
        customer: {
          id:    user.id,
          email: payer_email,
          phone: payer_phone,
        },
        metadata: {
          booking_id:         booking_id,
          booking_reference:  booking.reference,
          payment_id:         paymentId,
        },
      });
    } catch (e) {
      // Mark payment as failed if GaniPay call fails
      await db.from("payments").update({ status: "failed" }).eq("id", paymentId);
      return err(`GaniPay error: ${(e as Error).message}`, 502);
    }

    const providerTransactionId = ganipayResponse.id as string;
    const checkoutUrl           = (ganipayResponse.checkout_url as string | null) ?? null;
    const expiresAt             = (ganipayResponse.expires_at as string | null) ?? new Date(Date.now() + 30 * 60_000).toISOString();

    // ── Update payment with provider info ─────────────────────

    await db.from("payments").update({
      status:                  "pending",
      provider_transaction_id: providerTransactionId,
      expires_at:              expiresAt,
      raw_payload:             { checkout_url: checkoutUrl, ...ganipayResponse },
    }).eq("id", paymentId);

    // ── Transition booking → payment_processing ───────────────

    await db.from("bookings")
      .update({ status: "payment_processing" })
      .eq("id", booking_id)
      .eq("status", "pending_payment");

    return ok({
      payment_id:              paymentId,
      provider_transaction_id: providerTransactionId,
      checkout_url:            checkoutUrl,
      expires_at:              expiresAt,
    }, 201);

  } catch (e) {
    return err((e as Error).message, 500);
  }
});
