// ============================================================
// usePayment — React Query hooks for GaniPay checkout
//
// useInitPayment()    — Create GaniPay payment, get checkout_url
// usePaymentStatus()  — Poll for payment result after return
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callEdgeFunction } from "@/lib/storage";
import { queryKeys } from "@/lib/query/keys";

// ── Types ──────────────────────────────────────────────────────

export type InitPaymentInput = {
  bookingId: string;
  method: "orange_money" | "moov_money";
  idempotencyKey: string;
  payerPhone?: string;
  payerEmail?: string;
};

export type InitPaymentResult = {
  payment_id: string;
  provider_transaction_id: string;
  checkout_url: string | null;
  expires_at: string;
  idempotent?: boolean;
};

export type PaymentStatusResult = {
  payment_id: string;
  booking_id: string;
  status: string;
  amount_fcfa?: number;
  booking_status: string;
  captured_at?: string | null;
  polled: boolean;
};

// ── useInitPayment ─────────────────────────────────────────────

export function useInitPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InitPaymentInput) =>
      callEdgeFunction<InitPaymentResult>("payment-init", {
        booking_id:      input.bookingId,
        method:          input.method,
        idempotency_key: input.idempotencyKey,
        payer_phone:     input.payerPhone ?? "",
        payer_email:     input.payerEmail ?? "",
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.travelerBookings() });
      qc.invalidateQueries({ queryKey: ["traveler", "dashboard", "bookings"] });
    },
  });
}

// ── usePaymentStatus ───────────────────────────────────────────
// Poll after returning from GaniPay redirect.

export function usePaymentStatus(
  paymentId: string | null,
  opts?: { enabled?: boolean; refetchInterval?: number }
) {
  return useQuery({
    queryKey: ["payment", "status", paymentId],
    queryFn: async () => {
      const res = await callEdgeFunction<PaymentStatusResult>(
        `payment-status?payment_id=${paymentId}`,
        {}
      );
      return res;
    },
    enabled: !!paymentId && (opts?.enabled ?? true),
    refetchInterval: (query) => {
      // Stop polling when terminal status reached
      const data = query.state.data as PaymentStatusResult | undefined;
      if (!data) return opts?.refetchInterval ?? 3000;
      const terminal = ["captured", "failed", "refunded", "chargeback", "cancelled", "expired"];
      if (terminal.includes(data.status)) return false;
      return opts?.refetchInterval ?? 3000;
    },
    staleTime: 0,
  });
}

// ── usePaymentStatusByBooking ──────────────────────────────────

export function usePaymentStatusByBooking(
  bookingId: string | null,
  opts?: { enabled?: boolean; refetchInterval?: number }
) {
  return useQuery({
    queryKey: ["payment", "status", "booking", bookingId],
    queryFn: async () => {
      const res = await callEdgeFunction<PaymentStatusResult>(
        `payment-status?booking_id=${bookingId}`,
        {}
      );
      return res;
    },
    enabled: !!bookingId && (opts?.enabled ?? true),
    refetchInterval: (query) => {
      const data = query.state.data as PaymentStatusResult | undefined;
      if (!data) return opts?.refetchInterval ?? 3000;
      const terminal = ["captured", "failed", "refunded", "chargeback", "cancelled", "confirmed", "awaiting_host"];
      if (terminal.includes(data.booking_status)) return false;
      return opts?.refetchInterval ?? 3000;
    },
    staleTime: 0,
  });
}
