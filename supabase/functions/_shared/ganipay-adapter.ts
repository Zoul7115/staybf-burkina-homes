// ============================================================
// GaniPayAdapter — webhook normalization for GaniPay
//
// Signature: HMAC-SHA256 of raw body
// Header:    X-GaniPay-Signature: <hex digest>
// Env:       GANIPAY_WEBHOOK_SECRET
//
// Event types:
//   payment.successful → captured
//   payment.failed     → failed
//   payment.cancelled  → failed
//   refund.completed   → refunded
// ============================================================

import type { ProviderWebhookAdapter, WebhookVerdict, NormalizedWebhookEvent } from "./webhook-adapter.ts";
import { registerAdapter } from "./webhook-adapter.ts";

const EVENT_STATUS_MAP: Record<string, NormalizedWebhookEvent["mappedStatus"]> = {
  "payment.successful": "captured",
  "payment.failed":     "failed",
  "payment.cancelled":  "failed",
  "refund.completed":   "refunded",
};

class GaniPayAdapter implements ProviderWebhookAdapter {
  readonly providerName = "ganipay";

  verifySignature(
    payload: Record<string, unknown>,
    headers: Record<string, string>,
    secret: string
  ): WebhookVerdict {
    // Minimal structural validation when secret is not configured
    if (!secret) {
      const hasEventId = typeof payload.event_id === "string" && payload.event_id.length > 0;
      if (!hasEventId) {
        return { valid: false, reason: "Missing event_id" };
      }
      return { valid: true };
    }

    const sig = headers["x-ganipay-signature"] ?? "";
    if (!sig) {
      return { valid: false, reason: "Missing X-GaniPay-Signature header" };
    }

    // Signature check is deferred to Edge Function context where raw body is available
    // The actual HMAC check happens via _verify_ganipay_signature() called before this adapter
    const hasRequiredFields =
      typeof payload.event_id === "string" &&
      typeof payload.event_type === "string";

    if (!hasRequiredFields) {
      return { valid: false, reason: "Missing event_id or event_type" };
    }

    return { valid: true };
  }

  extractEventId(payload: Record<string, unknown>): string | null {
    return (payload.event_id as string | undefined) ?? null;
  }

  normalizeEvent(payload: Record<string, unknown>): NormalizedWebhookEvent {
    const eventType = payload.event_type as string ?? "";
    const mappedStatus: NormalizedWebhookEvent["mappedStatus"] =
      EVENT_STATUS_MAP[eventType] ?? "failed";

    const providerTransactionId =
      (payload.payment_id as string | undefined) ??
      (payload.payout_id as string | undefined) ??
      (payload.reference as string | undefined) ??
      "";

    const rawAmount = payload.amount;
    const amountFcfa = rawAmount != null ? parseInt(String(rawAmount), 10) || null : null;

    return {
      providerEventId:       (payload.event_id as string) ?? "",
      providerTransactionId,
      mappedStatus,
      providerStatus:        eventType,
      amountFcfa,
      occurredAt:            (payload.occurred_at as string | undefined) ?? null,
      metadata: {
        event_type:  eventType,
        payment_id:  payload.payment_id,
        payout_id:   payload.payout_id,
        operator:    payload.operator,
        phone:       payload.phone,
      },
    };
  }
}

export const ganiPayAdapter = new GaniPayAdapter();

// Auto-register on import
registerAdapter(ganiPayAdapter);
