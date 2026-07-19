import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const { property_id } = body;
    if (!property_id) return err("Missing property_id");

    const db = makeServiceClient();

    const { data: existing } = await db.from("properties").select("host_id").eq("id", property_id).single();
    if (!existing) return err("Property not found", 404);
    if (existing.host_id !== user.id) return err("Forbidden", 403);

    // Explicit allowlist — never spread arbitrary user input into DB update
    const allowed = ["name", "description_md", "address", "city_id", "type", "price_per_night",
      "instant_book", "max_guests", "bedrooms", "beds", "bathrooms", "amenities",
      "house_rules", "check_in_time", "check_out_time", "cancellation_policy",
      "min_nights", "max_nights", "latitude", "longitude"] as const;
    type AllowedKey = typeof allowed[number];
    const updates: Partial<Record<AllowedKey, unknown>> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

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
