// ============================================================
// dispatch-withdrawal — Admin: approved → processing
//
// "Traiter" — dispatches approved payout to payment provider.
// Provider-agnostic: sets status=processing, records dispatched_at.
// The actual provider call is done by an external job/webhook.
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { requireAnyRole, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const admin = await requireAnyRole(req, ["admin", "super_admin", "finance"]);
    const {
      payout_id,
      provider_payout_id,
      note,
    }: { payout_id: string; provider_payout_id?: string; note?: string } = await req.json();

    if (!payout_id) return err("payout_id is required");

    const db = makeServiceClient();

    const { data: payout, error: fetchErr } = await db
      .from("payouts")
      .select("id, host_id, status, amount_fcfa, method, retry_count")
      .eq("id", payout_id)
      .single();

    if (fetchErr || !payout) return err("Payout not found", 404);

    if (payout.status !== "approved") {
      return err(
        `Cannot dispatch payout in status '${payout.status}'. Only approved payouts can be dispatched.`,
        409
      );
    }

    const { error: updateErr } = await db
      .from("payouts")
      .update({
        status:             "processing",
        dispatched_at:      new Date().toISOString(),
        provider_payout_id: provider_payout_id ?? null,
        updated_at:         new Date().toISOString(),
      })
      .eq("id", payout_id)
      .eq("status", "approved");  // Optimistic lock

    if (updateErr) return err(updateErr.message, 500);

    // Audit
    await db.from("admin_actions").insert({
      admin_id:    admin.id,
      action_type: "withdrawal_dispatched",
      target_type: "payout",
      target_id:   payout_id,
      reason:      note ?? `Retrait ${payout.amount_fcfa.toLocaleString("fr-FR")} FCFA dispatché`,
    }).throwOnError().catch(() => undefined);

    return ok({ success: true, payout_id, status: "processing" });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
