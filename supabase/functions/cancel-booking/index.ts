// ============================================================
// cancel-booking — Cancel a booking (traveler or host)
//
// Steps:
//   1. Verify JWT
//   2. Load booking + property (host_id)
//   3. Check actor permission (traveler or host only)
//   4. Verify cancellable status
//   5. Update booking status
//   6. Log booking_event
//   7. Release availability
//   8. B19: Write ledger reversal entries (if captured payment exists)
//   9. Notify other party
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";
import { createLogger, generateRequestId } from "../_shared/logger.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = generateRequestId();
  const log = createLogger("cancel-booking", requestId);

  try {
    const user = await requireAuth(req);
    const { booking_id, reason } = await req.json();
    if (!booking_id) return err("Missing booking_id");

    const db = makeServiceClient();

    const { data: booking, error: fetchErr } = await db
      .from("bookings")
      .select("id, traveler_id, property_id, status, reference, host_payout_amount, commission_amount, service_fee_amount")
      .eq("id", booking_id)
      .single();

    if (fetchErr || !booking) return err("Booking not found", 404);

    const { data: prop } = await db.from("properties").select("host_id").eq("id", booking.property_id).single();
    const hostId = prop?.host_id;

    const isTraveler = booking.traveler_id === user.id;
    const isHost     = hostId === user.id;

    if (!isTraveler && !isHost) return err("Forbidden", 403);

    const cancellableStatuses = ["pending_payment", "payment_processing", "awaiting_host", "confirmed"];
    if (!cancellableStatuses.includes(booking.status)) {
      return err("Booking cannot be cancelled in its current state");
    }

    const newStatus   = isTraveler ? "cancelled_by_traveler" : "cancelled_by_host";
    const cancelledAt = new Date().toISOString();

    const { error: updateErr } = await db.from("bookings").update({
      status:              newStatus,
      cancelled_by:        user.id,
      cancelled_at:        cancelledAt,
      cancellation_reason: reason ?? null,
    }).eq("id", booking_id);

    if (updateErr) return err(updateErr.message);

    log.info("booking cancelled", { booking_id, new_status: newStatus, actor: user.id });

    // ── Log booking event ────────────────────────────────────────
    await db.from("booking_events").insert({
      booking_id,
      event_type:  "booking_cancelled",
      from_status: booking.status,
      to_status:   newStatus,
      actor_id:    user.id,
      actor_type:  isTraveler ? "traveler" : "host",
      metadata:    { reason: reason ?? null },
    });

    // ── Release availability ─────────────────────────────────────
    await db.rpc("release_availability", { p_booking_id: booking_id });

    // ── B19: Write ledger reversal entries ───────────────────────
    // Only write if the booking had a captured payment — bookings that were
    // cancelled before payment (pending_payment, payment_processing) have no
    // ledger credits to reverse. "confirmed" and "awaiting_host" bookings
    // have a captured payment and credits in HOST_PENDING / PLATFORM_PENDING.
    await writeCancellationLedger(db, booking, hostId ?? null, cancelledAt, user.id, log);

    // ── Notify other party ───────────────────────────────────────
    const notifyId   = isTraveler ? hostId : booking.traveler_id;
    const notifType  = isTraveler ? "booking_cancelled_by_traveler" : "booking_cancelled_by_host";
    if (notifyId) {
      try {
        await db.from("notifications").insert({
          user_id: notifyId,
          type:    notifType,
          title:   "Réservation annulée",
          body:    reason ?? "Une réservation a été annulée.",
          data:    { booking_id },
        });
      } catch {
        // Notification failure does not fail the cancellation
      }
    }

    log.end("ok", { booking_id, new_status: newStatus });
    return ok({ success: true });

  } catch (e) {
    log.error("unhandled error", e);
    return err((e as Error).message, 500);
  }
});

// ── Ledger reversal for cancelled bookings ────────────────────
// Debits HOST_PENDING and PLATFORM_PENDING to reverse the credits
// written when the payment was captured. Only called if a captured
// payment exists for this booking.

async function writeCancellationLedger(
  db: ReturnType<typeof makeServiceClient>,
  booking: {
    id: string;
    reference: string;
    status: string;
    host_payout_amount: number;
    commission_amount: number;
    service_fee_amount: number;
  },
  hostId: string | null,
  cancelledAt: string,
  cancelledBy: string,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  // Only reverse credits if there's a captured payment
  const { data: capturedPayment } = await db
    .from("payments")
    .select("id")
    .eq("booking_id", booking.id)
    .eq("status", "captured")
    .maybeSingle();

  if (!capturedPayment) {
    log.info("no captured payment — skipping ledger reversal", { booking_id: booking.id });
    return;
  }

  // Guard: skip if reversal entries already written (idempotency)
  const { data: existing } = await db
    .from("wallet_ledger")
    .select("id")
    .eq("booking_id", booking.id)
    .eq("entry_type", "booking_cancelled_reversal")
    .maybeSingle();

  if (existing) {
    log.info("cancellation reversal already written — skipped", { booking_id: booking.id });
    return;
  }

  // Determine which accounts to debit
  // Cancellable statuses (awaiting_host, confirmed) have credits in HOST_PENDING/PLATFORM_PENDING.
  // booking_completed_release hasn't run yet (booking never reached "completed").
  const hostAccount     = "HOST_PENDING";
  const platformAccount = "PLATFORM_PENDING";
  const ref             = booking.reference;
  const entries         = [];

  if ((booking.host_payout_amount ?? 0) > 0) {
    entries.push({
      entry_type:     "booking_cancelled_reversal",
      debit_account:  hostAccount,
      credit_account: null as string | null,
      amount_fcfa:    booking.host_payout_amount,
      currency:       "XOF",
      booking_id:     booking.id,
      host_id:        hostId,
      reference:      ref,
      description:    `Annulation réservation ${ref} — remboursement hôte en attente`,
      metadata:       { cancelled_at: cancelledAt, cancelled_by: cancelledBy },
      created_at:     cancelledAt,
    });
  }

  const platformAmount = (booking.commission_amount ?? 0) + (booking.service_fee_amount ?? 0);
  if (platformAmount > 0) {
    entries.push({
      entry_type:     "booking_cancelled_reversal",
      debit_account:  platformAccount,
      credit_account: null as string | null,
      amount_fcfa:    platformAmount,
      currency:       "XOF",
      booking_id:     booking.id,
      host_id:        null as string | null,
      reference:      ref,
      description:    `Annulation réservation ${ref} — commission + frais plateforme`,
      metadata:       { cancelled_at: cancelledAt },
      created_at:     cancelledAt,
    });
  }

  if (entries.length === 0) return;

  const { error: ledgerErr } = await db.from("wallet_ledger").insert(entries);
  if (ledgerErr) {
    log.error("cancellation ledger write failed", ledgerErr, { booking_id: booking.id });
  } else {
    log.info("cancellation reversal entries written", {
      booking_id:    booking.id,
      host_amount:   booking.host_payout_amount,
      platform_amount: platformAmount,
    });
  }
}
