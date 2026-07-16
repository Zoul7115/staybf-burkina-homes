// ============================================================
// payout-dispatch — Send an approved payout to GaniPay
//
// Called by admin after approving a withdrawal request.
// Bridges dispatch-withdrawal (state: approved → processing)
// with the actual GaniPay /payouts API call.
//
// Flow:
//   1. Admin auth
//   2. Verify payout exists + status = approved
//   3. Fetch host payout_account details
//   4. Call GaniPay /payouts
//   5. Update payout: status=processing, provider_payout_id
//   6. Audit log
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { requireAnyRole, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";
import { createLogger, generateRequestId } from "../_shared/logger.ts";

const GANIPAY_API_KEY = Deno.env.get("GANIPAY_API_KEY") ?? "";
const GANIPAY_ENV     = Deno.env.get("GANIPAY_ENV") ?? "sandbox";

if (GANIPAY_ENV === "production" && !GANIPAY_API_KEY) {
  throw new Error("GANIPAY_API_KEY must be set in production");
}

const GANIPAY_BASE_URL = GANIPAY_ENV === "production"
  ? "https://api.ganipay.com/v1"
  : "https://sandbox.ganipay.com/v1";

async function ganipayPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${GANIPAY_BASE_URL}${path}`, {
    method:  "POST",
    signal:  AbortSignal.timeout(15_000),
    headers: {
      "Authorization": `Bearer ${GANIPAY_API_KEY}`,
      "Content-Type":  "application/json",
      "Accept":        "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`GaniPay returned non-JSON: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error((json.message ?? json.error ?? `GaniPay error ${res.status}`) as string);
  }

  return json;
}

function parseAccountDetails(raw: string): { phone?: string; account?: string; code?: string } {
  try { return JSON.parse(raw); } catch { return { phone: raw }; }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = generateRequestId();
  const log = createLogger("payout-dispatch", requestId);

  try {
    const admin = await requireAnyRole(req, ["admin", "super_admin", "finance"]);
    const { payout_id, note }: { payout_id: string; note?: string } = await req.json();

    if (!payout_id) return err("payout_id is required");

    const db = makeServiceClient();

    // ── Fetch payout ──────────────────────────────────────────

    const { data: payout, error: fetchErr } = await db
      .from("payouts")
      .select("id, host_id, status, amount_fcfa, method, payout_account_snapshot")
      .eq("id", payout_id)
      .single();

    if (fetchErr || !payout) return err("Payout not found", 404);

    if (payout.status !== "approved") {
      return err(`Cannot dispatch payout in status '${payout.status}'. Only approved payouts can be dispatched.`, 409);
    }

    // ── Get host contact info ──────────────────────────────────

    const { data: profile } = await db
      .from("profiles")
      .select("full_name, email")
      .eq("id", payout.host_id)
      .single();

    const accountDetails  = parseAccountDetails(payout.payout_account_snapshot);
    const idempotencyKey  = `payout-${payout_id}`;

    // ── Call GaniPay /payouts ──────────────────────────────────

    let ganipayResponse: Record<string, unknown>;
    try {
      const body: Record<string, unknown> = {
        reference:       idempotencyKey,
        amount:          payout.amount_fcfa,
        currency:        "XOF",
        method:          payout.method,
        description:     `Retrait hôte ${payout.host_id.slice(0, 8)} — ${payout.amount_fcfa.toLocaleString("fr-FR")} FCFA`,
        idempotency_key: idempotencyKey,
        metadata: {
          payout_id:  payout_id,
          host_id:    payout.host_id,
          host_name:  profile?.full_name ?? null,
        },
      };

      if (payout.method === "bank") {
        body.bank_account = accountDetails.account ?? payout.payout_account_snapshot;
        body.bank_code    = accountDetails.code ?? null;
      } else {
        body.phone = accountDetails.phone ?? payout.payout_account_snapshot;
      }

      ganipayResponse = await ganipayPost("/payouts", body);
    } catch (e) {
      // Mark as failed if GaniPay rejects
      await db.from("payouts").update({
        status:         "failed",
        failure_reason: (e as Error).message,
        updated_at:     new Date().toISOString(),
      }).eq("id", payout_id).eq("status", "approved");

      log.error("GaniPay /payouts call failed", e, { payout_id });

      // Audit the GaniPay failure
      await db.from("admin_actions").insert({
        admin_id:    admin.id,
        action_type: "withdrawal_dispatch_failed",
        target_type: "payout",
        target_id:   payout_id,
        reason:      `GaniPay a rejeté le virement : ${(e as Error).message}`,
      }).catch(() => undefined);

      return err(`GaniPay error: ${(e as Error).message}`, 502);
    }

    const providerPayoutId = ganipayResponse.id as string;

    // ── Update payout: approved → processing ──────────────────

    const { error: updateErr } = await db.from("payouts").update({
      status:             "processing",
      dispatched_at:      new Date().toISOString(),
      provider_payout_id: providerPayoutId,
      provider:           "ganipay",
      updated_at:         new Date().toISOString(),
    }).eq("id", payout_id).eq("status", "approved");

    if (updateErr) return err(updateErr.message, 500);

    // ── Audit ──────────────────────────────────────────────────

    await db.from("admin_actions").insert({
      admin_id:    admin.id,
      action_type: "withdrawal_dispatched",
      target_type: "payout",
      target_id:   payout_id,
      reason:      note ?? `Retrait ${payout.amount_fcfa.toLocaleString("fr-FR")} FCFA dispatché via GaniPay (${providerPayoutId})`,
    }).throwOnError().catch(() => undefined);

    log.end("ok", { payout_id, provider_payout_id: providerPayoutId });

    return ok({
      success:            true,
      payout_id,
      status:             "processing",
      provider_payout_id: providerPayoutId,
    });

  } catch (e) {
    log.error("payout-dispatch unhandled error", e);
    return err((e as Error).message, 500);
  }
});
