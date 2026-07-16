// ============================================================
// payout-status — Poll GaniPay for payout status
//
// Called by admin dashboard to refresh payout state.
// Syncs DB status from GaniPay if changed.
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { requireAnyRole, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

const GANIPAY_API_KEY = Deno.env.get("GANIPAY_API_KEY") ?? "";
const GANIPAY_ENV     = Deno.env.get("GANIPAY_ENV") ?? "sandbox";

const GANIPAY_BASE_URL = GANIPAY_ENV === "production"
  ? "https://api.ganipay.com/v1"
  : "https://sandbox.ganipay.com/v1";

const GANIPAY_STATUS_MAP: Record<string, string> = {
  pending:    "processing",
  processing: "processing",
  paid:       "paid",
  failed:     "failed",
  cancelled:  "failed",
};

const TERMINAL_PAYOUT_STATUSES = new Set(["paid", "failed", "cancelled", "reversed"]);

async function ganipayGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${GANIPAY_BASE_URL}${path}`, {
    headers: {
      "Authorization": `Bearer ${GANIPAY_API_KEY}`,
      "Accept":        "application/json",
    },
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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireAnyRole(req, ["admin", "super_admin", "finance"]);

    const url      = new URL(req.url);
    const payoutId = url.searchParams.get("payout_id");

    if (!payoutId) return err("payout_id is required");

    const db = makeServiceClient();

    const { data: payout, error: fetchErr } = await db
      .from("payouts")
      .select("id, host_id, status, amount_fcfa, method, provider_payout_id, provider")
      .eq("id", payoutId)
      .single();

    if (fetchErr || !payout) return err("Payout not found", 404);

    // Return cached status for terminal states
    if (TERMINAL_PAYOUT_STATUSES.has(payout.status) || payout.provider !== "ganipay" || !payout.provider_payout_id) {
      return ok({
        payout_id:  payout.id,
        status:     payout.status,
        provider:   payout.provider,
        polled:     false,
      });
    }

    // Poll GaniPay
    let newStatus = payout.status;
    let paidAt: string | null = null;
    let failureReason: string | null = null;

    try {
      const res = await ganipayGet(`/payouts/${payout.provider_payout_id}`);
      const rawStatus = res.status as string;
      newStatus       = GANIPAY_STATUS_MAP[rawStatus] ?? payout.status;
      paidAt          = (res.paid_at as string | null) ?? null;
      failureReason   = (res.failure_reason as string | null) ?? null;

      // Sync DB if status changed
      if (newStatus !== payout.status) {
        const updatePayload: Record<string, unknown> = {
          status:     newStatus,
          updated_at: new Date().toISOString(),
        };
        if (newStatus === "paid") {
          updatePayload.paid_at = paidAt ?? new Date().toISOString();
        } else if (newStatus === "failed") {
          updatePayload.failure_reason = failureReason;
        }

        await db.from("payouts").update(updatePayload).eq("id", payoutId);

        // Notify host if newly paid/failed
        if (newStatus === "paid") {
          await db.from("notifications").insert({
            user_id: payout.host_id,
            type:    "payout_paid",
            title:   "Retrait effectué",
            body:    `Votre retrait de ${(payout.amount_fcfa ?? 0).toLocaleString("fr-FR")} FCFA a bien été versé.`,
            data:    { payout_id: payout.id },
          }).catch(() => undefined);
        }
      }
    } catch {
      // Polling failure is non-fatal
    }

    return ok({
      payout_id:       payout.id,
      status:          newStatus,
      provider:        payout.provider,
      provider_payout_id: payout.provider_payout_id,
      paid_at:         paidAt,
      failure_reason:  failureReason,
      polled:          true,
    });

  } catch (e) {
    return err((e as Error).message, 500);
  }
});
