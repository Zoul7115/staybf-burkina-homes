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
      name, description_md, type, city_id, address,
      latitude, longitude, amenities, house_rules, instant_book,
    } = body;

    if (!name || !type || !city_id) return err("Missing required fields: name, type, city_id");

    const db = makeServiceClient();

    // Verify host profile exists
    const { data: hostProfile } = await db.from("host_profiles").select("id").eq("id", user.id).maybeSingle();
    if (!hostProfile) return err("Host profile required. Complete your host profile first.", 403);

    // Generate slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now();

    const { data: property, error: propErr } = await db.from("properties").insert({
      host_id: user.id,
      name,
      slug,
      description_md: description_md ?? null,
      type,
      city_id,
      address: address ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      amenities: amenities ?? [],
      house_rules: house_rules ?? null,
      instant_book: instant_book ?? false,
      status: "draft",
    }).select().single();

    if (propErr) return err(propErr.message);

    return ok({ property }, 201);
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
