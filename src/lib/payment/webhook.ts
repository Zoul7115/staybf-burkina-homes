// ============================================================
// Webhook handler — provider-agnostic event processing
// ============================================================

import type { WebhookEvent, PaymentStatus } from "./types";
import { paymentGateway } from "./gateway";
import { eventBus } from "@/lib/events/bus";
import type { StayBFEvent } from "@/lib/events/types";

export type WebhookProcessResult =
  | { processed: true; event: WebhookEvent }
  | { processed: false; reason: string };

// ── Webhook dispatcher ────────────────────────────────────────
// Routes incoming webhooks to the correct provider for verification,
// then emits domain events.

export async function processWebhook(opts: {
  providerName: string;
  rawBody: string;
  signature: string;
}): Promise<WebhookProcessResult> {
  try {
    const provider = paymentGateway.getProviderByName(opts.providerName);

    const verification = await provider.verifyWebhook(opts.rawBody, opts.signature, "");

    if (!verification.valid) {
      return { processed: false, reason: `Invalid webhook signature: ${verification.reason}` };
    }

    const webhookEvent = verification.event;
    const domainEvent = mapWebhookToDomainEvent(webhookEvent);

    if (domainEvent) {
      eventBus.emit(domainEvent);
    }

    return { processed: true, event: webhookEvent };
  } catch (e) {
    return { processed: false, reason: (e as Error).message };
  }
}

// ── Domain event mapping ──────────────────────────────────────

function mapWebhookToDomainEvent(event: WebhookEvent): StayBFEvent | null {
  if (!event.paymentId) return null;

  switch (event.mappedStatus as PaymentStatus) {
    case "captured":
      return {
        type: "PAYMENT_RECEIVED",
        payload: {
          paymentId: event.paymentId,
          bookingId: "",
          amountFcfa: event.amountFcfa ?? 0,
          method: event.provider,
        },
      };
    case "failed":
      return {
        type: "PAYMENT_FAILED",
        payload: { paymentId: event.paymentId, reason: "Provider reported failure" },
      };
    case "refunded":
    case "partially_refunded":
      return {
        type: "REFUND_CREATED",
        payload: {
          refundId: event.providerEventId,
          bookingId: "",
          amountFcfa: event.amountFcfa ?? 0,
        },
      };
    default:
      return null;
  }
}
