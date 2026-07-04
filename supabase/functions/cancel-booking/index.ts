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
      .select("id, traveler_id, host_id, room_id, check_in, check_out, status")
      .eq("id", booking_id)
      .single();

    if (fetchErr || !booking) return err("Booking not found", 404);

    const isOwner = booking.traveler_id === user.id || booking.host_id === user.id;
    if (!isOwner) return err("Forbidden", 403);

    if (!["pending", "confirmed"].includes(booking.status)) {
      return err("Booking cannot be cancelled in its current state");
    }

    const { error: updateErr } = await db.from("bookings").update({
      status: "cancelled",
      cancellation_reason: reason ?? null,
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
    }).eq("id", booking_id);

    if (updateErr) return err(updateErr.message);

    // Release availability
    await db.rpc("release_availability", {
      p_room_id: booking.room_id,
      p_check_in: booking.check_in,
      p_check_out: booking.check_out,
    });

    // Notify the other party
    const notifyId = booking.traveler_id === user.id ? booking.host_id : booking.traveler_id;
    await db.from("notifications").insert({
      user_id: notifyId,
      type: "booking_cancelled",
      title: "Réservation annulée",
      body: "Une réservation a été annulée.",
      data: { booking_id },
    });

    return ok({ success: true });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
