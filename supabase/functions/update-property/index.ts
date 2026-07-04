import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const { property_id, ...updates } = body;
    if (!property_id) return err("Missing property_id");

    // Disallow status changes via this endpoint
    delete updates.status;
    delete updates.host_id;

    const db = makeServiceClient();

    const { data: existing } = await db.from("properties").select("host_id").eq("id", property_id).single();
    if (!existing) return err("Property not found", 404);
    if (existing.host_id !== user.id) return err("Forbidden", 403);

    const { data: property, error: updateErr } = await db.from("properties").update({
      ...updates,
      updated_at: new Date().toISOString(),
    }).eq("id", property_id).select().single();

    if (updateErr) return err(updateErr.message);

    return ok({ property });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
