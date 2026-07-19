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

    const { data: booking } = await db.from("bookings")
      .select(`id, traveler_id, check_in, check_out, guests_adults, guests_children, guests_infants, total_amount, status, created_at,
        rooms!room_id(name, property_id, properties!property_id(name, address, cities!city_id(name))),
        profiles!traveler_id(full_name, email)`)
      .eq("id", booking_id)
      .single();

    if (!booking) return err("Booking not found", 404);

    const isTraveler = (booking as unknown as { traveler_id: string }).traveler_id === user.id;
    if (!isTraveler) {
      // Check if user is the host via property
      const propertyId = (booking.rooms as { property_id?: string } | null)?.property_id;
      if (propertyId) {
        const { data: prop } = await db.from("properties").select("host_id").eq("id", propertyId).single();
        if (!prop || prop.host_id !== user.id) return err("Forbidden", 403);
      } else {
        return err("Forbidden", 403);
      }
    }

    // Return structured data for client-side PDF generation
    return ok({ booking });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
