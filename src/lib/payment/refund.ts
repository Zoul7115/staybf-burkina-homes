// ============================================================
// Refund Engine — domain logic for all refund scenarios
// ============================================================

import type { RefundType, RefundRequest, RefundStatus } from "./types";

// ── Refund state machine ──────────────────────────────────────
//
// requested → approved → processing → completed | partially_completed
//                                   → failed
//           → rejected

const ALLOWED_REFUND_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["processing"],
  processing: ["completed", "partially_completed", "failed"],
  completed: [],
  partially_completed: [],
  rejected: [],
  failed: ["processing"],
};

export function isValidRefundTransition(from: RefundStatus, to: RefundStatus): boolean {
  return ALLOWED_REFUND_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Refund scenarios ──────────────────────────────────────────

export type RefundScenario = {
  type: RefundType;
  label: string;
  requiresApproval: boolean;
  hostRetains: "none" | "first_night" | "partial" | "full";
  platformRetainsServiceFee: boolean;
};

export const REFUND_SCENARIOS: Record<string, RefundScenario> = {
  flexible_full: {
    type: "policy_cancellation",
    label: "Annulation flexible — remboursement intégral",
    requiresApproval: false,
    hostRetains: "none",
    platformRetainsServiceFee: false,
  },
  flexible_late: {
    type: "policy_cancellation",
    label: "Annulation flexible tardive — première nuit retenue",
    requiresApproval: false,
    hostRetains: "first_night",
    platformRetainsServiceFee: true,
  },
  moderate: {
    type: "policy_cancellation",
    label: "Annulation modérée — 50% remboursé",
    requiresApproval: false,
    hostRetains: "partial",
    platformRetainsServiceFee: true,
  },
  strict: {
    type: "policy_cancellation",
    label: "Annulation stricte — aucun remboursement",
    requiresApproval: false,
    hostRetains: "full",
    platformRetainsServiceFee: true,
  },
  host_cancellation: {
    type: "host_cancellation",
    label: "Annulation par l'hôte — remboursement intégral + pénalité",
    requiresApproval: false,
    hostRetains: "none",
    platformRetainsServiceFee: false,
  },
  goodwill: {
    type: "goodwill",
    label: "Geste commercial",
    requiresApproval: true,
    hostRetains: "partial",
    platformRetainsServiceFee: false,
  },
  dispute_traveler: {
    type: "dispute_resolution",
    label: "Litige résolu en faveur du voyageur",
    requiresApproval: true,
    hostRetains: "none",
    platformRetainsServiceFee: false,
  },
  dispute_host: {
    type: "dispute_resolution",
    label: "Litige résolu en faveur de l'hôte",
    requiresApproval: true,
    hostRetains: "full",
    platformRetainsServiceFee: true,
  },
};

// ── Refund amount calculators ─────────────────────────────────

export type RefundCalculation = {
  refundAmountFcfa: number;
  hostRetainsAmountFcfa: number;
  commissionReversalFcfa: number;
  serviceFeeReversalFcfa: number;
  totalRefundedToTravelerFcfa: number;
};

export function calculateRefundAmount(opts: {
  scenario: RefundScenario;
  accommodationAmountFcfa: number;
  serviceFeeAmountFcfa: number;
  commissionAmountFcfa: number;
  basePricePerNightFcfa: number;
  nights: number;
}): RefundCalculation {
  const { scenario, accommodationAmountFcfa, serviceFeeAmountFcfa, commissionAmountFcfa, basePricePerNightFcfa } = opts;

  let hostRetainsAmountFcfa: number;

  switch (scenario.hostRetains) {
    case "none":
      hostRetainsAmountFcfa = 0;
      break;
    case "first_night":
      hostRetainsAmountFcfa = Math.min(basePricePerNightFcfa, accommodationAmountFcfa);
      break;
    case "partial":
      hostRetainsAmountFcfa = Math.round(accommodationAmountFcfa * 0.5);
      break;
    case "full":
      hostRetainsAmountFcfa = accommodationAmountFcfa;
      break;
  }

  const refundAmountFcfa = accommodationAmountFcfa - hostRetainsAmountFcfa;
  const commissionReversalFcfa = scenario.platformRetainsServiceFee ? 0 : commissionAmountFcfa;
  const serviceFeeReversalFcfa = scenario.platformRetainsServiceFee ? 0 : serviceFeeAmountFcfa;

  return {
    refundAmountFcfa,
    hostRetainsAmountFcfa,
    commissionReversalFcfa,
    serviceFeeReversalFcfa,
    totalRefundedToTravelerFcfa: refundAmountFcfa + serviceFeeReversalFcfa,
  };
}

// ── Full / Partial / Manual refund factories ──────────────────

export function fullRefundRequest(opts: {
  paymentId: string;
  bookingId: string;
  totalAmountFcfa: number;
  requestedBy: string;
  requesterRole: "traveler" | "host" | "admin";
  idempotencyKey: string;
}): RefundRequest {
  return {
    paymentId: opts.paymentId,
    bookingId: opts.bookingId,
    refundType: "host_cancellation",
    refundAmountFcfa: opts.totalAmountFcfa,
    reason: "Remboursement intégral — annulation hôte",
    requestedBy: opts.requestedBy,
    requesterRole: opts.requesterRole,
    idempotencyKey: opts.idempotencyKey,
  };
}

export function partialRefundRequest(opts: {
  paymentId: string;
  bookingId: string;
  refundAmountFcfa: number;
  reason: string;
  requestedBy: string;
  requesterRole: "traveler" | "host" | "admin";
  idempotencyKey: string;
}): RefundRequest {
  return {
    paymentId: opts.paymentId,
    bookingId: opts.bookingId,
    refundType: "goodwill",
    refundAmountFcfa: opts.refundAmountFcfa,
    reason: opts.reason,
    requestedBy: opts.requestedBy,
    requesterRole: opts.requesterRole,
    idempotencyKey: opts.idempotencyKey,
  };
}

export function manualRefundRequest(opts: {
  paymentId: string;
  bookingId: string;
  refundAmountFcfa: number;
  reason: string;
  adminId: string;
  idempotencyKey: string;
}): RefundRequest {
  return {
    paymentId: opts.paymentId,
    bookingId: opts.bookingId,
    refundType: "goodwill",
    refundAmountFcfa: opts.refundAmountFcfa,
    reason: opts.reason,
    requestedBy: opts.adminId,
    requesterRole: "admin",
    idempotencyKey: opts.idempotencyKey,
  };
}

export function cancellationRefundRequest(opts: {
  paymentId: string;
  bookingId: string;
  cancellationPolicy: string;
  accommodationAmountFcfa: number;
  serviceFeeAmountFcfa: number;
  commissionAmountFcfa: number;
  basePricePerNightFcfa: number;
  nights: number;
  requestedBy: string;
  requesterRole: "traveler" | "host" | "admin";
  idempotencyKey: string;
}): RefundRequest & { calculation: RefundCalculation } {
  const scenarioKey = `${opts.cancellationPolicy}` in REFUND_SCENARIOS
    ? opts.cancellationPolicy
    : "flexible_full";
  const scenario = REFUND_SCENARIOS[scenarioKey] ?? REFUND_SCENARIOS.flexible_full;

  const calculation = calculateRefundAmount({
    scenario,
    accommodationAmountFcfa: opts.accommodationAmountFcfa,
    serviceFeeAmountFcfa: opts.serviceFeeAmountFcfa,
    commissionAmountFcfa: opts.commissionAmountFcfa,
    basePricePerNightFcfa: opts.basePricePerNightFcfa,
    nights: opts.nights,
  });

  return {
    paymentId: opts.paymentId,
    bookingId: opts.bookingId,
    refundType: "policy_cancellation",
    refundAmountFcfa: calculation.totalRefundedToTravelerFcfa,
    reason: `Annulation — politique ${opts.cancellationPolicy}`,
    requestedBy: opts.requestedBy,
    requesterRole: opts.requesterRole,
    idempotencyKey: opts.idempotencyKey,
    calculation,
  };
}
