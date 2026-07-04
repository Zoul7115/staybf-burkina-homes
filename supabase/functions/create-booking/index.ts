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
      payment_method, notes,
    } = body;

    if (!room_id || !check_in || !check_out) {
      return err("Missing required fields: room_id, check_in, check_out");
    }

    const db = makeServiceClient();

    // Load room + property to snapshot pricing and validate
    const { data: room, error: roomErr } = await db
      .from("rooms")
      .select(`id, property_id, base_price_fcfa, max_guests, instant_book,
        properties!property_id(id, host_id, status, instant_book, cancellation_policy)`)
      .eq("id", room_id)
      .single();

    if (roomErr || !room) return err("Room not found", 404);

    const prop = Array.isArray(room.properties)
      ? room.properties[0]
      : room.properties as {
          id: string; host_id: string; status: string;
          instant_book: boolean; cancellation_policy: string;
        } | null;

    if (!prop) return err("Property not found", 404);
    if (prop.status !== "published") return err("Property not available for booking");

    const totalGuests = guests_adults + guests_children;
    if (totalGuests > room.max_guests) return err(`Room capacity is ${room.max_guests} guests`);

    const nights = Math.round(
      (new Date(check_out).getTime() - new Date(check_in).getTime()) / 86_400_000
    );
    if (nights < 1) return err("check_out must be after check_in");

    // Resolve nightly prices: price_override_fcfa > seasonal_pricing > base_price_fcfa
    const [overrideRes, seasonalRes] = await Promise.all([
      db.from("room_availability")
        .select("date, price_override_fcfa")
        .eq("room_id", room_id)
        .gte("date", check_in)
        .lt("date", check_out),
      db.from("seasonal_pricing")
        .select("starts_on, ends_on, price_fcfa, min_nights, priority")
        .eq("room_id", room_id)
        .lte("starts_on", check_out)
        .gte("ends_on", check_in)
        .order("priority", { ascending: false }),
    ]);

    const overrideMap = new Map<string, number>();
    for (const row of overrideRes.data ?? []) {
      if (row.price_override_fcfa !== null) overrideMap.set(row.date, row.price_override_fcfa);
    }

    const seasonalRules = (seasonalRes.data ?? []) as {
      starts_on: string; ends_on: string; price_fcfa: number; min_nights: number; priority: number;
    }[];

    let accommodationAmount = 0;
    for (let i = 0; i < nights; i++) {
      const d = new Date(check_in);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);

      const override = overrideMap.get(date);
      if (override !== undefined) { accommodationAmount += override; continue; }

      const seasonal = seasonalRules.find(
        (r) => r.starts_on <= date && r.ends_on >= date && r.min_nights <= nights
      );
      if (seasonal) { accommodationAmount += seasonal.price_fcfa; continue; }

      accommodationAmount += room.base_price_fcfa;
    }

    const service_fee_rate = 0.1000;
    const service_fee_amount = Math.round(accommodationAmount * service_fee_rate);

    // commission_rate: check host subscription (future hook — default 0.1500)
    const commission_rate = 0.1500;
    const commission_amount = Math.round(accommodationAmount * commission_rate);

    const total_amount = accommodationAmount + service_fee_amount;
    const host_payout_amount = accommodationAmount - commission_amount;

    // Generate booking reference
    const refPart = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    const reference = `STBF-${refPart}`;

    // Insert booking
    const { data: booking, error: bookingErr } = await db.from("bookings").insert({
      reference,
      traveler_id: user.id,
      property_id: prop.id,
      room_id,
      check_in,
      check_out,
      guests_adults,
      guests_children,
      guests_infants,
      status: "pending_payment",
      instant_book: prop.instant_book,
      accommodation_amount: accommodationAmount,
      service_fee_rate: service_fee_rate.toFixed(4),
      service_fee_amount,
      commission_rate: commission_rate.toFixed(4),
      commission_amount,
      total_amount,
      host_payout_amount,
      currency: "XOF",
      cancellation_policy: prop.cancellation_policy,
      host_subscription_snapshot: {},
    }).select("id, reference, status, total_amount").single();

    if (bookingErr) return err(bookingErr.message);

    // Claim availability atomically
    const { data: claimed, error: claimErr } = await db.rpc("claim_availability", {
      p_room_id: room_id,
      p_check_in: check_in,
      p_check_out: check_out,
      p_booking_id: booking.id,
    });

    if (claimErr || claimed === 0) {
      await db.from("bookings").delete().eq("id", booking.id);
      return err("Selected dates are no longer available");
    }

    // Insert initial booking event
    await db.from("booking_events").insert({
      booking_id: booking.id,
      event_type: "booking_created",
      from_status: null,
      to_status: "pending_payment",
      actor_id: user.id,
      actor_role: "traveler",
    });

    return ok({ booking: { id: booking.id, reference: booking.reference, status: booking.status, totalAmount: booking.total_amount } }, 201);
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
