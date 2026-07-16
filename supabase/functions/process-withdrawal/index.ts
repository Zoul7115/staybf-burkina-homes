// ============================================================
// process-withdrawal — Host-initiated withdrawal request
//
// 14-step validated withdrawal creation:
//  1.  Verify JWT
//  2.  Verify KYC
//  3.  Verify payout_method
//  4.  Verify payout_account
//  5.  Verify available balance
//  6.  Verify minimum withdrawal amount
//  7.  Verify daily cap
//  8.  Verify monthly cap
//  9.  Create payout (status=pending, idempotent)
// 10.  Create payout_items (eligible completed bookings)
// 11.  Write ledger entry (payout_debit: HOST_AVAILABLE → HOST_WITHDRAWN)
// 12.  Create audit log
// 13.  Create notification
// 14.  Return coherent state
//
// Provider-agnostic — no GaniPay/CinetPay calls here.
// Ledger entry written immediately to reserve funds.
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

const MINIMUM_WITHDRAWAL_FCFA = 5_000;
const DAILY_LIMIT_FCFA        = 500_000;
const MONTHLY_LIMIT_FCFA      = 5_000_000;

// ── Helpers ────────────────────────────────────────────────────

function todayStart(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function monthStart(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function monthEnd(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

function periodStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function periodEnd(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

// Call write-ledger-entry using service role (not user JWT)
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

// ── Main handler ───────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

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

    // ── Idempotency guard: prevent double-submit ────────────────
    if (idempotency_key) {
      const { data: existing } = await db
        .from("payouts")
        .select("id, status, amount_fcfa")
        .eq("host_id", hostId)
        .eq("cancel_reason", `idem:${idempotency_key}`)  // store key in cancel_reason as metadata
        .maybeSingle();

      if (existing) {
        return ok({ payout: existing, idempotent: true });
      }
    }

    // ── Step 2: Verify KYC ──────────────────────────────────────
    const { data: hostProfile, error: profileErr } = await db
      .from("host_profiles")
      .select("id, status, payout_method, payout_account")
      .eq("id", hostId)
      .maybeSingle();

    if (profileErr || !hostProfile) {
      return err("Profil hôte introuvable", 404);
    }

    const { data: profile } = await db
      .from("profiles")
      .select("kyc_status, account_status")
      .eq("id", hostId)
      .single();

    if (!profile) {
      return err("Profil utilisateur introuvable", 404);
    }

    if (profile.kyc_status !== "verified") {
      return err(
        "Votre compte doit être vérifié (KYC) avant de pouvoir effectuer un retrait.",
        403
      );
    }

    if (profile.account_status !== "active") {
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

    // ── Step 5: Verify available balance ────────────────────────
    const { data: ledgerRows, error: ledgerErr } = await db
      .from("wallet_ledger")
      .select("debit_account, credit_account, amount_fcfa")
      .eq("host_id", hostId);

    if (ledgerErr) {
      return err("Impossible de calculer le solde disponible", 500);
    }

    const balanceMap: Record<string, number> = {};
    for (const row of (ledgerRows ?? [])) {
      if (row.credit_account) {
        balanceMap[row.credit_account] = (balanceMap[row.credit_account] ?? 0) + row.amount_fcfa;
      }
      if (row.debit_account) {
        balanceMap[row.debit_account] = Math.max(
          0,
          (balanceMap[row.debit_account] ?? 0) - row.amount_fcfa
        );
      }
    }

    const availableBalance = balanceMap["HOST_AVAILABLE"] ?? 0;

    // ── Step 6: Verify minimum withdrawal ───────────────────────
    if (amount_fcfa < MINIMUM_WITHDRAWAL_FCFA) {
      return err(
        `Le montant minimum de retrait est de ${MINIMUM_WITHDRAWAL_FCFA.toLocaleString("fr-FR")} FCFA.`,
        400
      );
    }

    if (amount_fcfa > availableBalance) {
      return err(
        `Solde disponible insuffisant. Solde : ${availableBalance.toLocaleString("fr-FR")} FCFA.`,
        400
      );
    }

    // ── Step 7: Verify daily cap ────────────────────────────────
    const { data: todayPayouts } = await db
      .from("payouts")
      .select("amount_fcfa")
      .eq("host_id", hostId)
      .not("status", "in", '("cancelled","reversed")')
      .gte("created_at", todayStart());

    const todayTotal = (todayPayouts ?? []).reduce(
      (s: number, p: { amount_fcfa: number }) => s + p.amount_fcfa,
      0
    );

    if (todayTotal + amount_fcfa > DAILY_LIMIT_FCFA) {
      const remaining = Math.max(0, DAILY_LIMIT_FCFA - todayTotal);
      return err(
        `Plafond journalier atteint. Il vous reste ${remaining.toLocaleString("fr-FR")} FCFA disponibles aujourd'hui.`,
        400
      );
    }

    // ── Step 8: Verify monthly cap ──────────────────────────────
    const { data: monthPayouts } = await db
      .from("payouts")
      .select("amount_fcfa")
      .eq("host_id", hostId)
      .not("status", "in", '("cancelled","reversed")')
      .gte("created_at", monthStart())
      .lte("created_at", monthEnd());

    const monthTotal = (monthPayouts ?? []).reduce(
      (s: number, p: { amount_fcfa: number }) => s + p.amount_fcfa,
      0
    );

    if (monthTotal + amount_fcfa > MONTHLY_LIMIT_FCFA) {
      const remaining = Math.max(0, MONTHLY_LIMIT_FCFA - monthTotal);
      return err(
        `Plafond mensuel atteint. Il vous reste ${remaining.toLocaleString("fr-FR")} FCFA disponibles ce mois.`,
        400
      );
    }

    // ── Step 9: Create payout ────────────────────────────────────
    const { data: payout, error: payoutErr } = await db
      .from("payouts")
      .insert({
        host_id:                hostId,
        status:                 "pending",
        amount_fcfa:            amount_fcfa,
        currency:               "XOF",
        method:                 method,
        payout_account_snapshot: String(hostProfile.payout_account),
        provider:               "manual",
        period_start:           periodStart(),
        period_end:             periodEnd(),
        retry_count:            0,
        // Store idempotency key in cancel_reason temporarily (overwritten if cancelled)
        ...(idempotency_key ? { cancel_reason: `idem:${idempotency_key}` } : {}),
      })
      .select("id, status, amount_fcfa, method, period_start, period_end, created_at")
      .single();

    if (payoutErr || !payout) {
      return err(payoutErr?.message ?? "Impossible de créer la demande de retrait", 500);
    }

    const payoutId: string = payout.id;

    // ── Step 10: Create payout_items ────────────────────────────
    // Find completed bookings whose funds are now in HOST_AVAILABLE
    // and haven't been allocated to another non-cancelled payout.
    const { data: eligibleLedger } = await db
      .from("wallet_ledger")
      .select("booking_id, amount_fcfa")
      .eq("host_id", hostId)
      .eq("entry_type", "booking_completed_release")
      .eq("credit_account", "HOST_AVAILABLE")
      .not("booking_id", "is", null);

    // Get already-allocated booking IDs (non-cancelled/reversed payouts)
    const { data: allocatedItems } = await db
      .from("payout_items")
      .select("booking_id")
      .in(
        "payout_id",
        (await db
          .from("payouts")
          .select("id")
          .eq("host_id", hostId)
          .not("status", "in", '("cancelled","reversed")')
          .neq("id", payoutId)
        ).data?.map((p: { id: string }) => p.id) ?? []
      );

    const allocatedBookingIds = new Set(
      (allocatedItems ?? []).map((i: { booking_id: string }) => i.booking_id)
    );

    // Accumulate bookings up to withdrawal amount (FIFO)
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

    // ── Step 11: Write ledger entry ──────────────────────────────
    // Immediately debit HOST_AVAILABLE → HOST_WITHDRAWN to reserve funds.
    // If the withdrawal is cancelled, a payout_reversal entry will restore them.
    const ledgerEntryId = `payout-debit-${payoutId}`;
    await writeLedger([
      {
        id:            ledgerEntryId,
        type:          "payout_debit",
        debitWallet:   "host_available",
        creditWallet:  "host_withdrawn",
        amountFcfa:    amount_fcfa,
        currency:      "XOF",
        payoutId,
        hostId,
        reference:     `PAYOUT-${payoutId.slice(0, 8).toUpperCase()}`,
        description:   `Demande de retrait — ${amount_fcfa.toLocaleString("fr-FR")} FCFA (${method})`,
        metadata:      { method, period_start: periodStart(), period_end: periodEnd() },
        createdAt:     new Date().toISOString(),
      },
    ]);

    // ── Step 12: Create audit log ────────────────────────────────
    await db.from("admin_actions").insert({
      admin_id:    hostId,
      action_type: "withdrawal_requested",
      target_type: "payout",
      target_id:   payoutId,
      reason:      `Demande de retrait de ${amount_fcfa.toLocaleString("fr-FR")} FCFA via ${method}`,
    }).throwOnError().catch(() => undefined);  // Non-blocking

    // ── Step 13: Create notification ────────────────────────────
    await db.from("notifications").insert({
      user_id:   hostId,
      type:      "payout_initiated",
      title:     "Demande de retrait reçue",
      body:      `Votre demande de retrait de ${amount_fcfa.toLocaleString("fr-FR")} FCFA est en cours de traitement.`,
      data:      { payout_id: payoutId, amount_fcfa, method },
    }).throwOnError().catch(() => undefined);  // Non-blocking

    // ── Step 14: Return coherent state ──────────────────────────
    return ok({
      success:          true,
      payout:           { ...payout, id: payoutId },
      available_before: availableBalance,
      available_after:  availableBalance - amount_fcfa,
      items_count:      items.length,
    }, 201);

  } catch (e) {
    return err((e as Error).message, 500);
  }
});
