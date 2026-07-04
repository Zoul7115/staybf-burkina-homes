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
      title, description, property_type, city_id, address, latitude, longitude,
      amenities, house_rules, max_guests, instant_book,
    } = body;

    if (!title || !property_type || !city_id || !address) {
      return err("Missing required fields");
    }

    const db = makeServiceClient();

    // Verify host profile exists
    const { data: hostProfile } = await db.from("host_profiles").select("id").eq("id", user.id).maybeSingle();
    if (!hostProfile) return err("Host profile not found. Please complete your host profile first.", 403);

    const { data: property, error: propErr } = await db.from("properties").insert({
      host_id: user.id,
      title,
      description: description ?? null,
      property_type,
      city_id,
      address,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      amenities: amenities ?? [],
      house_rules: house_rules ?? null,
      max_guests: max_guests ?? 1,
      instant_book: instant_book ?? false,
      status: "pending_review",
    }).select().single();

    if (propErr) return err(propErr.message);

    return ok({ property }, 201);
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
