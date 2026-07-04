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
      .select(`id, check_in, check_out, guests_count, total_amount_fcfa, status, created_at,
        rooms(name, property_id, properties(title, address, cities(name))),
        profiles!traveler_id(full_name, email)`)
      .eq("id", booking_id)
      .single();

    if (!booking) return err("Booking not found", 404);

    const travelerId = user.id;
    const hostId = (booking as { host_id?: string }).host_id;
    if (travelerId !== user.id && hostId !== user.id) return err("Forbidden", 403);

    // Return structured data for client-side PDF generation
    return ok({ booking });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
