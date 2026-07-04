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

    // Load property to get host_id
    const { data: prop } = await db.from("properties").select("host_id").eq("id", booking.property_id).single();
    const hostId = prop?.host_id;

    const isTraveler = booking.traveler_id === user.id;
    const isHost = hostId === user.id;

    if (!isTraveler && !isHost) return err("Forbidden", 403);

    const cancellableStatuses = ["pending_payment", "payment_processing", "awaiting_host", "confirmed"];
    if (!cancellableStatuses.includes(booking.status)) {
      return err("Booking cannot be cancelled in its current state");
    }

    const newStatus = isTraveler ? "cancelled_by_traveler" : "cancelled_by_host";

    const { error: updateErr } = await db.from("bookings").update({
      status: newStatus,
    }).eq("id", booking_id);

    if (updateErr) return err(updateErr.message);

    // Release availability (1 arg: booking_id)
    await db.rpc("release_availability", { p_booking_id: booking_id });

    // Notify the other party
    const notifyId = isTraveler ? hostId : booking.traveler_id;
    if (notifyId) {
      await db.from("notifications").insert({
        user_id: notifyId,
        type: "booking_cancelled",
        title: "Réservation annulée",
        body: reason ?? "Une réservation a été annulée.",
        data: { booking_id },
      });
    }

    return ok({ success: true });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
