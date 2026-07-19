// ============================================================
// Audit Trail — immutable financial audit log
//
// Every financial operation must produce an audit entry.
// Entries are derived from booking_events + payment_events.
// The audit trail answers: Who? When? Why? From where? Old? New?
// ============================================================

export type AuditActor = {
  userId: string;
  role: "traveler" | "host" | "admin" | "system";
  ipAddress?: string;
  userAgent?: string;
};

export type AuditEntry = {
  id: string;
  operation: string;
  actor: AuditActor;
  resourceType: "booking" | "payment" | "payout" | "refund" | "wallet";
  resourceId: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown>;
  reason: string | null;
  metadata: Record<string, unknown>;
  timestamp: string;
};

let _auditSeq = 0;

export function createAuditEntry(opts: {
  operation: string;
  actor: AuditActor;
  resourceType: AuditEntry["resourceType"];
  resourceId: string;
  previousState?: Record<string, unknown> | null;
  newState: Record<string, unknown>;
  reason?: string;
  metadata?: Record<string, unknown>;
}): AuditEntry {
  return {
    id: `audit-${Date.now()}-${++_auditSeq}`,
    operation: opts.operation,
    actor: opts.actor,
    resourceType: opts.resourceType,
    resourceId: opts.resourceId,
    previousState: opts.previousState ?? null,
    newState: opts.newState,
    reason: opts.reason ?? null,
    metadata: opts.metadata ?? {},
    timestamp: new Date().toISOString(),
  };
}

// ── Audit entry constructors ──────────────────────────────────

export function auditBookingCreated(opts: {
  bookingId: string;
  reference: string;
  travelerId: string;
  totalAmountFcfa: number;
}): AuditEntry {
  return createAuditEntry({
    operation: "booking.created",
    actor: { userId: opts.travelerId, role: "traveler" },
    resourceType: "booking",
    resourceId: opts.bookingId,
    previousState: null,
    newState: { status: "pending_payment", reference: opts.reference, totalAmountFcfa: opts.totalAmountFcfa },
  });
}

export function auditPaymentReceived(opts: {
  paymentId: string;
  bookingId: string;
  amountFcfa: number;
  method: string;
  actorId: string;
}): AuditEntry {
  return createAuditEntry({
    operation: "payment.received",
    actor: { userId: opts.actorId, role: "traveler" },
    resourceType: "payment",
    resourceId: opts.paymentId,
    previousState: { status: "pending" },
    newState: { status: "captured", amountFcfa: opts.amountFcfa, method: opts.method },
  });
}

export function auditBookingCancelled(opts: {
  bookingId: string;
  reference: string;
  cancelledBy: string;
  role: "traveler" | "host" | "admin" | "system";
  previousStatus: string;
  reason: string | null;
}): AuditEntry {
  return createAuditEntry({
    operation: "booking.cancelled",
    actor: { userId: opts.cancelledBy, role: opts.role },
    resourceType: "booking",
    resourceId: opts.bookingId,
    previousState: { status: opts.previousStatus },
    newState: { status: `cancelled_by_${opts.role}` },
    reason: opts.reason ?? undefined,
  });
}

export function auditFundsReleased(opts: {
  bookingId: string;
  hostId: string;
  amountFcfa: number;
}): AuditEntry {
  return createAuditEntry({
    operation: "funds.released",
    actor: { userId: "system", role: "system" },
    resourceType: "wallet",
    resourceId: opts.bookingId,
    previousState: { wallet: "host_pending", amountFcfa: opts.amountFcfa },
    newState: { wallet: "host_available", amountFcfa: opts.amountFcfa },
    reason: "Booking completed — automatic fund release",
  });
}

export function auditWithdrawalRequested(opts: {
  payoutId: string;
  hostId: string;
  amountFcfa: number;
  method: string;
}): AuditEntry {
  return createAuditEntry({
    operation: "withdrawal.requested",
    actor: { userId: opts.hostId, role: "host" },
    resourceType: "payout",
    resourceId: opts.payoutId,
    previousState: null,
    newState: { status: "pending", amountFcfa: opts.amountFcfa, method: opts.method },
  });
}

export function auditWithdrawalPaid(opts: {
  payoutId: string;
  hostId: string;
  amountFcfa: number;
  adminId: string;
}): AuditEntry {
  return createAuditEntry({
    operation: "withdrawal.paid",
    actor: { userId: opts.adminId, role: "admin" },
    resourceType: "payout",
    resourceId: opts.payoutId,
    previousState: { status: "processing" },
    newState: { status: "paid", amountFcfa: opts.amountFcfa },
  });
}

export function auditRefundCreated(opts: {
  refundId: string;
  bookingId: string;
  amountFcfa: number;
  requestedBy: string;
  role: "traveler" | "host" | "admin";
  reason: string;
}): AuditEntry {
  return createAuditEntry({
    operation: "refund.created",
    actor: { userId: opts.requestedBy, role: opts.role },
    resourceType: "refund",
    resourceId: opts.refundId,
    previousState: null,
    newState: { status: "requested", amountFcfa: opts.amountFcfa, bookingId: opts.bookingId },
    reason: opts.reason,
  });
}
