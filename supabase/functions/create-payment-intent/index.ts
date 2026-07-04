// ============================================================
// create-payment-intent — persists a PaymentIntent to the DB
//
// Called by the PaymentGateway AFTER the provider has created
// the transaction. Writes a row to payments with status=initiated.
//
// Note: provider is currently constrained to 'cinetpay' by the
// DB CHECK constraint. When a new provider is added, a migration
// must update that constraint first.
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const {
      booking_id, payer_id, method, provider = "cinetpay",
      amount_fcfa, idempotency_key,
      provider_transaction_id = null,
      expires_at,
      metadata = {},
    } = body;

    if (!booking_id || !payer_id || !method || !amount_fcfa || !idempotency_key) {
      return err("Missing required fields");
    }

    if (payer_id !== user.id) return err("Forbidden", 403);

    const db = makeServiceClient();

    // Verify booking belongs to this user
    const { data: booking } = await db
      .from("bookings")
      .select("id, status, total_amount, traveler_id")
      .eq("id", booking_id)
      .single();

    if (!booking) return err("Booking not found", 404);
    if (booking.traveler_id !== user.id) return err("Forbidden", 403);
    if (booking.status !== "pending_payment") return err("Booking is not awaiting payment");
    if (booking.total_amount !== amount_fcfa) return err("Amount mismatch");

    // Idempotency: return existing if already initiated
    const { data: existing } = await db
      .from("payments")
      .select("*")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();

    if (existing) return ok({ payment: existing });

    const { data: payment, error: insertErr } = await db.from("payments").insert({
      booking_id,
      payer_id,
      method,
      provider,
      provider_transaction_id,
      status: "initiated",
      amount_fcfa,
      processor_fee_fcfa: 0,
      idempotency_key,
      attempt_number: 1,
      raw_payload: metadata,
    }).select().single();

    if (insertErr) return err(insertErr.message);

    // Update booking status to payment_processing
    await db.from("bookings").update({ status: "payment_processing" }).eq("id", booking_id);

    return ok({ payment }, 201);
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
