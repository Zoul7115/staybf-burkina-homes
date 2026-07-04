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

    const { data: payment } = await db.from("payments").select("id, status, booking_id, bookings(traveler_id)").eq("id", payment_id).single();
    if (!payment) return err("Payment not found", 404);

    const travelerId = (payment.bookings as { traveler_id: string } | null)?.traveler_id;
    if (travelerId !== user.id) return err("Forbidden", 403);
    if (!["failed", "cancelled"].includes(payment.status)) return err("Payment cannot be retried");

    // Reset to pending so checkout flow can restart
    const { error: updateErr } = await db.from("payments").update({
      status: "pending",
      retry_count: db.rpc("increment", { row_id: payment_id }),
    }).eq("id", payment_id);

    if (updateErr) return err(updateErr.message);

    return ok({ success: true, payment_id });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
