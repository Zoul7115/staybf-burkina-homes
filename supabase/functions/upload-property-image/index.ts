import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const { property_id, file_name, content_type, file_size_bytes, is_cover } = await req.json();
    if (!property_id || !file_name || !content_type) return err("Missing required fields");

    const db = makeServiceClient();

    // Verify ownership
    const { data: prop } = await db.from("properties").select("host_id").eq("id", property_id).single();
    if (!prop || prop.host_id !== user.id) return err("Forbidden", 403);

    const storagePath = `${property_id}/${crypto.randomUUID()}-${file_name}`;

    // Create signed upload URL
    const { data: signedData, error: signedErr } = await db.storage
      .from("property-images")
      .createSignedUploadUrl(storagePath);

    if (signedErr || !signedData) return err("Failed to create upload URL");

    // Register storage object
    await db.rpc("register_storage_object", {
      p_bucket: "property-images",
      p_path: storagePath,
      p_owner_id: user.id,
      p_file_size_bytes: file_size_bytes ?? 0,
      p_content_type: content_type,
    });

    // Insert property_images record
    const { data: imgRecord, error: imgErr } = await db.from("property_images").insert({
      property_id,
      storage_path: storagePath,
      is_cover: is_cover ?? false,
      display_order: 0,
    }).select().single();

    if (imgErr) return err(imgErr.message);

    return ok({ signedUrl: signedData.signedUrl, token: signedData.token, storagePath, image: imgRecord });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
