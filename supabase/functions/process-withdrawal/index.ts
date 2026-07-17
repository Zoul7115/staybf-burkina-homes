// ============================================================
// process-withdrawal — Host-initiated withdrawal request
//
// Steps:
//  1.  Verify JWT
//  2.  Verify KYC + account status
//  3.  Verify payout_method match
//  4.  Verify payout_account exists
//  5-11. create_withdrawal_atomic RPC — ATOMIC:
//        - Advisory lock (per host) prevents double-spend
//        - Balance check
//        - Daily + monthly cap checks
//        - INSERT payout (status=pending)
//        - INSERT ledger debit (HOST_AVAILABLE → HOST_WITHDRAWN)
// 12. Create payout_items (eligible completed bookings)
// 13. Create audit log
// 14. Create notification
// 15. Return coherent state
//
// Provider-agnostic — no GaniPay calls here.
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";
import { createLogger, generateRequestId } from "../_shared/logger.ts";

// ── Date helpers ───────────────────────────────────────────────

function periodStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function periodEnd(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

// ── Main handler ───────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = generateRequestId();
  const log = createLogger("process-withdrawal", requestId);

  try {
    // ── Step 1: Verify JWT ──────────────────────────────────────
    const user = await requireAuth(req);
    const hostId = user.id;

    const {
      amount_fcfa,
      method,
      idempotency_key,
    }: { amount_fcfa: number; method: string; idempotency_key?: string } = await req.json();

    if (!amount_fcfa || !method) {
      return err("amount_fcfa and method are required");
    }

    const db = makeServiceClient();
    log.info("withdrawal request received", { host_id: hostId, amount_fcfa, method });

    // ── Idempotency guard ───────────────────────────────────────
    if (idempotency_key) {
      const { data: existing } = await db
        .from("payouts")
        .select("id, status, amount_fcfa")
        .eq("host_id", hostId)
        .eq("cancel_reason", `idem:${idempotency_key}`)
        .maybeSingle();

      if (existing) {
        log.info("idempotent withdrawal — returning cached result", { payout_id: existing.id });
        return ok({ payout: existing, idempotent: true });
      }
    }

    // ── Step 2: Verify KYC ──────────────────────────────────────
    const [{ data: hostProfile, error: profileErr }, { data: profile }] = await Promise.all([
      db.from("host_profiles")
        .select("id, status, payout_method, payout_account")
        .eq("id", hostId)
        .maybeSingle(),
      db.from("profiles")
        .select("kyc_status, account_status")
        .eq("id", hostId)
        .single(),
    ]);

    if (profileErr || !hostProfile) return err("Profil hôte introuvable", 404);
    if (!profile) return err("Profil utilisateur introuvable", 404);

    if (profile.kyc_status !== "verified") {
      log.warn("KYC not verified", { host_id: hostId, kyc_status: profile.kyc_status });
      return err(
        "Votre compte doit être vérifié (KYC) avant de pouvoir effectuer un retrait.",
        403
      );
    }

    if (profile.account_status !== "active") {
      log.warn("Account suspended", { host_id: hostId });
      return err("Votre compte est suspendu. Contactez le support.", 403);
    }

    // ── Step 3: Verify payout_method ────────────────────────────
    if (!hostProfile.payout_method) {
      return err(
        "Veuillez renseigner un compte de paiement (Orange Money, Moov Money ou compte bancaire) dans vos paramètres.",
        400
      );
    }

    if (hostProfile.payout_method !== method) {
      return err(
        `La méthode de retrait sélectionnée (${method}) ne correspond pas à votre compte enregistré (${hostProfile.payout_method}).`,
        400
      );
    }

    // ── Step 4: Verify payout_account ───────────────────────────
    if (!hostProfile.payout_account) {
      return err(
        "Veuillez renseigner les détails de votre compte de paiement dans vos paramètres.",
        400
      );
    }

    // ── Steps 5-11: ATOMIC balance check + payout + ledger debit ──────────────
    // The RPC acquires a per-host advisory lock, reads balance from wallet_ledger,
    // validates caps, inserts the payout row AND the ledger debit in a single
    // PostgreSQL transaction. This prevents concurrent withdrawals from both
    // passing the balance check before either writes the debit.

    const { data: rpcData, error: rpcErr } = await db.rpc("create_withdrawal_atomic", {
      p_host_id:                 hostId,
      p_amount_fcfa:             amount_fcfa,
      p_method:                  method,
      p_payout_account_snapshot: String(hostProfile.payout_account),
      p_period_start:            periodStart(),
      p_period_end:              periodEnd(),
      p_idempotency_key:         idempotency_key ?? null,
    });

    if (rpcErr) {
      log.error("create_withdrawal_atomic RPC failed", rpcErr, { host_id: hostId });
      return err(rpcErr.message, 500);
    }

    const rpcResult = rpcData as Record<string, unknown>;

    // Handle business-rule errors returned by the RPC
    if (rpcResult.error) {
      const code = rpcResult.error as string;
      log.warn("withdrawal rejected by RPC", { code, host_id: hostId, amount_fcfa });

      switch (code) {
        case "MINIMUM":
          return err("Le montant minimum de retrait est de 5 000 FCFA.", 400);
        case "INSUFFICIENT": {
          const avail = (rpcResult.available_balance as number | undefined) ?? 0;
          return err(
            `Solde disponible insuffisant. Solde : ${avail.toLocaleString("fr-FR")} FCFA.`,
            400
          );
        }
        case "DAILY_CAP": {
          const rem = (rpcResult.remaining as number | undefined) ?? 0;
          return err(
            `Plafond journalier atteint. Il vous reste ${rem.toLocaleString("fr-FR")} FCFA disponibles aujourd'hui.`,
            400
          );
        }
        case "MONTHLY_CAP": {
          const rem = (rpcResult.remaining as number | undefined) ?? 0;
          return err(
            `Plafond mensuel atteint. Il vous reste ${rem.toLocaleString("fr-FR")} FCFA disponibles ce mois.`,
            400
          );
        }
        default:
          return err(`Retrait refusé : ${code}`, 400);
      }
    }

    const payoutId        = rpcResult.payout_id as string;
    const availableBalance = rpcResult.available_balance as number;

    log.info("payout created atomically", { payout_id: payoutId, host_id: hostId, amount_fcfa });

    // ── Step 12: Create payout_items ────────────────────────────
    // Find completed bookings whose funds are in HOST_AVAILABLE and haven't
    // been allocated to another non-cancelled payout.

    const { data: eligibleLedger } = await db
      .from("wallet_ledger")
      .select("booking_id, amount_fcfa")
      .eq("host_id", hostId)
      .eq("entry_type", "booking_completed_release")
      .eq("credit_account", "HOST_AVAILABLE")
      .not("booking_id", "is", null);

    const { data: allocatedPayouts } = await db
      .from("payouts")
      .select("id")
      .eq("host_id", hostId)
      .not("status", "in", '("cancelled","reversed")')
      .neq("id", payoutId);

    const allocatedPayoutIds = (allocatedPayouts ?? []).map((p: { id: string }) => p.id);
    let allocatedBookingIds = new Set<string>();

    if (allocatedPayoutIds.length > 0) {
      const { data: allocatedItems } = await db
        .from("payout_items")
        .select("booking_id")
        .in("payout_id", allocatedPayoutIds);

      allocatedBookingIds = new Set(
        (allocatedItems ?? []).map((i: { booking_id: string }) => i.booking_id)
      );
    }

    const eligible = (eligibleLedger ?? [])
      .filter((r: { booking_id: string }) => !allocatedBookingIds.has(r.booking_id))
      .sort((a: { amount_fcfa: number }, b: { amount_fcfa: number }) => a.amount_fcfa - b.amount_fcfa);

    let remaining = amount_fcfa;
    const items: { payout_id: string; booking_id: string; amount_fcfa: number }[] = [];

    for (const row of eligible as { booking_id: string; amount_fcfa: number }[]) {
      if (remaining <= 0) break;
      const alloc = Math.min(row.amount_fcfa, remaining);
      if (alloc > 0 && row.booking_id) {
        items.push({ payout_id: payoutId, booking_id: row.booking_id, amount_fcfa: alloc });
        remaining -= alloc;
      }
    }

    if (items.length > 0) {
      await db.from("payout_items").insert(items);
    }

    // ── Step 13: Audit log ───────────────────────────────────────
    await db.from("admin_actions").insert({
      admin_id:    hostId,
      action_type: "withdrawal_requested",
      target_type: "payout",
      target_id:   payoutId,
      reason:      `Demande de retrait de ${amount_fcfa.toLocaleString("fr-FR")} FCFA via ${method}`,
    }).throwOnError().catch(() => undefined);

    // ── Step 14: Notification ────────────────────────────────────
    await db.from("notifications").insert({
      user_id: hostId,
      type:    "payout_initiated",
      title:   "Demande de retrait reçue",
      body:    `Votre demande de retrait de ${amount_fcfa.toLocaleString("fr-FR")} FCFA est en cours de traitement.`,
      data:    { payout_id: payoutId, amount_fcfa, method },
    }).throwOnError().catch(() => undefined);

    log.end("ok", { payout_id: payoutId, amount_fcfa, items_count: items.length });

    // ── Step 15: Return coherent state ───────────────────────────
    return ok({
      success:          true,
      payout:           { id: payoutId, status: "pending", amount_fcfa, method },
      available_before: availableBalance,
      available_after:  availableBalance - amount_fcfa,
      items_count:      items.length,
    }, 201);

  } catch (e) {
    log.error("unhandled error", e);
    return err((e as Error).message, 500);
  }
});
