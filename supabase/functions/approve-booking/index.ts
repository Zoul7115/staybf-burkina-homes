import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const { booking_id } = await req.json();
    if (!booking_id) return err("Missing booking_id");

    const db = makeServiceClient();

    const { data: booking, error: fetchErr } = await db
      .from("bookings")
      .select("id, traveler_id, host_id, status")
      .eq("id", booking_id)
      .single();

    if (fetchErr || !booking) return err("Booking not found", 404);
    if (booking.host_id !== user.id) return err("Forbidden", 403);
    if (booking.status !== "pending") return err("Booking is not pending");

    const { error: updateErr } = await db.from("bookings").update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    }).eq("id", booking_id);

    if (updateErr) return err(updateErr.message);

    await db.from("notifications").insert({
      user_id: booking.traveler_id,
      type: "booking_confirmed",
      title: "Réservation confirmée",
      body: "Votre réservation a été confirmée par l'hôte.",
      data: { booking_id },
    });

    return ok({ success: true });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
