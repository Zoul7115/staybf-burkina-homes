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
      room_id, check_in, check_out,
      guests_adults = 1, guests_children = 0, guests_infants = 0,
      notes,
    } = body;

    if (!room_id || !check_in || !check_out) return err("Missing required fields: room_id, check_in, check_out");

    const db = makeServiceClient();

    // Load room + property to snapshot pricing and validate
    const { data: room, error: roomErr } = await db
      .from("rooms")
      .select(`id, property_id, price_per_night_fcfa, max_guests,
        properties!property_id(id, host_id, status, instant_book)`)
      .eq("id", room_id)
      .single();

    if (roomErr || !room) return err("Room not found", 404);

    const prop = Array.isArray(room.properties)
      ? room.properties[0]
      : room.properties as { id: string; host_id: string; status: string; instant_book: boolean } | null;

    if (!prop) return err("Property not found", 404);
    if (prop.status !== "published") return err("Property not available for booking");

    const totalGuests = guests_adults + guests_children;
    if (totalGuests > room.max_guests) return err(`Room capacity is ${room.max_guests} guests`);

    // Compute financial snapshot
    const nights = Math.ceil(
      (new Date(check_out).getTime() - new Date(check_in).getTime()) / 86_400_000
    );
    if (nights < 1) return err("check_out must be after check_in");

    const accommodation_amount = room.price_per_night_fcfa * nights;
    const service_fee_rate = 0.10;
    const service_fee_amount = Math.round(accommodation_amount * service_fee_rate);
    const commission_rate = 0.15;
    const commission_amount = Math.round(accommodation_amount * commission_rate);
    const total_amount = accommodation_amount + service_fee_amount;
    const host_payout_amount = accommodation_amount - commission_amount;

    // Generate booking reference (Crockford base32 style)
    const ref = "STBF-" + Math.random().toString(36).slice(2, 8).toUpperCase();

    // Create booking record first (availability will be claimed after)
    const { data: booking, error: bookingErr } = await db.from("bookings").insert({
      traveler_id: user.id,
      property_id: prop.id,
      room_id,
      check_in,
      check_out,
      guests_adults,
      guests_children,
      guests_infants,
      instant_book: prop.instant_book,
      accommodation_amount,
      service_fee_rate: service_fee_rate.toString(),
      service_fee_amount,
      commission_rate: commission_rate.toString(),
      commission_amount,
      total_amount,
      host_payout_amount,
      currency: "XOF",
      reference: ref,
      notes: notes ?? null,
      status: "pending_payment",
    }).select("id, reference, status").single();

    if (bookingErr) return err(bookingErr.message);

    // Claim availability atomically (4 args: room, check_in, check_out, booking_id)
    const { data: claimed, error: claimErr } = await db.rpc("claim_availability", {
      p_room_id: room_id,
      p_check_in: check_in,
      p_check_out: check_out,
      p_booking_id: booking.id,
    });

    if (claimErr || (claimed !== null && claimed === 0)) {
      // Rollback the booking
      await db.from("bookings").delete().eq("id", booking.id);
      return err("Selected dates are no longer available");
    }

    return ok({ booking }, 201);
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
