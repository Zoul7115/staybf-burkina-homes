import { handleCors } from "../_shared/cors.ts";
import { requireRole, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const admin = await requireRole(req, "admin");
    const { payment_id, reason } = await req.json();
    if (!payment_id) return err("Missing payment_id");

    const db = makeServiceClient();

    const { data: payment } = await db.from("payments").select("id, status, amount_fcfa, cinetpay_transaction_id").eq("id", payment_id).single();
    if (!payment) return err("Payment not found", 404);
    if (payment.status !== "captured") return err("Payment cannot be refunded");

    // Mark as refunded in DB
    const { error: updateErr } = await db.from("payments").update({
      status: "refunded",
      refunded_at: new Date().toISOString(),
    }).eq("id", payment_id);

    if (updateErr) return err(updateErr.message);

    await db.from("admin_actions").insert({
      actor_id: admin.id,
      action_type: "refund_payment",
      target_table: "payments",
      target_id: payment_id,
      notes: reason ?? null,
    });

    return ok({ success: true });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
