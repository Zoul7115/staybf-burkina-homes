import { handleCors } from "../_shared/cors.ts";
import { requireRole, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const admin = await requireRole(req, "admin");
    const { property_id, reason } = await req.json();
    if (!property_id) return err("Missing property_id");
    if (!reason || reason.length < 10) return err("reason must be at least 10 characters");

    const db = makeServiceClient();

    const { data: property, error: fetchErr } = await db
      .from("properties")
      .select("id, host_id, status")
      .eq("id", property_id)
      .single();

    if (fetchErr || !property) return err("Property not found", 404);
    if (!["submitted", "under_review"].includes(property.status)) {
      return err(`Property cannot be approved from status: ${property.status}`);
    }

    const { error: updateErr } = await db.from("properties").update({
      status: "published",
      published_at: new Date().toISOString(),
    }).eq("id", property_id);

    if (updateErr) return err(updateErr.message);

    await db.from("admin_actions").insert({
      admin_id: admin.id,
      action_type: "property_unpublish",
      target_type: "property",
      target_id: property_id,
      reason,
      notes: "Property approved and published",
    });

    await db.from("notifications").insert({
      user_id: property.host_id,
      type: "property_approved",
      title: "Propriété approuvée",
      body: "Votre propriété est maintenant publiée et visible par les voyageurs.",
      data: { property_id },
    });

    return ok({ success: true });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
