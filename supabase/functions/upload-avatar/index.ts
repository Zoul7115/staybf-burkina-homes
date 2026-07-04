import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireAuth(req);
    const { file_name, content_type, file_size_bytes } = await req.json();
    if (!file_name || !content_type) return err("Missing required fields");

    const db = makeServiceClient();
    const storagePath = `${user.id}/${crypto.randomUUID()}-${file_name}`;

    const { data: signedData, error: signedErr } = await db.storage
      .from("avatars")
      .createSignedUploadUrl(storagePath);

    if (signedErr || !signedData) return err("Failed to create upload URL");

    await db.rpc("register_storage_object", {
      p_bucket_id: "avatars",
      p_storage_path: storagePath,
      p_owner_id: user.id,
      p_mime_type: content_type,
      p_size_bytes: file_size_bytes ?? null,
    });

    return ok({ signedUrl: signedData.signedUrl, token: signedData.token, storagePath });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
