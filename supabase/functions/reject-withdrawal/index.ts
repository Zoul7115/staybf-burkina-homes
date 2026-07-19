// ============================================================
// reject-withdrawal — Admin: pending/approved → cancelled
//
// Transitions: pending → cancelled | approved → cancelled
// Reverses ledger: writes payout_reversal to restore HOST_AVAILABLE
// Notifies host of cancellation
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { requireAnyRole, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

async function writeLedger(entries: unknown[]): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const res = await fetch(`${supabaseUrl}/functions/v1/write-ledger-entry`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(entries),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`write-ledger-entry failed: ${res.status} — ${body}`);
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const admin = await requireAnyRole(req, ["admin", "super_admin", "finance"]);
    const { payout_id, reason }: { payout_id: string; reason: string } = await req.json();

    if (!payout_id) return err("payout_id is required");
    if (!reason || reason.trim().length < 5) return err("reason must be at least 5 characters");

    const db = makeServiceClient();

    const { data: payout, error: fetchErr } = await db
      .from("payouts")
      .select("id, host_id, status, amount_fcfa, method")
      .eq("id", payout_id)
      .single();

    if (fetchErr || !payout) return err("Payout not found", 404);

    if (!["pending", "approved"].includes(payout.status)) {
      return err(
        `Cannot cancel payout in status '${payout.status}'. Only pending or approved payouts can be cancelled.`,
        409
      );
    }

    const { error: updateErr } = await db
      .from("payouts")
      .update({
        status:       "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: admin.id,
        cancel_reason: reason.trim(),
        updated_at:   new Date().toISOString(),
      })
      .eq("id", payout_id)
      .in("status", ["pending", "approved"]);  // Optimistic lock

    if (updateErr) return err(updateErr.message, 500);

    // Reverse the payout_debit ledger entry (restore HOST_AVAILABLE)
    await writeLedger([
      {
        id:            `payout-reversal-${payout_id}`,
        type:          "payout_reversal",
        debitWallet:   "host_withdrawn",
        creditWallet:  "host_available",
        amountFcfa:    payout.amount_fcfa,
        currency:      "XOF",
        payoutId:      payout_id,
        hostId:        payout.host_id,
        reference:     `REVERSAL-${payout_id.slice(0, 8).toUpperCase()}`,
        description:   `Annulation retrait — ${payout.amount_fcfa.toLocaleString("fr-FR")} FCFA restaurés`,
        metadata:      { reason: reason.trim(), cancelled_by: admin.id },
        createdAt:     new Date().toISOString(),
      },
    ]);

    // Audit
    await db.from("admin_actions").insert({
      admin_id:    admin.id,
      action_type: "withdrawal_rejected",
      target_type: "payout",
      target_id:   payout_id,
      reason:      reason.trim(),
    }).throwOnError().catch(() => undefined);

    // Notify host
    await db.from("notifications").insert({
      user_id: payout.host_id,
      type:    "payout_failed",
      title:   "Demande de retrait annulée",
      body:    `Votre demande de retrait de ${payout.amount_fcfa.toLocaleString("fr-FR")} FCFA a été annulée. Motif : ${reason.trim()}`,
      data:    { payout_id, amount_fcfa: payout.amount_fcfa, reason: reason.trim() },
    }).throwOnError().catch(() => undefined);

    return ok({ success: true, payout_id, status: "cancelled" });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
