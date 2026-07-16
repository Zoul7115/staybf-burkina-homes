// ============================================================
// payment-status — Poll GaniPay for payment status
//
// Called by the checkout UI after returning from GaniPay redirect.
// Returns current canonical status so the UI can show the result.
//
// Flow:
//   1. Auth (traveler or admin)
//   2. Find payment by booking_id or payment_id
//   3. If terminal status: return cached DB value
//   4. If non-terminal: poll GaniPay /payments/{id}
//   5. Sync DB status if changed
//   6. Return status + booking info
// ============================================================

import { handleCors } from "../_shared/cors.ts";
import { requireAuth, makeServiceClient } from "../_shared/auth.ts";
import { ok, err } from "../_shared/response.ts";

const GANIPAY_API_KEY = Deno.env.get("GANIPAY_API_KEY") ?? "";
const GANIPAY_ENV     = Deno.env.get("GANIPAY_ENV") ?? "sandbox";

const GANIPAY_BASE_URL = GANIPAY_ENV === "production"
  ? "https://api.ganipay.com/v1"
  : "https://sandbox.ganipay.com/v1";

const GANIPAY_STATUS_MAP: Record<string, string> = {
  pending:     "pending",
  processing:  "processing",
  successful:  "captured",
  failed:      "failed",
  cancelled:   "cancelled",
  expired:     "expired",
  refunded:    "refunded",
};

const TERMINAL_STATUSES = new Set(["captured", "failed", "refunded", "cancelled", "expired", "chargeback"]);

async function ganipayGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${GANIPAY_BASE_URL}${path}`, {
    signal: AbortSignal.timeout(15_000),
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
    const user = await requireAuth(req);
    const url  = new URL(req.url);
    const paymentId = url.searchParams.get("payment_id");
    const bookingId = url.searchParams.get("booking_id");

    if (!paymentId && !bookingId) {
      return err("payment_id or booking_id is required");
    }

    const db = makeServiceClient();

    // ── Find payment ──────────────────────────────────────────

    let query = db
      .from("payments")
      .select("id, booking_id, status, amount_fcfa, provider_transaction_id, captured_at, provider");

    if (paymentId) {
      query = query.eq("id", paymentId) as typeof query;
    } else {
      query = query.eq("booking_id", bookingId!) as typeof query;
    }

    const { data: payment, error: payErr } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (payErr || !payment) return err("Payment not found", 404);

    // ── Verify ownership ──────────────────────────────────────

    const { data: booking } = await db
      .from("bookings")
      .select("id, reference, status, traveler_id")
      .eq("id", payment.booking_id)
      .single();

    if (!booking) return err("Booking not found", 404);
    if (booking.traveler_id !== user.id) return err("Forbidden", 403);

    // ── Return cached status for terminal payments ─────────────

    if (TERMINAL_STATUSES.has(payment.status) || payment.provider !== "ganipay") {
      return ok({
        payment_id:   payment.id,
        booking_id:   booking.id,
        status:       payment.status,
        amount_fcfa:  payment.amount_fcfa,
        booking_status: booking.status,
        captured_at:  payment.captured_at,
        polled:       false,
      });
    }

    // ── No provider transaction id yet ────────────────────────

    if (!payment.provider_transaction_id) {
      return ok({
        payment_id:     payment.id,
        booking_id:     booking.id,
        status:         payment.status,
        booking_status: booking.status,
        polled:         false,
      });
    }

    // ── Poll GaniPay ──────────────────────────────────────────

    let ganipayStatus = payment.status;
    try {
      const res = await ganipayGet(`/payments/${payment.provider_transaction_id}`);
      const rawStatus = res.status as string;
      ganipayStatus = GANIPAY_STATUS_MAP[rawStatus] ?? "failed";

      // Sync DB if status changed
      if (ganipayStatus !== payment.status) {
        const updatePayload: Record<string, unknown> = {
          status:     ganipayStatus,
          updated_at: new Date().toISOString(),
        };
        if (ganipayStatus === "captured") {
          updatePayload.captured_at = (res.paid_at as string | null) ?? new Date().toISOString();
        } else if (ganipayStatus === "failed") {
          updatePayload.failed_at = new Date().toISOString();
        }
        await db.from("payments").update(updatePayload).eq("id", payment.id);
      }
    } catch {
      // Polling failure is non-fatal — return last known status
    }

    return ok({
      payment_id:     payment.id,
      booking_id:     booking.id,
      status:         ganipayStatus,
      amount_fcfa:    payment.amount_fcfa,
      booking_status: booking.status,
      polled:         true,
    });

  } catch (e) {
    return err((e as Error).message, 500);
  }
});
