import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const { room_id, file_name, content_type, file_size_bytes, is_cover } = await req.json();
    if (!room_id || !file_name || !content_type) return err("Missing required fields");

    const db = makeServiceClient();

    const { data: room } = await db.from("rooms").select("id, property_id, properties(host_id)").eq("id", room_id).single();
    if (!room) return err("Room not found", 404);
    if ((room.properties as { host_id: string }).host_id !== user.id) return err("Forbidden", 403);

    const storagePath = `${room.property_id}/${room_id}/${crypto.randomUUID()}-${file_name}`;

    const { data: signedData, error: signedErr } = await db.storage
      .from("room-images")
      .createSignedUploadUrl(storagePath);

    if (signedErr || !signedData) return err("Failed to create upload URL");

    await db.rpc("register_storage_object", {
      p_bucket: "room-images",
      p_path: storagePath,
      p_owner_id: user.id,
      p_file_size_bytes: file_size_bytes ?? 0,
      p_content_type: content_type,
    });

    const { data: imgRecord, error: imgErr } = await db.from("room_images").insert({
      room_id,
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
