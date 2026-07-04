// ============================================================
// useWallet — React Query hook for host wallet balance
//
// Balances computed from DB ground truth:
//   pending  = SUM host_payout_amount WHERE status IN (confirmed, checked_in) AND payout_status = pending
//   available = SUM host_payout_amount WHERE status = completed AND payout_status = pending
//   withdrawn = SUM payout.amount_fcfa WHERE payout.status = paid (for this host)
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { HostWalletBalance, PlatformWalletBalance } from "./types";

const PENDING_STATUSES = ["confirmed", "checked_in"];
const AVAILABLE_STATUSES = ["completed"];

// ── Host wallet ───────────────────────────────────────────────

async function fetchHostWallet(hostId: string): Promise<HostWalletBalance> {
  const db = supabase as any;

  const [propertyRes, payoutRes] = await Promise.all([
    db.from("properties").select("id").eq("host_id", hostId).is("deleted_at", null),
    db.from("payouts").select("amount_fcfa").eq("host_id", hostId).eq("status", "paid"),
  ]);

  if (propertyRes.error) throw new Error(propertyRes.error.message);

  const propertyIds: string[] = ((propertyRes.data ?? []) as { id: string }[]).map((p) => p.id);

  if (propertyIds.length === 0) {
    return {
      hostId, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0,
      totalEarned: 0, currency: "XOF", computedAt: new Date().toISOString(),
    };
  }

  const [pendingRes, availableRes] = await Promise.all([
    db.from("bookings")
      .select("host_payout_amount")
      .in("property_id", propertyIds)
      .in("status", PENDING_STATUSES)
      .eq("payout_status", "pending"),
    db.from("bookings")
      .select("host_payout_amount")
      .in("property_id", propertyIds)
      .in("status", AVAILABLE_STATUSES)
      .eq("payout_status", "pending"),
  ]);

  if (pendingRes.error) throw new Error(pendingRes.error.message);
  if (availableRes.error) throw new Error(availableRes.error.message);

  const sum = (rows: { host_payout_amount: number }[]) =>
    rows.reduce((acc, r) => acc + r.host_payout_amount, 0);

  const pendingBalance = sum(pendingRes.data ?? []);
  const availableBalance = sum(availableRes.data ?? []);
  const withdrawnBalance = ((payoutRes.data ?? []) as { amount_fcfa: number }[])
    .reduce((acc, r) => acc + r.amount_fcfa, 0);

  return {
    hostId,
    pendingBalance,
    availableBalance,
    withdrawnBalance,
    totalEarned: availableBalance + withdrawnBalance,
    currency: "XOF",
    computedAt: new Date().toISOString(),
  };
}

export function useHostWallet(hostId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.hostWallet(hostId ?? ""),
    queryFn: () => fetchHostWallet(hostId!),
    enabled: !!hostId,
    staleTime: 30_000,
  });

  return {
    wallet: data ?? null,
    loading: isLoading && !!hostId,
    error: error?.message ?? null,
    refetch,
  };
}

// ── Platform wallet (admin) ───────────────────────────────────

async function fetchPlatformWallet(): Promise<PlatformWalletBalance> {
  const db = supabase as any;

  const [pendingRes, availableRes] = await Promise.all([
    db.from("bookings")
      .select("commission_amount")
      .in("status", PENDING_STATUSES),
    db.from("bookings")
      .select("commission_amount")
      .in("status", AVAILABLE_STATUSES),
  ]);

  if (pendingRes.error) throw new Error(pendingRes.error.message);
  if (availableRes.error) throw new Error(availableRes.error.message);

  const sumField = (rows: { commission_amount: number }[]) =>
    rows.reduce((acc, r) => acc + r.commission_amount, 0);

  const pendingCommission = sumField(pendingRes.data ?? []);
  const availableCommission = sumField(availableRes.data ?? []);

  return {
    pendingCommission,
    availableCommission,
    totalCommission: pendingCommission + availableCommission,
    currency: "XOF",
    computedAt: new Date().toISOString(),
  };
}

export function usePlatformWallet() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.adminWallet(),
    queryFn: fetchPlatformWallet,
    staleTime: 60_000,
  });

  return {
    wallet: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  };
}
