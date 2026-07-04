// ============================================================
// validateLedgerEntries — double-entry accounting guard
//
// Rule: For any group of entries representing a single economic event,
//   Σ credit amounts == Σ debit amounts
//
// This is enforced BEFORE any write to wallet_ledger.
// On violation: throw LedgerImbalanceError — no writes occur.
//
// For single-sided entries (e.g. a booking credit that only credits
// one account), the caller sets requireBalance = false. This is only
// acceptable for initial credits where the matching debit is implicit
// (the payment capture). For all transfers (pending→available), both
// sides MUST be present.
// ============================================================

export class LedgerImbalanceError extends Error {
  readonly creditTotal: number;
  readonly debitTotal: number;
  readonly delta: number;

  constructor(creditTotal: number, debitTotal: number) {
    const delta = Math.abs(creditTotal - debitTotal);
    super(
      `Ledger imbalance: credits=${creditTotal} FCFA, debits=${debitTotal} FCFA, delta=${delta} FCFA`
    );
    this.name = "LedgerImbalanceError";
    this.creditTotal = creditTotal;
    this.debitTotal = debitTotal;
    this.delta = delta;
  }
}

export type LedgerEntryInput = {
  debitAccount: string | null;
  creditAccount: string | null;
  amountFcfa: number;
};

export type ValidationResult =
  | { valid: true; creditTotal: number; debitTotal: number }
  | { valid: false; reason: string; creditTotal: number; debitTotal: number };

export function validateLedgerEntries(
  entries: LedgerEntryInput[],
  opts: { requireBalance?: boolean } = {}
): ValidationResult {
  const requireBalance = opts.requireBalance ?? true;

  if (entries.length === 0) {
    return { valid: false, reason: "No entries provided", creditTotal: 0, debitTotal: 0 };
  }

  // Validate each entry individually
  for (const e of entries) {
    if (e.amountFcfa <= 0) {
      return {
        valid: false,
        reason: `Entry has non-positive amount: ${e.amountFcfa}`,
        creditTotal: 0,
        debitTotal: 0,
      };
    }
    if (!e.debitAccount && !e.creditAccount) {
      return {
        valid: false,
        reason: "Entry must have at least one account (debit or credit)",
        creditTotal: 0,
        debitTotal: 0,
      };
    }
  }

  // Count totals
  let creditTotal = 0;
  let debitTotal = 0;

  for (const e of entries) {
    if (e.creditAccount) creditTotal += e.amountFcfa;
    if (e.debitAccount)  debitTotal  += e.amountFcfa;
  }

  if (requireBalance && creditTotal !== debitTotal) {
    return {
      valid: false,
      reason: `Ledger imbalance: credits=${creditTotal} FCFA, debits=${debitTotal} FCFA`,
      creditTotal,
      debitTotal,
    };
  }

  return { valid: true, creditTotal, debitTotal };
}

// Strict version — throws on failure (use in Edge Functions for fail-fast)
export function assertLedgerBalance(entries: LedgerEntryInput[]): void {
  const result = validateLedgerEntries(entries, { requireBalance: true });
  if (!result.valid) {
    throw new LedgerImbalanceError(result.creditTotal, result.debitTotal);
  }
}
