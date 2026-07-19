// ============================================================
// useTransactions — React Query hooks for financial transactions
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { PaymentTransaction, RefundTransaction, WithdrawalTransaction } from "./types";

// ── Payment transactions ──────────────────────────────────────

async function fetchPaymentTransactions(propertyIds: string[]): Promise<PaymentTransaction[]> {
  if (propertyIds.length === 0) return [];

  // Step 1: resolve booking IDs — PostgREST cannot filter on joined columns
  const { data: bookingData, error: bookingError } = await (supabase as any)
    .from("bookings")
    .select("id, reference")
    .in("property_id", propertyIds);

  if (bookingError) throw new Error(bookingError.message);

  const bookingRows = (bookingData ?? []) as { id: string; reference: string }[];
  if (bookingRows.length === 0) return [];

  const bookingIds = bookingRows.map((b) => b.id);
  const refMap = Object.fromEntries(bookingRows.map((b) => [b.id, b.reference]));

  // Step 2: fetch payments filtered by booking_id
  const { data, error } = await (supabase as any)
    .from("payments")
    .select("id, booking_id, payer_id, method, status, amount_fcfa, processor_fee_fcfa, captured_at, created_at")
    .in("booking_id", bookingIds)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    bookingReference: refMap[r.booking_id] ?? "—",
    payerId: r.payer_id,
    method: r.method,
    status: r.status,
    amountFcfa: r.amount_fcfa,
    processorFeeFcfa: r.processor_fee_fcfa,
    netAmountFcfa: r.amount_fcfa - (r.processor_fee_fcfa ?? 0),
    currency: "XOF" as const,
    capturedAt: r.captured_at,
    createdAt: r.created_at,
    metadata: {},
  }));
}

export function usePaymentTransactions(hostId: string | null) {
  const propertyQuery = useQuery({
    queryKey: queryKeys.hostPropertyIds(hostId ?? ""),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("properties").select("id").eq("host_id", hostId).is("deleted_at", null);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string }[]).map((p) => p.id);
    },
    enabled: !!hostId,
    staleTime: 300_000,
  });

  const txQuery = useQuery({
    queryKey: queryKeys.hostPaymentTransactions(hostId ?? ""),
    queryFn: () => fetchPaymentTransactions(propertyQuery.data ?? []),
    enabled: !!hostId && !!propertyQuery.data,
    staleTime: 60_000,
  });

  return {
    transactions: txQuery.data ?? [],
    loading: propertyQuery.isLoading || txQuery.isLoading,
    error: (propertyQuery.error ?? txQuery.error)?.message ?? null,
  };
}

// ── Refund transactions ───────────────────────────────────────

async function fetchRefundTransactions(propertyIds: string[]): Promise<RefundTransaction[]> {
  if (propertyIds.length === 0) return [];

  // Step 1: resolve booking IDs — PostgREST cannot filter on joined columns
  const { data: bookingData, error: bookingError } = await (supabase as any)
    .from("bookings")
    .select("id, reference")
    .in("property_id", propertyIds);

  if (bookingError) throw new Error(bookingError.message);

  const bookingRows = (bookingData ?? []) as { id: string; reference: string }[];
  if (bookingRows.length === 0) return [];

  const bookingIds = bookingRows.map((b) => b.id);
  const refMap = Object.fromEntries(bookingRows.map((b) => [b.id, b.reference]));

  // Step 2: fetch refunds filtered by booking_id
  const { data, error } = await (supabase as any)
    .from("refunds")
    .select("id, payment_id, booking_id, reason, refund_type, status, refund_amount_fcfa, processor_fee_fcfa, approved_by, processed_at, created_at, requested_by")
    .in("booking_id", bookingIds)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    paymentId: r.payment_id,
    bookingId: r.booking_id,
    bookingReference: refMap[r.booking_id] ?? "—",
    refundType: r.refund_type,
    status: r.status,
    refundAmountFcfa: r.refund_amount_fcfa,
    processorFeeFcfa: r.processor_fee_fcfa,
    netRefundFcfa: r.refund_amount_fcfa - (r.processor_fee_fcfa ?? 0),
    currency: "XOF" as const,
    reason: r.reason,
    requestedBy: r.requested_by,
    approvedBy: r.approved_by,
    processedAt: r.processed_at,
    createdAt: r.created_at,
  }));
}

export function useRefundTransactions(hostId: string | null) {
  const propertyQuery = useQuery({
    queryKey: queryKeys.hostPropertyIds(hostId ?? ""),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("properties").select("id").eq("host_id", hostId).is("deleted_at", null);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string }[]).map((p) => p.id);
    },
    enabled: !!hostId,
    staleTime: 300_000,
  });

  const txQuery = useQuery({
    queryKey: queryKeys.hostRefundTransactions(hostId ?? ""),
    queryFn: () => fetchRefundTransactions(propertyQuery.data ?? []),
    enabled: !!hostId && !!propertyQuery.data,
    staleTime: 60_000,
  });

  return {
    refunds: txQuery.data ?? [],
    loading: propertyQuery.isLoading || txQuery.isLoading,
    error: (propertyQuery.error ?? txQuery.error)?.message ?? null,
  };
}

// ── Withdrawal (payout) transactions ─────────────────────────

async function fetchWithdrawalTransactions(hostId: string): Promise<WithdrawalTransaction[]> {
  const { data, error } = await (supabase as any)
    .from("payouts")
    .select("*")
    .eq("host_id", hostId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    hostId: r.host_id,
    status: r.status,
    amountFcfa: r.amount_fcfa,
    currency: "XOF" as const,
    method: r.method,
    payoutAccountSnapshot: r.payout_account_snapshot,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    scheduledFor: r.scheduled_for,
    dispatchedAt: r.dispatched_at,
    paidAt: r.paid_at,
    failedAt: r.failed_at,
    failureReason: r.failure_reason,
    retryCount: r.retry_count,
    createdAt: r.created_at,
  }));
}

export function useWithdrawalTransactions(hostId: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.hostWithdrawals(hostId ?? ""),
    queryFn: () => fetchWithdrawalTransactions(hostId!),
    enabled: !!hostId,
    staleTime: 30_000,
  });

  return {
    withdrawals: data ?? [],
    loading: isLoading && !!hostId,
    error: error?.message ?? null,
  };
}
