import { handleCors } from "../_shared/cors.ts";
import { requireRole, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireRole(req, "admin");
    const { user_ids, type, title, body, data } = await req.json();
    if (!user_ids || !Array.isArray(user_ids) || !type || !title) {
      return err("Missing required fields");
    }

    const db = makeServiceClient();

    const { error: insertErr } = await db.from("notifications").insert(
      user_ids.map((uid: string) => ({ user_id: uid, type, title, body: body ?? null, data: data ?? null }))
    );

    if (insertErr) return err(insertErr.message);

    return ok({ sent: user_ids.length });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
