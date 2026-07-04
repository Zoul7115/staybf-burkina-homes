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
    if (!reason || reason.length < 10) return err("reason must be at least 10 characters");

    const db = makeServiceClient();

    const { data: payment } = await db
      .from("payments")
      .select("id, status, amount_fcfa, cinetpay_transaction_id")
      .eq("id", payment_id)
      .single();

    if (!payment) return err("Payment not found", 404);
    if (payment.status !== "captured") return err("Only captured payments can be refunded");

    // Transition: captured → refund_pending → (async) refunded
    const { error: updateErr } = await db.from("payments").update({
      status: "refund_pending",
    }).eq("id", payment_id);

    if (updateErr) return err(updateErr.message);

    await db.from("admin_actions").insert({
      admin_id: admin.id,
      action_type: "refund_issue",
      target_type: "payment",
      target_id: payment_id,
      reason,
    });

    return ok({ success: true, status: "refund_pending" });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
