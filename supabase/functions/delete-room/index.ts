import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const { room_id } = await req.json();
    if (!room_id) return err("Missing room_id");

    const db = makeServiceClient();

    const { data: room } = await db.from("rooms").select("id, properties(host_id)").eq("id", room_id).single();
    if (!room) return err("Room not found", 404);

    const hostId = (room.properties as { host_id: string } | null)?.host_id;
    if (hostId !== user.id) return err("Forbidden", 403);

    // Prevent deletion if future confirmed bookings exist
    const { data: activeBookings } = await db.from("bookings")
      .select("id")
      .eq("room_id", room_id)
      .in("status", ["pending", "confirmed"])
      .gte("check_out", new Date().toISOString().split("T")[0])
      .limit(1);

    if (activeBookings && activeBookings.length > 0) {
      return err("Cannot delete room with active bookings");
    }

    const { error: delErr } = await db.from("rooms").delete().eq("id", room_id);
    if (delErr) return err(delErr.message);

    return ok({ success: true });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
