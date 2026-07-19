export type LedgerEntryInput = {
  debitAccount: string | null;
  creditAccount: string | null;
  amountFcfa: number;
};

export type ValidationResult = {
  valid: boolean;
  debitTotal: number;
  creditTotal: number;
  delta: number;
  error?: string;
};

export class LedgerImbalanceError extends Error {
  constructor(
    public readonly creditTotal: number,
    public readonly debitTotal: number,
    public readonly delta: number
  ) {
    super(`Ledger imbalance: credit=${creditTotal} debit=${debitTotal} delta=${delta}`);
    this.name = "LedgerImbalanceError";
  }
}

export function validateLedgerEntries(
  entries: LedgerEntryInput[],
  opts: { requireBalance?: boolean } = {}
): ValidationResult {
  if (entries.length === 0) {
    return { valid: false, debitTotal: 0, creditTotal: 0, delta: 0, error: "No entries" };
  }

  let debitTotal = 0;
  let creditTotal = 0;

  for (const e of entries) {
    if (e.amountFcfa <= 0) {
      return { valid: false, debitTotal: 0, creditTotal: 0, delta: 0, error: `Invalid amount: ${e.amountFcfa}` };
    }
    if (e.debitAccount) debitTotal += e.amountFcfa;
    if (e.creditAccount) creditTotal += e.amountFcfa;
  }

  const hasDebit = entries.some((e) => e.debitAccount);
  const hasCredit = entries.some((e) => e.creditAccount);
  const isMixed = hasDebit && hasCredit;
  const requireBalance = opts.requireBalance ?? isMixed;

  if (requireBalance && debitTotal !== creditTotal) {
    return {
      valid: false,
      debitTotal,
      creditTotal,
      delta: creditTotal - debitTotal,
      error: `Imbalanced: credit=${creditTotal} debit=${debitTotal}`,
    };
  }

  return { valid: true, debitTotal, creditTotal, delta: creditTotal - debitTotal };
}

export function assertLedgerBalance(entries: LedgerEntryInput[]): void {
  const result = validateLedgerEntries(entries, { requireBalance: true });
  if (!result.valid) {
    throw new LedgerImbalanceError(result.creditTotal, result.debitTotal, result.delta);
  }
}
