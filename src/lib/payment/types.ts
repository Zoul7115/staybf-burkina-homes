// ============================================================
// Payment domain — canonical types
//
// This module contains ONLY interfaces and types.
// No payment provider is implemented here.
// To add FedaPay (or any provider), implement PaymentProvider
// and register it with PaymentGateway — zero other changes.
// ============================================================

// ── Payment method ────────────────────────────────────────────

export type PaymentMethodId =
  | "orange_money"
  | "moov_money"
  | "visa"
  | "mastercard"
  | "wallet_credit";

export type PaymentMethodDetails = {
  id: PaymentMethodId;
  label: string;
  type: "mobile_money" | "card" | "wallet";
  currency: "XOF";
  minAmountFcfa: number;
  maxAmountFcfa: number;
  processingTimeMinutes: number;
};

// ── Payment intent ────────────────────────────────────────────
//
// A PaymentIntent is created BEFORE the provider is invoked.
// It represents the intention to collect funds for a booking.

export type PaymentIntentStatus =
  | "created"
  | "pending"
  | "processing"
  | "requires_action"
  | "authorized"
  | "captured"
  | "cancelled"
  | "failed"
  | "expired";

export type PaymentIntent = {
  id: string;
  bookingId: string;
  bookingReference: string;
  payerId: string;
  amountFcfa: number;
  currency: "XOF";
  method: PaymentMethodId;
  provider: string;
  idempotencyKey: string;
  status: PaymentIntentStatus;
  providerTransactionId: string | null;
  providerRedirectUrl: string | null;
  providerCheckoutToken: string | null;
  requiresAction: boolean;
  actionUrl: string | null;
  metadata: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

// ── Payment session ───────────────────────────────────────────
//
// A PaymentSession wraps a PaymentIntent with UI state.
// Sessions expire after PAYMENT_SESSION_TTL_MINUTES.

export const PAYMENT_SESSION_TTL_MINUTES = 30;

export type PaymentSession = {
  sessionId: string;
  intentId: string;
  bookingId: string;
  amountFcfa: number;
  currency: "XOF";
  method: PaymentMethodId;
  status: PaymentIntentStatus;
  expiresAt: string;
  isExpired: boolean;
  pollingIntervalMs: number;
};

// ── Payment status lifecycle ──────────────────────────────────
//
// State machine (mirrors app_payment_status enum):
//   initiated → pending → authorized → captured
//                      → failed
//   captured → refund_pending → refunded | partially_refunded
//   captured → chargeback

export type PaymentStatus =
  | "initiated"
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "refund_pending"
  | "refunded"
  | "partially_refunded"
  | "chargeback";

export const PAYMENT_TERMINAL_STATUSES: PaymentStatus[] = ["captured", "failed", "refunded", "chargeback"];
export const PAYMENT_SUCCESS_STATUSES: PaymentStatus[] = ["captured"];
export const PAYMENT_FAILED_STATUSES: PaymentStatus[] = ["failed", "chargeback"];

// ── Refund ────────────────────────────────────────────────────

export type RefundType =
  | "policy_cancellation"
  | "host_cancellation"
  | "goodwill"
  | "dispute_resolution"
  | "force_majeure"
  | "chargeback_reversal";

export type RefundStatus =
  | "requested"
  | "approved"
  | "processing"
  | "completed"
  | "partially_completed"
  | "rejected"
  | "failed";

export type RefundRequest = {
  paymentId: string;
  bookingId: string;
  refundType: RefundType;
  refundAmountFcfa: number;
  reason: string;
  requestedBy: string;
  requesterRole: "traveler" | "host" | "admin";
  idempotencyKey: string;
};

export type RefundResult = {
  refundId: string;
  status: RefundStatus;
  refundAmountFcfa: number;
  providerRefundId: string | null;
  processedAt: string | null;
};

// ── Webhook ───────────────────────────────────────────────────

export type WebhookEventType =
  | "payment.pending"
  | "payment.authorized"
  | "payment.captured"
  | "payment.failed"
  | "payment.cancelled"
  | "refund.created"
  | "refund.completed"
  | "refund.failed"
  | "chargeback.created"
  | "chargeback.reversed";

export type WebhookEvent = {
  id: string;
  provider: string;
  providerEventId: string;
  type: WebhookEventType;
  paymentId: string | null;
  providerTransactionId: string;
  mappedStatus: PaymentStatus;
  amountFcfa: number | null;
  rawPayload: Record<string, unknown>;
  receivedAt: string;
};

export type WebhookVerificationResult =
  | { valid: true; event: WebhookEvent }
  | { valid: false; reason: string };
