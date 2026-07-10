import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

const MAX_ATTEMPTS = 3;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const { payment_id } = await req.json();
    if (!payment_id) return err("Missing payment_id");

    const db = makeServiceClient();

    // Fetch payment - payer_id is the direct owner column
    const { data: payment } = await db
      .from("payments")
      .select("id, status, booking_id, payer_id, attempt_number")
      .eq("id", payment_id)
      .single();

    if (!payment) return err("Payment not found", 404);
    if (payment.payer_id !== user.id) return err("Forbidden", 403);

    if (payment.status !== "failed") {
      return err(`Payment cannot be retried from status '${payment.status}'`);
    }

    // Count all payment attempts for this booking
    const { count: attemptCount } = await db
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", payment.booking_id);

    if ((attemptCount ?? 0) >= MAX_ATTEMPTS) {
      return err("Maximum retry attempts reached");
    }

    // Create a new payment row (initiated) for the next attempt
    // The client must then call create-payment-intent with this new payment's booking_id
    const nextAttemptNumber = (payment.attempt_number ?? 1) + 1;
    const idempotencyKey = `${payment.booking_id}-${nextAttemptNumber}-${Date.now()}`;

    const { data: newPayment, error: insertErr } = await db
      .from("payments")
      .insert({
        booking_id: payment.booking_id,
        payer_id: user.id,
        method: "mobile_money",
        provider: "cinetpay",
        status: "initiated",
        amount_fcfa: 0, // placeholder — create-payment-intent will set the real amount
        processor_fee_fcfa: 0,
        idempotency_key: idempotencyKey,
        attempt_number: nextAttemptNumber,
      })
      .select("id")
      .single();

    if (insertErr) return err(insertErr.message);

    return ok({ success: true, booking_id: payment.booking_id, new_payment_id: newPayment.id, attempt_number: nextAttemptNumber });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
