import { handleCors } from "../_shared/cors.ts";
import { requireAuth, requireAnyRole, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // Only allowed in non-production environments or by admins
    const simulateEnabled = Deno.env.get("SIMULATE_PAYMENT_ENABLED") === "true";
    const user = await requireAuth(req);
    if (!simulateEnabled) {
      // In production, only admins can trigger simulation (e.g. for support)
      await requireAnyRole(req, ["admin", "super_admin"]);
    }
    const { booking_id } = await req.json();
    if (!booking_id) return err("Missing booking_id");

    const db = makeServiceClient();

    // Verify booking belongs to this traveler and is in pending_payment
    const { data: booking, error: bookingErr } = await db
      .from("bookings")
      .select("id, reference, status, total_amount, traveler_id, property_id, host_payout_amount, commission_amount, service_fee_amount")
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) return err("Booking not found", 404);
    // In dev mode the caller must be the traveler; in prod mode admins act on any booking
    const isAdmin = !simulateEnabled; // when not in dev mode, user already passed requireAnyRole
    if (!isAdmin && booking.traveler_id !== user.id) return err("Forbidden", 403);
    if (booking.status !== "pending_payment") return err(`Cannot simulate payment for booking in status '${booking.status}'`);

    // Get host_id via property
    const { data: property } = await db
      .from("properties")
      .select("host_id")
      .eq("id", booking.property_id)
      .single();

    if (!property?.host_id) return err("Property host not found", 404);
    const hostId = property.host_id;

    const capturedAt = new Date().toISOString();
    const reference = `SIM-${booking.reference}-${Date.now()}`;

    // Amount consistency: use total_amount when individual amounts are null
    const hostPayout = booking.host_payout_amount ?? Math.round(booking.total_amount * 0.85);
    const commission = booking.commission_amount ?? Math.round(booking.total_amount * 0.10);
    const serviceFee = booking.service_fee_amount ?? Math.round(booking.total_amount * 0.05);

    // INSERT payment directly with status=captured (bypasses state machine trigger which fires on UPDATE only)
    const { data: payment, error: payErr } = await db
      .from("payments")
      .insert({
        booking_id,
        payer_id: booking.traveler_id,
        method: "mobile_money",
        amount_fcfa: booking.total_amount,
        processor_fee_fcfa: 0,
        idempotency_key: `sim-${booking_id}`,
        attempt_number: 1,
        currency: "XOF",
        status: "captured",
        provider: "simulation",
        provider_transaction_id: reference,
        captured_at: capturedAt,
      })
      .select("id")
      .single();

    if (payErr) return err(payErr.message);

    // Transition booking: pending_payment → payment_processing
    const { error: pp1Err } = await db
      .from("bookings")
      .update({ status: "payment_processing" })
      .eq("id", booking_id)
      .eq("status", "pending_payment");

    if (pp1Err) return err(pp1Err.message);

    // Transition booking: payment_processing → confirmed
    const { error: pp2Err } = await db
      .from("bookings")
      .update({ status: "confirmed", confirmed_at: capturedAt })
      .eq("id", booking_id)
      .eq("status", "payment_processing");

    if (pp2Err) return err(pp2Err.message);

    // Record booking event
    await db.from("booking_events").insert({
      booking_id,
      event_type: "booking_confirmed",
      from_status: "payment_processing",
      to_status: "confirmed",
      actor_id: user.id,
      actor_type: "system",
      metadata: { payment_id: payment.id, provider: "simulation" },
    });

    const ref = booking.reference as string;
    // Write ledger entries (idempotent via conflict on id)
    const ledgerRows = [
      {
        id: `${booking_id}-accommodation`,
        entry_type: "booking_accommodation_credit",
        booking_id,
        host_id: hostId,
        payout_id: null as string | null,
        refund_id: null as string | null,
        credit_account: "HOST_PENDING",
        debit_account: null as string | null,
        amount_fcfa: hostPayout,
        currency: "XOF",
        reference: ref,
        description: `Réservation ${ref} — encours hôte (simulation)`,
        metadata: { provider: "simulation", payment_id: payment.id },
      },
      {
        id: `${booking_id}-commission`,
        entry_type: "booking_commission_credit",
        booking_id,
        host_id: null as string | null,
        payout_id: null as string | null,
        refund_id: null as string | null,
        credit_account: "PLATFORM_PENDING",
        debit_account: null as string | null,
        amount_fcfa: commission,
        currency: "XOF",
        reference: ref,
        description: `Réservation ${ref} — commission plateforme (simulation)`,
        metadata: { provider: "simulation", payment_id: payment.id },
      },
      {
        id: `${booking_id}-service-fee`,
        entry_type: "booking_service_fee_credit",
        booking_id,
        host_id: null as string | null,
        payout_id: null as string | null,
        refund_id: null as string | null,
        credit_account: "PLATFORM_PENDING",
        debit_account: null as string | null,
        amount_fcfa: serviceFee,
        currency: "XOF",
        reference: ref,
        description: `Réservation ${ref} — frais de service (simulation)`,
        metadata: { provider: "simulation", payment_id: payment.id },
      },
    ];

    const { error: ledgerErr } = await db
      .from("wallet_ledger")
      .upsert(ledgerRows, { onConflict: "id", ignoreDuplicates: true });

    if (ledgerErr) return err(ledgerErr.message);

    // Notify traveler
    await db.from("notifications").insert({
      user_id: user.id,
      type: "booking_confirmed",
      title: "Réservation confirmée",
      body: `Votre réservation ${booking.reference} est confirmée.`,
      data: { booking_id },
    });

    // Notify host
    await db.from("notifications").insert({
      user_id: hostId,
      type: "new_booking",
      title: "Nouvelle réservation",
      body: `Vous avez une nouvelle réservation confirmée (${booking.reference}).`,
      data: { booking_id },
    });

    return ok({
      success: true,
      paymentId: payment.id,
      reference,
      status: "captured",
    });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
