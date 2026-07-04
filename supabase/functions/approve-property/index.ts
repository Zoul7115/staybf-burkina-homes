import { handleCors } from "../_shared/cors.ts";
import { requireRole, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const admin = await requireRole(req, "admin");
    const { property_id, notes } = await req.json();
    if (!property_id) return err("Missing property_id");

    const db = makeServiceClient();

    const { data: property, error: fetchErr } = await db.from("properties").select("id, host_id, status").eq("id", property_id).single();
    if (fetchErr || !property) return err("Property not found", 404);

    const { error: updateErr } = await db.from("properties").update({ status: "active" }).eq("id", property_id);
    if (updateErr) return err(updateErr.message);

    await db.from("admin_actions").insert({
      actor_id: admin.id,
      action_type: "approve_property",
      target_table: "properties",
      target_id: property_id,
      notes: notes ?? null,
    });

    await db.from("notifications").insert({
      user_id: property.host_id,
      type: "property_approved",
      title: "Propriété approuvée",
      body: "Votre propriété a été approuvée et est maintenant visible.",
      data: { property_id },
    });

    return ok({ success: true });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
