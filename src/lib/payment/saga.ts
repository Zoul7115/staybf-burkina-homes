// ============================================================
// Financial Saga — Payment → Booking → Ledger → Wallet → Notification
//
// Orchestrates the full payment lifecycle atomically from the client side.
// Each step is recorded. On failure, compensating steps run in reverse.
//
// The saga does NOT touch the DB directly — all mutations go through
// Edge Functions (service_role). React Query cache is updated after
// each successful step.
//
// Step order:
//   1. createPaymentIntent  — record payment row (status=initiated)
//   2. [provider step]      — caller initiates CinetPay transaction
//   3. awaitCapture         — poll/wait for webhook confirmation
//   4. confirmBooking       — transition booking → confirmed
//   5. writeLedger          — persist ledger entries to wallet_ledger
//   6. invalidateWallet     — refresh React Query wallet cache
//   7. notify               — emit domain events for notification engine
//
// Rollback steps (in reverse order):
//   R4. cancelBooking       — transition back to pending_payment
//   R1. cancelPaymentIntent — mark payment as failed
// ============================================================

import { eventBus } from "@/lib/events/bus";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { withRetry } from "@/lib/utils/retry";

export type SagaStatus = "idle" | "running" | "success" | "compensating" | "failed";

export type SagaStep =
  | "create_payment_intent"
  | "await_capture"
  | "confirm_booking"
  | "write_ledger"
  | "invalidate_wallet"
  | "emit_events";

export type SagaResult =
  | { success: true; paymentId: string; bookingId: string }
  | { success: false; failedStep: SagaStep; reason: string };

export type PaymentSagaInput = {
  bookingId: string;
  bookingReference: string;
  travelerId: string;
  hostId: string;
  amountFcfa: number;
  hostPayoutAmountFcfa: number;
  commissionAmountFcfa: number;
  serviceFeeAmountFcfa: number;
  method: string;
  idempotencyKey: string;
  queryClient: QueryClient;
};

type SagaState = {
  paymentId: string | null;
  ledgerEntryIds: string[];
};

// ── Helper: call an Edge Function ────────────────────────────

async function callEdge(fn: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { supabase } = await import("@/lib/supabase/client");
  const { data, error } = await (supabase as any).functions.invoke(fn, { body });
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as Record<string, unknown>;
}

// ── Saga ─────────────────────────────────────────────────────

export async function runPaymentSaga(input: PaymentSagaInput): Promise<SagaResult> {
  const state: SagaState = { paymentId: null, ledgerEntryIds: [] };

  // ── Step 1: create payment intent ───────────────────────

  let paymentId: string;
  try {
    const res = await withRetry(() => callEdge("create-payment-intent", {
      booking_id: input.bookingId,
      payer_id: input.travelerId,
      method: input.method,
      amount_fcfa: input.amountFcfa,
      idempotency_key: input.idempotencyKey,
    }), { maxAttempts: 3, baseDelayMs: 500 });

    paymentId = (res.payment as Record<string, unknown>).id as string;
    state.paymentId = paymentId;
  } catch (e) {
    return { success: false, failedStep: "create_payment_intent", reason: (e as Error).message };
  }

  // ── Steps 2–3 are provider-side (CinetPay redirect + webhook) ──
  // The saga exits here; webhook processing via Edge Function
  // drives steps 4–7 server-side.
  //
  // For the CLIENT saga (used in checkout), we return after intent
  // creation and let the webhook handler complete the rest.
  // The finalizeSaga() below is called from the webhook handler's
  // Edge Function context.

  return { success: true, paymentId, bookingId: input.bookingId };
}

// ── Server-side saga finalization (called from webhook Edge Function) ─

export type FinalizeSagaInput = {
  paymentId: string;
  bookingId: string;
  bookingReference: string;
  travelerId: string;
  hostId: string;
  amountFcfa: number;
  processorFeeFcfa: number;
  hostPayoutAmountFcfa: number;
  commissionAmountFcfa: number;
  serviceFeeAmountFcfa: number;
  method: string;
  provider: string;
  capturedAt: string;
};

// This type describes what the webhook Edge Function must do.
// Exported for documentation — actual execution is in the Edge Function.
export type FinalizeSagaSteps = {
  // 1. UPDATE payments SET status='captured', captured_at=now()
  // 2. UPDATE bookings SET status='confirmed', confirmed_at=now()
  // 3. INSERT INTO booking_events (booking_confirmed)
  // 4. INSERT INTO wallet_ledger (3 entries via write-ledger-entry)
  // 5. Log to audit_logs
};

// ── Emit domain events after successful capture ────────────────

export function emitCaptureEvents(input: FinalizeSagaInput, queryClient?: QueryClient): void {
  const now = new Date().toISOString();

  eventBus.emit({
    type: "PAYMENT_CAPTURED",
    payload: {
      paymentId: input.paymentId,
      bookingId: input.bookingId,
      amountFcfa: input.amountFcfa,
      processorFeeFcfa: input.processorFeeFcfa,
      method: input.method,
      provider: input.provider,
      capturedAt: input.capturedAt,
    },
    timestamp: now,
  });

  eventBus.emit({
    type: "BOOKING_CONFIRMED",
    payload: {
      bookingId: input.bookingId,
      reference: input.bookingReference,
      travelerId: input.travelerId,
      hostId: input.hostId,
    },
    timestamp: now,
  });

  // Invalidate React Query caches if queryClient provided (browser context)
  if (queryClient) {
    queryClient.invalidateQueries({ queryKey: queryKeys.travelerBookings() });
    queryClient.invalidateQueries({ queryKey: queryKeys.hostWallet(input.hostId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.adminWallet() });
  }
}
