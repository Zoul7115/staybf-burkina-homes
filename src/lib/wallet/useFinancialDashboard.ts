// ============================================================
// Financial Dashboards — React Query hooks
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { groupByMonth, isThisMonth } from "./utils";
import type { HostFinancialDashboard, AdminFinancialDashboard } from "./types";

// ── Host financial dashboard ──────────────────────────────────

async function fetchHostFinancialDashboard(hostId: string): Promise<HostFinancialDashboard> {
  const db = supabase as any;

  const [propertyRes, payoutRes] = await Promise.all([
    db.from("properties").select("id").eq("host_id", hostId).is("deleted_at", null),
    db.from("payouts").select("amount_fcfa, status, created_at, paid_at").eq("host_id", hostId).order("created_at", { ascending: false }),
  ]);

  if (propertyRes.error) throw new Error(propertyRes.error.message);
  const propertyIds: string[] = ((propertyRes.data ?? []) as { id: string }[]).map((p) => p.id);

  if (propertyIds.length === 0) {
    const emptyWallet = { hostId, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0, totalEarned: 0, currency: "XOF" as const, computedAt: new Date().toISOString() };
    return { wallet: emptyWallet, monthlyRevenueFcfa: 0, monthlyBookingCount: 0, pendingPayouts: [], recentTransactions: [], revenueChart: [] };
  }

  const [pendingRes, availableRes, completedRes] = await Promise.all([
    db.from("bookings").select("host_payout_amount").in("property_id", propertyIds).in("status", ["confirmed", "checked_in"]).eq("payout_status", "pending"),
    db.from("bookings").select("host_payout_amount").in("property_id", propertyIds).in("status", ["completed"]).eq("payout_status", "pending"),
    db.from("bookings").select("host_payout_amount, completed_at").in("property_id", propertyIds).eq("status", "completed").order("completed_at", { ascending: false }).limit(200),
  ]);

  const sum = (rows: { host_payout_amount: number }[]) =>
    (rows ?? []).reduce((acc, r) => acc + r.host_payout_amount, 0);

  const pendingBalance = sum(pendingRes.data ?? []);
  const availableBalance = sum(availableRes.data ?? []);
  const payouts = (payoutRes.data ?? []) as any[];
  const withdrawnBalance = payouts.filter((p) => p.status === "paid").reduce((acc, p) => acc + p.amount_fcfa, 0);

  const completedBookings = (completedRes.data ?? []) as { host_payout_amount: number; completed_at: string }[];
  const monthlyRevenueFcfa = completedBookings
    .filter((b) => isThisMonth(b.completed_at))
    .reduce((acc, b) => acc + b.host_payout_amount, 0);
  const monthlyBookingCount = completedBookings.filter((b) => isThisMonth(b.completed_at)).length;

  const revenueChart = groupByMonth(
    completedBookings.map((b) => ({ createdAt: b.completed_at, amountFcfa: b.host_payout_amount }))
  ).slice(-6);

  const pendingPayouts = payouts
    .filter((p) => p.status === "pending" || p.status === "scheduled")
    .map((p) => ({
      id: p.id ?? "", hostId, status: p.status, amountFcfa: p.amount_fcfa,
      currency: "XOF" as const, method: p.method ?? "", payoutAccountSnapshot: p.payout_account_snapshot ?? "",
      periodStart: p.period_start ?? "", periodEnd: p.period_end ?? "",
      scheduledFor: p.scheduled_for, dispatchedAt: p.dispatched_at, paidAt: p.paid_at,
      failedAt: p.failed_at, failureReason: p.failure_reason, retryCount: p.retry_count ?? 0, createdAt: p.created_at,
    }));

  return {
    wallet: {
      hostId, pendingBalance, availableBalance, withdrawnBalance,
      totalEarned: availableBalance + withdrawnBalance, currency: "XOF", computedAt: new Date().toISOString(),
    },
    monthlyRevenueFcfa,
    monthlyBookingCount,
    pendingPayouts,
    recentTransactions: [],
    revenueChart,
  };
}

export function useHostFinancialDashboard(hostId: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.hostRevenue(), hostId ?? ""],
    queryFn: () => fetchHostFinancialDashboard(hostId!),
    enabled: !!hostId,
    staleTime: 30_000,
  });

  return {
    dashboard: data ?? null,
    loading: isLoading && !!hostId,
    error: error?.message ?? null,
  };
}

// ── Admin financial dashboard ─────────────────────────────────

async function fetchAdminFinancialDashboard(): Promise<AdminFinancialDashboard> {
  const db = supabase as any;

  const [activeRes, completedRes, payoutsRes, refundsRes, paymentsRes] = await Promise.all([
    db.from("bookings").select("commission_amount, service_fee_amount, accommodation_amount").in("status", ["confirmed", "checked_in"]),
    db.from("bookings").select("commission_amount, service_fee_amount, accommodation_amount, completed_at").eq("status", "completed").order("completed_at", { ascending: false }).limit(500),
    db.from("payouts").select("amount_fcfa, status, paid_at").eq("status", "paid"),
    db.from("refunds").select("refund_amount_fcfa, status").eq("status", "completed"),
    db.from("payments").select("amount_fcfa, status, captured_at").eq("status", "captured").order("captured_at", { ascending: false }).limit(500),
  ]);

  const activeBookings = (activeRes.data ?? []) as any[];
  const completedBookings = (completedRes.data ?? []) as any[];
  const paidPayouts = (payoutsRes.data ?? []) as any[];
  const completedRefunds = (refundsRes.data ?? []) as any[];
  const capturedPayments = (paymentsRes.data ?? []) as any[];

  const sumField = <T extends Record<string, any>>(rows: T[], field: keyof T) =>
    rows.reduce((acc, r) => acc + (r[field] as number), 0);

  const pendingCommission = sumField(activeBookings, "commission_amount");
  const availableCommission = sumField(completedBookings, "commission_amount");
  const totalCommission = pendingCommission + availableCommission;
  const monthlyCommissionFcfa = completedBookings
    .filter((b) => isThisMonth(b.completed_at))
    .reduce((acc, b) => acc + b.commission_amount, 0);

  const blockedFundsFcfa = sumField(activeBookings, "accommodation_amount");
  const releasedFundsFcfa = sumField(completedBookings, "accommodation_amount");
  const totalWithdrawalsFcfa = sumField(paidPayouts, "amount_fcfa");
  const paymentVolumeFcfa = sumField(capturedPayments, "amount_fcfa");
  const refundVolumeFcfa = sumField(completedRefunds, "refund_amount_fcfa");

  const revenueChart = groupByMonth(
    completedBookings.map((b) => ({ createdAt: b.completed_at, amountFcfa: b.commission_amount }))
  ).slice(-6);

  return {
    platform: {
      pendingCommission,
      availableCommission,
      totalCommission,
      currency: "XOF",
      computedAt: new Date().toISOString(),
    },
    totalCommissionFcfa: totalCommission,
    monthlyCommissionFcfa,
    blockedFundsFcfa,
    releasedFundsFcfa,
    totalWithdrawalsFcfa,
    paymentVolumeFcfa,
    refundVolumeFcfa,
    revenueChart,
  };
}

export function useAdminFinancialDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.adminFinancialDashboard(),
    queryFn: fetchAdminFinancialDashboard,
    staleTime: 60_000,
  });

  return {
    dashboard: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  };
}
