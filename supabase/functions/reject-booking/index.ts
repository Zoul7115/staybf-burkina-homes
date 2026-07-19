import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const { booking_id, reason } = await req.json();
    if (!booking_id) return err("Missing booking_id");

    const db = makeServiceClient();

    const { data: booking, error: fetchErr } = await db
      .from("bookings")
      .select("id, traveler_id, property_id, status")
      .eq("id", booking_id)
      .single();

    if (fetchErr || !booking) return err("Booking not found", 404);

    const { data: prop } = await db.from("properties").select("host_id").eq("id", booking.property_id).single();
    if (!prop || prop.host_id !== user.id) return err("Forbidden", 403);

    if (booking.status !== "awaiting_host") {
      return err(`Booking is not awaiting host confirmation (current status: ${booking.status})`);
    }

    const rejectedAt = new Date().toISOString();
    const { error: updateErr } = await db.from("bookings").update({
      status: "cancelled_by_host",
      cancelled_by: user.id,
      cancelled_at: rejectedAt,
      cancellation_reason: reason ?? null,
    }).eq("id", booking_id).eq("status", "awaiting_host");

    if (updateErr) return err(updateErr.message);

    // Release availability (1 arg: booking_id)
    await db.rpc("release_availability", { p_booking_id: booking_id });

    await db.from("notifications").insert({
      user_id: booking.traveler_id,
      type: "booking_rejected",
      title: "Demande refusée",
      body: reason ?? "L'hôte n'a pas accepté votre demande de réservation.",
      data: { booking_id },
    });

    return ok({ success: true });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
