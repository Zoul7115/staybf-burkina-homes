// ============================================================
// useWallet — React Query hooks for host and platform wallet balances
//
// Balances are reconstructed EXCLUSIVELY from wallet_ledger via projection.ts.
// Never falls back to bookings or payouts tables.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { getHostWallet, getPlatformWallet } from "./projection";
import type { HostWalletBalance, PlatformWalletBalance } from "./types";

// ── Host wallet ───────────────────────────────────────────────

async function fetchHostWallet(hostId: string): Promise<HostWalletBalance> {
  const wallet = await getHostWallet(hostId);
  if (!wallet) {
    return {
      hostId,
      pendingBalance: 0,
      availableBalance: 0,
      withdrawnBalance: 0,
      totalEarned: 0,
      currency: "XOF",
      computedAt: new Date().toISOString(),
    };
  }
  return wallet;
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
  const wallet = await getPlatformWallet();
  if (!wallet) {
    return {
      pendingCommission: 0,
      availableCommission: 0,
      totalCommission: 0,
      currency: "XOF",
      computedAt: new Date().toISOString(),
    };
  }
  return wallet;
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
