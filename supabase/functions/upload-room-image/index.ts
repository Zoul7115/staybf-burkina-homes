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

    const { data: room } = await db
      .from("rooms")
      .select("id, property_id, properties!property_id(host_id)")
      .eq("id", room_id)
      .single();

    if (!room) return err("Room not found", 404);

    const prop = Array.isArray(room.properties) ? room.properties[0] : room.properties as { host_id: string } | null;
    if (!prop || prop.host_id !== user.id) return err("Forbidden", 403);

    const storagePath = `${room.property_id}/${room_id}/${crypto.randomUUID()}-${file_name}`;

    const { data: signedData, error: signedErr } = await db.storage
      .from("room-images")
      .createSignedUploadUrl(storagePath);

    if (signedErr || !signedData) return err("Failed to create upload URL");

    await db.rpc("register_storage_object", {
      p_bucket_id: "room-images",
      p_storage_path: storagePath,
      p_owner_id: user.id,
      p_mime_type: content_type,
      p_size_bytes: file_size_bytes ?? null,
    });

    const { data: imgRecord, error: imgErr } = await db.from("room_images").insert({
      room_id,
      storage_path: storagePath,
      is_cover: is_cover ?? false,
      position: 0,
    }).select().single();

    if (imgErr) return err(imgErr.message);

    return ok({ signedUrl: signedData.signedUrl, token: signedData.token, storagePath, image: imgRecord });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
