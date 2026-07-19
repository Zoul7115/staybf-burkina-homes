// ============================================================
// complete-withdrawal — Admin: processing → paid
//
// Called by admin or provider webhook after successful payment.
// Writes a payout_paid ledger note (informational, no balance change —
// HOST_AVAILABLE was already debited at request time).
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
      .select("id, host_id, status, amount_fcfa, method")
      .eq("id", payout_id)
      .single();

    if (fetchErr || !payout) return err("Payout not found", 404);

    if (payout.status !== "processing") {
      return err(
        `Cannot complete payout in status '${payout.status}'. Only processing payouts can be marked as paid.`,
        409
      );
    }

    const { error: updateErr } = await db
      .from("payouts")
      .update({
        status:             "paid",
        paid_at:            new Date().toISOString(),
        provider_payout_id: provider_payout_id ?? null,
        updated_at:         new Date().toISOString(),
      })
      .eq("id", payout_id)
      .eq("status", "processing");  // Optimistic lock

    if (updateErr) return err(updateErr.message, 500);

    // Audit
    await db.from("admin_actions").insert({
      admin_id:    admin.id,
      action_type: "withdrawal_completed",
      target_type: "payout",
      target_id:   payout_id,
      reason:      note ?? `Retrait ${payout.amount_fcfa.toLocaleString("fr-FR")} FCFA marqué comme payé`,
    }).throwOnError().catch(() => undefined);

    // Notify host
    await db.from("notifications").insert({
      user_id: payout.host_id,
      type:    "payout_paid",
      title:   "Retrait effectué",
      body:    `Votre retrait de ${payout.amount_fcfa.toLocaleString("fr-FR")} FCFA a bien été versé sur votre compte ${payout.method}.`,
      data:    { payout_id, amount_fcfa: payout.amount_fcfa, method: payout.method },
    }).throwOnError().catch(() => undefined);

    return ok({ success: true, payout_id, status: "paid" });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
