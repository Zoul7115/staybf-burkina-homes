// ============================================================
// Withdrawal Engine — validation + lifecycle management
// ============================================================

import type { HostWalletBalance, WithdrawalRequest, WithdrawalValidationResult, WithdrawalTransaction } from "./types";

// ── Business rules ────────────────────────────────────────────

const MINIMUM_WITHDRAWAL_FCFA = 5_000;
const DAILY_LIMIT_FCFA = 500_000;
const MONTHLY_LIMIT_FCFA = 5_000_000;
const MAX_RETRY_COUNT = 3;

// ── Validation ────────────────────────────────────────────────

export function validateWithdrawalRequest(opts: {
  request: WithdrawalRequest;
  balance: HostWalletBalance;
  kycVerified: boolean;
  payoutMethod: string | null;
  payoutAccount: string | null;
  totalWithdrawnTodayFcfa: number;
  totalWithdrawnThisMonthFcfa: number;
}): WithdrawalValidationResult {
  const { request, balance, kycVerified, payoutMethod, payoutAccount, totalWithdrawnTodayFcfa, totalWithdrawnThisMonthFcfa } = opts;

  if (!kycVerified) {
    return { valid: false, reason: "Votre compte doit être vérifié (KYC) avant de pouvoir effectuer un retrait." };
  }

  if (!payoutMethod || !payoutAccount) {
    return { valid: false, reason: "Veuillez renseigner un compte de paiement (Orange Money, Moov Money ou compte bancaire) dans vos paramètres." };
  }

  if (request.amountFcfa < MINIMUM_WITHDRAWAL_FCFA) {
    return { valid: false, reason: `Le montant minimum de retrait est de ${MINIMUM_WITHDRAWAL_FCFA.toLocaleString("fr-FR")} FCFA.` };
  }

  if (request.amountFcfa > balance.availableBalance) {
    return { valid: false, reason: `Solde disponible insuffisant. Solde : ${balance.availableBalance.toLocaleString("fr-FR")} FCFA.` };
  }

  if (totalWithdrawnTodayFcfa + request.amountFcfa > DAILY_LIMIT_FCFA) {
    const remaining = Math.max(0, DAILY_LIMIT_FCFA - totalWithdrawnTodayFcfa);
    return { valid: false, reason: `Plafond journalier atteint. Il vous reste ${remaining.toLocaleString("fr-FR")} FCFA disponibles aujourd'hui.` };
  }

  if (totalWithdrawnThisMonthFcfa + request.amountFcfa > MONTHLY_LIMIT_FCFA) {
    const remaining = Math.max(0, MONTHLY_LIMIT_FCFA - totalWithdrawnThisMonthFcfa);
    return { valid: false, reason: `Plafond mensuel atteint. Il vous reste ${remaining.toLocaleString("fr-FR")} FCFA disponibles ce mois.` };
  }

  if (request.method !== payoutMethod) {
    return { valid: false, reason: `La méthode de retrait sélectionnée (${request.method}) ne correspond pas à votre compte enregistré (${payoutMethod}).` };
  }

  return { valid: true };
}

// ── State machine ─────────────────────────────────────────────
//
// pending   → approved | cancelled | scheduled | on_hold
// approved  → processing | cancelled
// scheduled → processing | on_hold | approved  (legacy batch path)
// on_hold   → approved | scheduled | cancelled
// processing → paid | failed
// failed    → approved | scheduled | on_hold
// paid      → reversed
// cancelled → (terminal)
// reversed  → (terminal)

export type WithdrawalTransition =
  | { from: "pending";    to: "approved" | "cancelled" | "scheduled" | "on_hold" }
  | { from: "approved";   to: "processing" | "cancelled" }
  | { from: "scheduled";  to: "processing" | "on_hold" | "approved" }
  | { from: "on_hold";    to: "approved" | "scheduled" | "cancelled" }
  | { from: "processing"; to: "paid" | "failed" }
  | { from: "failed";     to: "approved" | "scheduled" | "on_hold" }
  | { from: "paid";       to: "reversed" };

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending:    ["approved", "cancelled", "scheduled", "on_hold"],
  approved:   ["processing", "cancelled"],
  scheduled:  ["processing", "on_hold", "approved"],
  on_hold:    ["approved", "scheduled", "cancelled"],
  processing: ["paid", "failed"],
  failed:     ["approved", "scheduled", "on_hold"],
  paid:       ["reversed"],
  cancelled:  [],
  reversed:   [],
};

export function isValidWithdrawalTransition(from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canRetryWithdrawal(withdrawal: WithdrawalTransaction): boolean {
  return withdrawal.status === "failed" && withdrawal.retryCount < MAX_RETRY_COUNT;
}

// ── Period helpers ────────────────────────────────────────────

export function getWithdrawalPeriod(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

export function isSameDay(dateA: string, dateB: string): boolean {
  return dateA.slice(0, 10) === dateB.slice(0, 10);
}

export function isSameMonth(dateA: string, dateB: string): boolean {
  return dateA.slice(0, 7) === dateB.slice(0, 7);
}
