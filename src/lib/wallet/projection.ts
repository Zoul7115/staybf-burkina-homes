// ============================================================
// Wallet Projection Engine
//
// The wallet balance is reconstructed EXCLUSIVELY from wallet_ledger.
// Never falls back to bookings or payouts.
// If the ledger is empty → return an explicit "empty" snapshot.
// The caller must never silently compute from another source.
//
// N+1 fix: platform wallet uses a single query with OR filter
// instead of two separate queries for credit and debit accounts.
// ============================================================

import { supabase } from "@/lib/supabase/client";
import type { HostWalletBalance, PlatformWalletBalance } from "./types";

export type WalletProjectionState = "computed" | "empty" | "error";

export type HostWalletProjection = {
  state: WalletProjectionState;
  balance: HostWalletBalance | null;
  entryCount: number;
};

export type PlatformWalletProjection = {
  state: WalletProjectionState;
  balance: PlatformWalletBalance | null;
  entryCount: number;
};

// DB account names for platform
const PLATFORM_ACCOUNTS = ["PLATFORM_PENDING", "PLATFORM_AVAILABLE", "PLATFORM_WITHDRAWN"];

type LedgerRow = {
  debit_account:  string | null;
  credit_account: string | null;
  amount_fcfa:    number;
};

type AccountBalance = Record<string, number>;

function aggregateLedger(rows: LedgerRow[]): AccountBalance {
  const bal: AccountBalance = {};

  for (const row of rows) {
    if (row.credit_account) {
      bal[row.credit_account] = (bal[row.credit_account] ?? 0) + row.amount_fcfa;
    }
    if (row.debit_account) {
      bal[row.debit_account] = Math.max(0, (bal[row.debit_account] ?? 0) - row.amount_fcfa);
    }
  }

  return bal;
}

// ── Host wallet ───────────────────────────────────────────────

export async function computeHostWalletFromLedger(hostId: string): Promise<HostWalletProjection> {
  const db = supabase as any;

  const { data, error } = await db
    .from("wallet_ledger")
    .select("debit_account, credit_account, amount_fcfa")
    .eq("host_id", hostId)
    .order("created_at", { ascending: true });

  if (error) {
    return { state: "error", balance: null, entryCount: 0 };
  }

  const rows = (data ?? []) as LedgerRow[];

  if (rows.length === 0) {
    return { state: "empty", balance: null, entryCount: 0 };
  }

  const bal = aggregateLedger(rows);

  const pendingBalance   = bal["HOST_PENDING"]   ?? 0;
  const availableBalance = bal["HOST_AVAILABLE"]  ?? 0;
  const withdrawnBalance = bal["HOST_WITHDRAWN"]  ?? 0;

  return {
    state: "computed",
    entryCount: rows.length,
    balance: {
      hostId,
      pendingBalance,
      availableBalance,
      withdrawnBalance,
      totalEarned: availableBalance + withdrawnBalance,
      currency: "XOF",
      computedAt: new Date().toISOString(),
    },
  };
}

// ── Platform wallet ───────────────────────────────────────────
// Single query using OR filter — eliminates N+1 from two-query approach.

export async function computePlatformWalletFromLedger(): Promise<PlatformWalletProjection> {
  const db = supabase as any;

  // Fetch all rows that touch any platform account (debit OR credit)
  const { data, error } = await db
    .from("wallet_ledger")
    .select("debit_account, credit_account, amount_fcfa")
    .or(
      `credit_account.in.(${PLATFORM_ACCOUNTS.join(",")}),` +
      `debit_account.in.(${PLATFORM_ACCOUNTS.join(",")})`
    )
    .order("created_at", { ascending: true });

  if (error) {
    return { state: "error", balance: null, entryCount: 0 };
  }

  const rows = (data ?? []) as LedgerRow[];

  if (rows.length === 0) {
    return { state: "empty", balance: null, entryCount: 0 };
  }

  const bal = aggregateLedger(rows);

  const pendingCommission   = bal["PLATFORM_PENDING"]   ?? 0;
  const availableCommission = bal["PLATFORM_AVAILABLE"] ?? 0;
  const withdrawnCommission = bal["PLATFORM_WITHDRAWN"] ?? 0;

  return {
    state: "computed",
    entryCount: rows.length,
    balance: {
      pendingCommission,
      availableCommission,
      totalCommission: pendingCommission + availableCommission + withdrawnCommission,
      currency: "XOF",
      computedAt: new Date().toISOString(),
    },
  };
}

// ── Convenience unwrappers ─────────────────────────────────────
// These are the only public API callers should use.
// They return null when the ledger is empty — never fall back.

export async function getHostWallet(hostId: string): Promise<HostWalletBalance | null> {
  const proj = await computeHostWalletFromLedger(hostId);
  return proj.balance;
}

export async function getPlatformWallet(): Promise<PlatformWalletBalance | null> {
  const proj = await computePlatformWalletFromLedger();
  return proj.balance;
}
