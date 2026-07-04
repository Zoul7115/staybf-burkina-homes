import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const { room_id, check_in, check_out, guests_count, total_amount_fcfa, notes } = body;

    if (!room_id || !check_in || !check_out || !guests_count) {
      return err("Missing required fields");
    }

    const db = makeServiceClient();

    // Verify room exists and is available
    const { data: room, error: roomErr } = await db
      .from("rooms")
      .select("id, property_id, price_per_night_fcfa, max_guests, properties(host_id, status)")
      .eq("id", room_id)
      .single();

    if (roomErr || !room) return err("Room not found", 404);
    if ((room.properties as { status: string }).status !== "active") return err("Property not available");
    if (guests_count > room.max_guests) return err("Too many guests");

    // Claim availability atomically
    const { data: claimed, error: claimErr } = await db.rpc("claim_availability", {
      p_room_id: room_id,
      p_check_in: check_in,
      p_check_out: check_out,
    });

    if (claimErr || !claimed) return err("Dates not available");

    // Create booking
    const { data: booking, error: bookingErr } = await db.from("bookings").insert({
      room_id,
      traveler_id: user.id,
      host_id: (room.properties as { host_id: string }).host_id,
      check_in,
      check_out,
      guests_count,
      total_amount_fcfa: total_amount_fcfa ?? room.price_per_night_fcfa,
      notes: notes ?? null,
      status: "pending",
    }).select().single();

    if (bookingErr) {
      // Rollback availability
      await db.rpc("release_availability", { p_room_id: room_id, p_check_in: check_in, p_check_out: check_out });
      return err(bookingErr.message);
    }

    // Notify host
    await db.from("notifications").insert({
      user_id: (room.properties as { host_id: string }).host_id,
      type: "new_booking",
      title: "Nouvelle réservation",
      body: `Une nouvelle demande de réservation a été reçue.`,
      data: { booking_id: booking.id },
    });

    return ok({ booking });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
