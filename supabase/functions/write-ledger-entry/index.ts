// ============================================================
// write-ledger-entry — persist ledger entries to wallet_ledger
//
// Internal Edge Function: ONLY called service-to-service.
// Client calls are rejected (no anon/authenticated access).
//
// Idempotent: retries with the same entry_id are silently ignored
// (ON CONFLICT DO NOTHING on the PK).
//
// Validation: runs validateLedgerEntries before any write.
// For transfer entries (both debit + credit), asserts Σcredit = Σdebit.
// For credit-only batches (booking confirmations), skips balance check.
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";
import { validateLedgerEntries } from "../_shared/validate-ledger.ts";
import { createLogger, generateRequestId } from "../_shared/logger.ts";

// Map TypeScript LedgerWallet → DB app_ledger_account enum values
const WALLET_TO_ACCOUNT: Record<string, string> = {
  host_pending:        "HOST_PENDING",
  host_available:      "HOST_AVAILABLE",
  host_withdrawn:      "HOST_WITHDRAWN",
  platform_pending:    "PLATFORM_PENDING",
  platform_available:  "PLATFORM_AVAILABLE",
  platform_withdrawn:  "PLATFORM_WITHDRAWN",
  escrow:              "ESCROW",
  refunds:             "REFUNDS",
  fees:                "FEES",
  taxes:               "TAXES",
};

const ENTRY_TYPE_MAP: Record<string, string> = {
  booking_accommodation_credit:  "booking_accommodation_credit",
  booking_commission_credit:     "booking_commission_credit",
  booking_service_fee_credit:    "booking_service_fee_credit",
  booking_completed_release:     "booking_completed_release",
  booking_cancelled_reversal:    "booking_cancelled_reversal",
  payout_debit:                  "payout_debit",
  payout_reversal:               "payout_reversal",
  refund_accommodation_debit:    "refund_accommodation_debit",
  refund_commission_debit:       "refund_commission_debit",
  refund_service_fee_debit:      "refund_service_fee_debit",
  manual_adjustment:             "manual_adjustment",
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = generateRequestId();
  const log = createLogger("write-ledger-entry", requestId);

  // Only service-to-service calls accepted: verify Bearer token matches the service role key
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!authHeader.startsWith("Bearer ") || authHeader.slice(7) !== serviceKey) {
    log.warn("Unauthorized write-ledger-entry call");
    return err("Unauthorized", 401);
  }

  try {
    const body = await req.json();
    const rawEntries: unknown[] = Array.isArray(body) ? body : [body];

    if (rawEntries.length === 0) return err("No entries provided");
    if (rawEntries.length > 100) return err("Batch too large (max 100)");

    const db = makeServiceClient();

    // ── Map to DB rows ────────────────────────────────────────

    const rows = rawEntries.map((raw: unknown) => {
      const e = raw as Record<string, unknown>;

      const entryType = ENTRY_TYPE_MAP[e.type as string];
      if (!entryType) throw new Error(`Unknown entry type: "${e.type}"`);

      const debitAccount  = e.debitWallet  ? (WALLET_TO_ACCOUNT[e.debitWallet  as string] ?? null) : null;
      const creditAccount = e.creditWallet ? (WALLET_TO_ACCOUNT[e.creditWallet as string] ?? null) : null;

      if (!debitAccount && !creditAccount) {
        throw new Error("Entry must have at least one account (debit or credit)");
      }

      const amountFcfa = e.amountFcfa as number;
      if (!amountFcfa || amountFcfa <= 0) {
        throw new Error(`Entry amount must be positive, got ${amountFcfa}`);
      }

      return {
        id:             e.id as string,
        entry_type:     entryType,
        debit_account:  debitAccount,
        credit_account: creditAccount,
        amount_fcfa:    amountFcfa,
        currency:       "XOF",
        booking_id:     (e.bookingId  as string | undefined) ?? null,
        payout_id:      (e.payoutId   as string | undefined) ?? null,
        refund_id:      (e.refundId   as string | undefined) ?? null,
        host_id:        (e.hostId     as string | undefined) ?? null,
        reference:      e.reference   as string,
        description:    e.description as string,
        metadata:       (e.metadata   as Record<string, unknown>) ?? {},
        created_at:     e.createdAt   as string,
      };
    });

    // ── Validate double-entry balance ─────────────────────────
    // Transfer entries (both debit + credit) must be balanced.
    // Credit-only entries (booking confirmations) are acceptable here
    // but callers should use requireBalance=true for transfer batches.

    const hasDebitEntries  = rows.some((r) => r.debit_account  !== null);
    const hasCreditEntries = rows.some((r) => r.credit_account !== null);
    const isMixedBatch     = hasDebitEntries && hasCreditEntries;

    const validation = validateLedgerEntries(
      rows.map((r) => ({ debitAccount: r.debit_account, creditAccount: r.credit_account, amountFcfa: r.amount_fcfa })),
      { requireBalance: isMixedBatch }
    );

    if (!validation.valid) {
      log.error("Ledger validation failed", new Error(validation.reason));
      return err(`Ledger validation failed: ${validation.reason}`, 422);
    }

    // ── Write (idempotent upsert) ─────────────────────────────

    const { data, error: insertErr } = await db
      .from("wallet_ledger")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
      .select("id, entry_ref");

    if (insertErr) {
      log.error("DB upsert failed", insertErr);
      return err(insertErr.message, 500);
    }

    const persisted = (data ?? []).length;
    log.info("Ledger entries persisted", {
      persisted,
      total: rows.length,
      creditTotal: validation.creditTotal,
      debitTotal: validation.debitTotal,
    });

    return ok({ persisted, total: rows.length, entryRefs: (data ?? []).map((r: { entry_ref: string }) => r.entry_ref) }, 201);
  } catch (e) {
    log.error("Unexpected error", e);
    return err((e as Error).message, 500);
  }
});
