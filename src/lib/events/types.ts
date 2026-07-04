// ============================================================
// Event Bus — domain event catalogue
//
// All financial and operational events are typed here.
// Every module emits and subscribes through this catalogue —
// never via direct function calls across domain boundaries.
// ============================================================

// ── Base event shape ──────────────────────────────────────────

export type BaseEvent<T extends string, P extends Record<string, unknown> = Record<string, unknown>> = {
  type: T;
  payload: P;
  timestamp?: string;
  correlationId?: string;
};

// ── Booking events ────────────────────────────────────────────

export type BookingCreatedEvent = BaseEvent<"BOOKING_CREATED", {
  bookingId: string;
  reference: string;
  propertyId: string;
  roomId: string;
  travelerId: string;
  hostId: string;
  checkIn: string;
  checkOut: string;
  totalAmountFcfa: number;
  hostPayoutAmountFcfa: number;
  commissionAmountFcfa: number;
  serviceFeeAmountFcfa: number;
}>;

export type BookingConfirmedEvent = BaseEvent<"BOOKING_CONFIRMED", {
  bookingId: string;
  reference: string;
  travelerId: string;
  hostId: string;
}>;

export type BookingCancelledEvent = BaseEvent<"BOOKING_CANCELLED", {
  bookingId: string;
  reference: string;
  cancelledBy: "traveler" | "host" | "system";
  reason: string | null;
  wasCompleted: boolean;
}>;

export type CheckoutCompletedEvent = BaseEvent<"CHECKOUT_COMPLETED", {
  bookingId: string;
  reference: string;
  travelerId: string;
  hostId: string;
  hostPayoutAmountFcfa: number;
  commissionAmountFcfa: number;
}>;

// ── Payment events ────────────────────────────────────────────

export type PaymentIntentCreatedEvent = BaseEvent<"PAYMENT_INTENT_CREATED", {
  intentId: string;
  bookingId: string;
  amountFcfa: number;
}>;

export type PaymentReceivedEvent = BaseEvent<"PAYMENT_RECEIVED", {
  paymentId: string;
  bookingId: string;
  amountFcfa: number;
  method: string;
}>;

export type PaymentFailedEvent = BaseEvent<"PAYMENT_FAILED", {
  paymentId: string;
  reason: string;
}>;

// ── Fund release events ───────────────────────────────────────

export type FundsReleasedEvent = BaseEvent<"FUNDS_RELEASED", {
  bookingId: string;
  reference: string;
  hostId: string;
  amountFcfa: number;
}>;

// ── Withdrawal events ─────────────────────────────────────────

export type WithdrawalRequestedEvent = BaseEvent<"WITHDRAWAL_REQUESTED", {
  payoutId: string;
  hostId: string;
  amountFcfa: number;
  method: string;
}>;

export type WithdrawalApprovedEvent = BaseEvent<"WITHDRAWAL_APPROVED", {
  payoutId: string;
  hostId: string;
  amountFcfa: number;
}>;

export type WithdrawalPaidEvent = BaseEvent<"WITHDRAWAL_PAID", {
  payoutId: string;
  hostId: string;
  amountFcfa: number;
  paidAt: string;
}>;

export type WithdrawalFailedEvent = BaseEvent<"WITHDRAWAL_FAILED", {
  payoutId: string;
  hostId: string;
  amountFcfa: number;
  reason: string;
  retryCount: number;
}>;

// ── Refund events ─────────────────────────────────────────────

export type RefundCreatedEvent = BaseEvent<"REFUND_CREATED", {
  refundId: string;
  bookingId: string;
  amountFcfa: number;
}>;

export type RefundCompletedEvent = BaseEvent<"REFUND_COMPLETED", {
  refundId: string;
  bookingId: string;
  amountFcfa: number;
}>;

// ── Review events ─────────────────────────────────────────────

export type ReviewSubmittedEvent = BaseEvent<"REVIEW_SUBMITTED", {
  reviewId: string;
  bookingId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
}>;

// ── Union ─────────────────────────────────────────────────────

export type StayBFEvent =
  | BookingCreatedEvent
  | BookingConfirmedEvent
  | BookingCancelledEvent
  | CheckoutCompletedEvent
  | PaymentIntentCreatedEvent
  | PaymentReceivedEvent
  | PaymentFailedEvent
  | FundsReleasedEvent
  | WithdrawalRequestedEvent
  | WithdrawalApprovedEvent
  | WithdrawalPaidEvent
  | WithdrawalFailedEvent
  | RefundCreatedEvent
  | RefundCompletedEvent
  | ReviewSubmittedEvent;

export type StayBFEventType = StayBFEvent["type"];
export type EventPayload<T extends StayBFEventType> = Extract<StayBFEvent, { type: T }>["payload"];
