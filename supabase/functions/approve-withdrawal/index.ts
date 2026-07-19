// ============================================================
// approve-withdrawal — Admin: pending → approved
//
// Validates: admin role, payout exists, status = pending
// Transitions: pending → approved
// Writes: approval timestamp, approved_by, notification to host
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { requireAnyRole, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const admin = await requireAnyRole(req, ["admin", "super_admin", "finance"]);
    const { payout_id, note }: { payout_id: string; note?: string } = await req.json();

    if (!payout_id) return err("payout_id is required");

    const db = makeServiceClient();

    const { data: payout, error: fetchErr } = await db
      .from("payouts")
      .select("id, host_id, status, amount_fcfa, method")
      .eq("id", payout_id)
      .single();

    if (fetchErr || !payout) return err("Payout not found", 404);

    if (payout.status !== "pending") {
      return err(`Cannot approve payout in status '${payout.status}'. Only 'pending' payouts can be approved.`, 409);
    }

    const { error: updateErr } = await db
      .from("payouts")
      .update({
        status:      "approved",
        approved_at: new Date().toISOString(),
        approved_by: admin.id,
        updated_at:  new Date().toISOString(),
      })
      .eq("id", payout_id)
      .eq("status", "pending");  // Optimistic lock

    if (updateErr) return err(updateErr.message, 500);

    // Audit
    await db.from("admin_actions").insert({
      admin_id:    admin.id,
      action_type: "withdrawal_approved",
      target_type: "payout",
      target_id:   payout_id,
      reason:      note ?? `Retrait de ${payout.amount_fcfa.toLocaleString("fr-FR")} FCFA approuvé`,
    }).throwOnError().catch(() => undefined);

    // Notify host
    await db.from("notifications").insert({
      user_id: payout.host_id,
      type:    "payout_initiated",
      title:   "Retrait approuvé",
      body:    `Votre demande de retrait de ${payout.amount_fcfa.toLocaleString("fr-FR")} FCFA a été approuvée et est en cours de traitement.`,
      data:    { payout_id, amount_fcfa: payout.amount_fcfa, method: payout.method },
    }).throwOnError().catch(() => undefined);

    return ok({ success: true, payout_id, status: "approved" });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
