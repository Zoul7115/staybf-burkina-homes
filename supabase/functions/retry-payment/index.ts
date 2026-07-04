import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const { payment_id } = await req.json();
    if (!payment_id) return err("Missing payment_id");

    const db = makeServiceClient();

    const { data: payment } = await db
      .from("payments")
      .select("id, status, booking_id, retry_count, bookings!booking_id(traveler_id)")
      .eq("id", payment_id)
      .single();

    if (!payment) return err("Payment not found", 404);

    const booking = Array.isArray(payment.bookings) ? payment.bookings[0] : payment.bookings as { traveler_id: string } | null;
    if (!booking || booking.traveler_id !== user.id) return err("Forbidden", 403);

    if (!["failed", "cancelled"].includes(payment.status)) {
      return err("Payment cannot be retried");
    }

    const newRetryCount = (payment.retry_count ?? 0) + 1;
    if (newRetryCount > 3) return err("Maximum retry attempts reached");

    const { error: updateErr } = await db.from("payments").update({
      status: "pending",
      retry_count: newRetryCount,
    }).eq("id", payment_id);

    if (updateErr) return err(updateErr.message);

    return ok({ success: true, payment_id, retry_count: newRetryCount });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
