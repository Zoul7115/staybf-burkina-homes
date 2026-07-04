// ============================================================
// Wallet Projection Engine — Step 3
//
// Reconstructs wallet balances EXCLUSIVELY from wallet_ledger rows.
// Never reads bookings or payouts directly — the ledger IS the truth.
//
// When wallet_ledger has no entries (early dev / before migration),
// falls back to booking-based computation already in useWallet.ts.
// ============================================================

import { supabase } from "@/lib/supabase/client";
import type { HostWalletBalance, PlatformWalletBalance } from "./types";

// DB account names → balance fields
type AccountBalance = {
  HOST_PENDING: number;
  HOST_AVAILABLE: number;
  HOST_WITHDRAWN: number;
  PLATFORM_PENDING: number;
  PLATFORM_AVAILABLE: number;
  PLATFORM_WITHDRAWN: number;
};

type LedgerRow = {
  debit_account: string | null;
  credit_account: string | null;
  amount_fcfa: number;
};

function aggregateLedger(rows: LedgerRow[]): AccountBalance {
  const bal: AccountBalance = {
    HOST_PENDING: 0, HOST_AVAILABLE: 0, HOST_WITHDRAWN: 0,
    PLATFORM_PENDING: 0, PLATFORM_AVAILABLE: 0, PLATFORM_WITHDRAWN: 0,
  };

  for (const row of rows) {
    if (row.credit_account && row.credit_account in bal) {
      bal[row.credit_account as keyof AccountBalance] += row.amount_fcfa;
    }
    if (row.debit_account && row.debit_account in bal) {
      bal[row.debit_account as keyof AccountBalance] = Math.max(
        0,
        bal[row.debit_account as keyof AccountBalance] - row.amount_fcfa
      );
    }
  }

  return bal;
}

// ── Host wallet from ledger ───────────────────────────────────

export async function computeHostWalletFromLedger(hostId: string): Promise<HostWalletBalance | null> {
  const db = supabase as any;

  const { data, error } = await db
    .from("wallet_ledger")
    .select("debit_account, credit_account, amount_fcfa")
    .eq("host_id", hostId)
    .order("created_at", { ascending: true });

  if (error) return null;
  const rows = (data ?? []) as LedgerRow[];
  if (rows.length === 0) return null;

  const bal = aggregateLedger(rows);

  const pendingBalance = bal.HOST_PENDING;
  const availableBalance = bal.HOST_AVAILABLE;
  const withdrawnBalance = bal.HOST_WITHDRAWN;

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

// ── Platform wallet from ledger ───────────────────────────────

export async function computePlatformWalletFromLedger(): Promise<PlatformWalletBalance | null> {
  const db = supabase as any;

  const { data, error } = await db
    .from("wallet_ledger")
    .select("debit_account, credit_account, amount_fcfa")
    .in("credit_account", ["PLATFORM_PENDING", "PLATFORM_AVAILABLE", "PLATFORM_WITHDRAWN"])
    .order("created_at", { ascending: true });

  if (error) return null;

  // Also fetch debit rows affecting platform accounts
  const { data: debitData } = await db
    .from("wallet_ledger")
    .select("debit_account, credit_account, amount_fcfa")
    .in("debit_account", ["PLATFORM_PENDING", "PLATFORM_AVAILABLE", "PLATFORM_WITHDRAWN"])
    .order("created_at", { ascending: true });

  const rows = [...(data ?? []), ...(debitData ?? [])] as LedgerRow[];
  if (rows.length === 0) return null;

  const bal = aggregateLedger(rows);

  return {
    pendingCommission: bal.PLATFORM_PENDING,
    availableCommission: bal.PLATFORM_AVAILABLE,
    totalCommission: bal.PLATFORM_PENDING + bal.PLATFORM_AVAILABLE + bal.PLATFORM_WITHDRAWN,
    currency: "XOF",
    computedAt: new Date().toISOString(),
  };
}

// ── Ledger-aware hooks: try ledger first, fall back to bookings ─

export async function computeHostWallet(
  hostId: string,
  fallback: () => Promise<HostWalletBalance>
): Promise<HostWalletBalance> {
  const fromLedger = await computeHostWalletFromLedger(hostId);
  return fromLedger ?? fallback();
}

export async function computePlatformWallet(
  fallback: () => Promise<PlatformWalletBalance>
): Promise<PlatformWalletBalance> {
  const fromLedger = await computePlatformWalletFromLedger();
  return fromLedger ?? fallback();
}
