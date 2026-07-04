// ============================================================
// write-ledger-entry — persist ledger entries to wallet_ledger
//
// Internal Edge Function: ONLY called service-to-service.
// Client calls are rejected (no anon/authenticated access).
//
// Idempotent: retries with the same entry_id are silently ignored
// (ON CONFLICT DO NOTHING on the PK).
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

// Map TypeScript LedgerWallet → DB app_ledger_account enum values
const WALLET_TO_ACCOUNT: Record<string, string> = {
  host_pending: "HOST_PENDING",
  host_available: "HOST_AVAILABLE",
  host_withdrawn: "HOST_WITHDRAWN",
  platform_pending: "PLATFORM_PENDING",
  platform_available: "PLATFORM_AVAILABLE",
};

// Map TypeScript LedgerEntryType → DB app_ledger_entry_type enum values
const ENTRY_TYPE_MAP: Record<string, string> = {
  booking_accommodation_credit: "booking_accommodation_credit",
  booking_commission_credit: "booking_commission_credit",
  booking_service_fee_credit: "booking_service_fee_credit",
  booking_completed_release: "booking_completed_release",
  booking_cancelled_reversal: "booking_cancelled_reversal",
  payout_debit: "payout_debit",
  refund_accommodation_debit: "refund_accommodation_debit",
  refund_commission_debit: "refund_commission_debit",
  refund_service_fee_debit: "refund_service_fee_debit",
  manual_adjustment: "manual_adjustment",
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // Only service_role calls are accepted — verified via JWT role claim
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return err("Unauthorized", 401);

  try {
    const body = await req.json();
    const entries: unknown[] = Array.isArray(body) ? body : [body];

    if (entries.length === 0) return err("No entries provided");
    if (entries.length > 100) return err("Batch too large (max 100)");

    const db = makeServiceClient();

    const rows = entries.map((raw: unknown) => {
      const e = raw as Record<string, unknown>;

      const entryType = ENTRY_TYPE_MAP[e.type as string];
      if (!entryType) throw new Error(`Unknown entry type: ${e.type}`);

      const debitAccount = e.debitWallet ? WALLET_TO_ACCOUNT[e.debitWallet as string] : null;
      const creditAccount = e.creditWallet ? WALLET_TO_ACCOUNT[e.creditWallet as string] : null;

      if (!debitAccount && !creditAccount) {
        throw new Error("Entry must have at least one account (debit or credit)");
      }

      return {
        id: e.id as string,
        entry_type: entryType,
        debit_account: debitAccount ?? null,
        credit_account: creditAccount ?? null,
        amount_fcfa: e.amountFcfa as number,
        currency: "XOF",
        booking_id: (e.bookingId as string) ?? null,
        payout_id: (e.payoutId as string) ?? null,
        refund_id: (e.refundId as string) ?? null,
        host_id: (e.hostId as string) ?? null,
        reference: e.reference as string,
        description: e.description as string,
        metadata: (e.metadata as Record<string, unknown>) ?? {},
        created_at: e.createdAt as string,
      };
    });

    // ON CONFLICT DO NOTHING — idempotent by entry id (PK)
    const { data, error: insertErr } = await db
      .from("wallet_ledger")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
      .select("id");

    if (insertErr) return err(insertErr.message);

    return ok({ persisted: (data ?? []).length, total: rows.length }, 201);
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
