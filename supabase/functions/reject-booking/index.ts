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
    if (booking.host_id !== user.id) return err("Forbidden", 403);
    if (booking.status !== "pending") return err("Booking is not pending");

    const { error: updateErr } = await db.from("bookings").update({
      status: "rejected",
      cancellation_reason: reason ?? null,
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
    }).eq("id", booking_id);

    if (updateErr) return err(updateErr.message);

    await db.rpc("release_availability", {
      p_room_id: booking.room_id,
      p_check_in: booking.check_in,
      p_check_out: booking.check_out,
    });

    await db.from("notifications").insert({
      user_id: booking.traveler_id,
      type: "booking_rejected",
      title: "Réservation refusée",
      body: "Votre demande de réservation a été refusée par l'hôte.",
      data: { booking_id },
    });

    return ok({ success: true });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
