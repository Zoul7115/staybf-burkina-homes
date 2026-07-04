// ============================================================
// Reconciliation — verify wallet balances against DB ground truth
//
// Wallet balances are computed from the DB state (bookings + payouts).
// The reconciliation module verifies these computed balances are
// consistent and surfaces any discrepancies.
// ============================================================

import type { HostWalletBalance, PlatformWalletBalance } from "./types";

export type ReconciliationCheck = {
  name: string;
  passed: boolean;
  expected: number;
  actual: number;
  delta: number;
  severity: "ok" | "warning" | "critical";
};

export type ReconciliationReport = {
  hostId: string | null;
  checks: ReconciliationCheck[];
  allPassed: boolean;
  runAt: string;
};

const WARNING_THRESHOLD_FCFA = 100;
const CRITICAL_THRESHOLD_FCFA = 10_000;

function check(
  name: string,
  expected: number,
  actual: number
): ReconciliationCheck {
  const delta = Math.abs(expected - actual);
  const passed = delta === 0;
  const severity = passed
    ? "ok"
    : delta <= WARNING_THRESHOLD_FCFA
    ? "warning"
    : delta <= CRITICAL_THRESHOLD_FCFA
    ? "warning"
    : "critical";

  return { name, passed, expected, actual, delta, severity };
}

// Verify host wallet: computed from bookings + payouts in DB
export function reconcileHostWallet(opts: {
  hostId: string;
  computedBalance: HostWalletBalance;
  dbPendingFcfa: number;
  dbAvailableFcfa: number;
  dbWithdrawnFcfa: number;
}): ReconciliationReport {
  const { computedBalance, dbPendingFcfa, dbAvailableFcfa, dbWithdrawnFcfa } = opts;

  const checks: ReconciliationCheck[] = [
    check("host_pending_balance", dbPendingFcfa, computedBalance.pendingBalance),
    check("host_available_balance", dbAvailableFcfa, computedBalance.availableBalance),
    check("host_withdrawn_balance", dbWithdrawnFcfa, computedBalance.withdrawnBalance),
    check(
      "total_earned_consistency",
      computedBalance.availableBalance + computedBalance.withdrawnBalance,
      computedBalance.totalEarned
    ),
  ];

  return {
    hostId: opts.hostId,
    checks,
    allPassed: checks.every((c) => c.passed),
    runAt: new Date().toISOString(),
  };
}

export function reconcilePlatformWallet(opts: {
  computedBalance: PlatformWalletBalance;
  dbPendingCommissionFcfa: number;
  dbAvailableCommissionFcfa: number;
}): ReconciliationReport {
  const checks: ReconciliationCheck[] = [
    check("platform_pending_commission", opts.dbPendingCommissionFcfa, opts.computedBalance.pendingCommission),
    check("platform_available_commission", opts.dbAvailableCommissionFcfa, opts.computedBalance.availableCommission),
  ];

  return {
    hostId: null,
    checks,
    allPassed: checks.every((c) => c.passed),
    runAt: new Date().toISOString(),
  };
}
