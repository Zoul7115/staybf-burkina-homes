import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const { image_id, table } = await req.json();
    if (!image_id || !["property_images", "room_images"].includes(table)) {
      return err("Missing or invalid fields");
    }

    const db = makeServiceClient();

    // Verify ownership through the property chain
    let storagePath: string | null = null;
    let bucket: string;

    if (table === "property_images") {
      const { data } = await db.from("property_images")
        .select("storage_path, properties(host_id)")
        .eq("id", image_id)
        .single();
      if (!data) return err("Image not found", 404);
      if ((data.properties as { host_id: string }).host_id !== user.id) return err("Forbidden", 403);
      storagePath = data.storage_path;
      bucket = "property-images";
    } else {
      const { data } = await db.from("room_images")
        .select("storage_path, rooms(properties(host_id))")
        .eq("id", image_id)
        .single();
      if (!data) return err("Image not found", 404);
      const hostId = ((data.rooms as { properties: { host_id: string } }).properties).host_id;
      if (hostId !== user.id) return err("Forbidden", 403);
      storagePath = data.storage_path;
      bucket = "room-images";
    }

    if (!storagePath) return err("Storage path missing");

    await db.storage.from(bucket).remove([storagePath]);
    await db.from(table).delete().eq("id", image_id);

    return ok({ success: true });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
