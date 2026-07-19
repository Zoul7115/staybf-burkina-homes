// ============================================================
// Notification Engine — event-driven multi-channel notifications
//
// Subscribes to the EventBus and dispatches notifications via:
//   - In-app (Supabase notifications table via Edge Function)
//   - Email (send-email Edge Function)
//   - SMS (send-sms Edge Function)
//   - WhatsApp (send-whatsapp Edge Function)
//
// Channel routing is configured per-event below.
// ============================================================

import { eventBus } from "@/lib/events/bus";
import type { StayBFEvent } from "@/lib/events/types";
import { callEdgeFunction } from "@/lib/storage";
import { logger } from "@/lib/observability/logger";

// ── Channel config ────────────────────────────────────────────

export type NotificationChannel = "in_app" | "email" | "sms" | "whatsapp";

type NotificationTemplate = {
  recipientRole: "traveler" | "host" | "admin";
  title: string;
  body: string;
  channels: NotificationChannel[];
  resourceType?: string;
  resourceId?: string;
};

// ── Template registry ─────────────────────────────────────────

function buildTemplates(event: StayBFEvent): NotificationTemplate[] {
  switch (event.type) {
    case "BOOKING_CREATED":
      return [
        {
          recipientRole: "traveler",
          title: "Réservation créée",
          body: `Votre réservation ${event.payload.reference} est en attente de paiement.`,
          channels: ["in_app", "email"],
          resourceType: "booking",
          resourceId: event.payload.bookingId,
        },
        {
          recipientRole: "host",
          title: "Nouvelle réservation",
          body: `Vous avez reçu une réservation (${event.payload.reference}) pour le ${event.payload.checkIn}.`,
          channels: ["in_app", "email", "sms"],
          resourceType: "booking",
          resourceId: event.payload.bookingId,
        },
      ];

    case "BOOKING_CONFIRMED":
      return [
        {
          recipientRole: "traveler",
          title: "Réservation confirmée",
          body: `Votre réservation ${event.payload.reference} est confirmée. Bon séjour !`,
          channels: ["in_app", "email", "whatsapp"],
          resourceType: "booking",
          resourceId: event.payload.bookingId,
        },
        {
          recipientRole: "host",
          title: "Paiement reçu",
          body: `La réservation ${event.payload.reference} a été payée et confirmée.`,
          channels: ["in_app", "email"],
          resourceType: "booking",
          resourceId: event.payload.bookingId,
        },
      ];

    case "BOOKING_CANCELLED":
      return [
        {
          recipientRole: "traveler",
          title: "Réservation annulée",
          body: `Votre réservation ${event.payload.reference} a été annulée.`,
          channels: ["in_app", "email"],
          resourceType: "booking",
          resourceId: event.payload.bookingId,
        },
        {
          recipientRole: "host",
          title: "Réservation annulée",
          body: `La réservation ${event.payload.reference} a été annulée.`,
          channels: ["in_app"],
          resourceType: "booking",
          resourceId: event.payload.bookingId,
        },
      ];

    case "PAYMENT_RECEIVED":
      return [
        {
          recipientRole: "traveler",
          title: "Paiement reçu",
          body: `Votre paiement de ${event.payload.amountFcfa.toLocaleString("fr-FR")} FCFA a été reçu.`,
          channels: ["in_app", "email"],
          resourceType: "payment",
          resourceId: event.payload.paymentId,
        },
      ];

    case "PAYMENT_FAILED":
      return [
        {
          recipientRole: "traveler",
          title: "Échec du paiement",
          body: `Votre paiement a échoué. Veuillez réessayer.`,
          channels: ["in_app", "email"],
          resourceType: "payment",
          resourceId: event.payload.paymentId,
        },
      ];

    case "CHECKOUT_COMPLETED":
      return [
        {
          recipientRole: "traveler",
          title: "Séjour terminé",
          body: `Votre séjour est terminé. Merci de laisser un avis !`,
          channels: ["in_app", "email"],
          resourceType: "booking",
          resourceId: event.payload.bookingId,
        },
        {
          recipientRole: "host",
          title: "Fonds libérés",
          body: `Les fonds de la réservation ${event.payload.reference} (${event.payload.hostPayoutAmountFcfa.toLocaleString("fr-FR")} FCFA) sont maintenant disponibles.`,
          channels: ["in_app"],
          resourceType: "booking",
          resourceId: event.payload.bookingId,
        },
      ];

    case "FUNDS_RELEASED":
      return [
        {
          recipientRole: "host",
          title: "Fonds disponibles",
          body: `${event.payload.amountFcfa.toLocaleString("fr-FR")} FCFA sont maintenant disponibles pour retrait.`,
          channels: ["in_app", "email"],
          resourceType: "booking",
          resourceId: event.payload.bookingId,
        },
      ];

    case "WITHDRAWAL_REQUESTED":
      return [
        {
          recipientRole: "host",
          title: "Retrait demandé",
          body: `Votre demande de retrait de ${event.payload.amountFcfa.toLocaleString("fr-FR")} FCFA est en cours de traitement.`,
          channels: ["in_app", "email"],
          resourceType: "payout",
          resourceId: event.payload.payoutId,
        },
      ];

    case "WITHDRAWAL_PAID":
      return [
        {
          recipientRole: "host",
          title: "Retrait effectué",
          body: `Votre retrait de ${event.payload.amountFcfa.toLocaleString("fr-FR")} FCFA a été virement sur votre compte.`,
          channels: ["in_app", "email", "sms"],
          resourceType: "payout",
          resourceId: event.payload.payoutId,
        },
      ];

    case "WITHDRAWAL_FAILED":
      return [
        {
          recipientRole: "host",
          title: "Retrait échoué",
          body: `Votre retrait de ${event.payload.amountFcfa.toLocaleString("fr-FR")} FCFA a échoué. ${event.payload.reason}`,
          channels: ["in_app", "email"],
          resourceType: "payout",
          resourceId: event.payload.payoutId,
        },
      ];

    case "REFUND_CREATED":
      return [
        {
          recipientRole: "traveler",
          title: "Remboursement initié",
          body: `Un remboursement de ${event.payload.amountFcfa.toLocaleString("fr-FR")} FCFA a été initié.`,
          channels: ["in_app", "email"],
          resourceType: "refund",
          resourceId: event.payload.refundId,
        },
      ];

    case "REFUND_COMPLETED":
      return [
        {
          recipientRole: "traveler",
          title: "Remboursement effectué",
          body: `Votre remboursement de ${event.payload.amountFcfa.toLocaleString("fr-FR")} FCFA a été traité.`,
          channels: ["in_app", "email", "sms"],
          resourceType: "refund",
          resourceId: event.payload.refundId,
        },
      ];

    case "REVIEW_SUBMITTED":
      return [
        {
          recipientRole: "host",
          title: "Nouvel avis",
          body: `Un voyageur a laissé un avis (${event.payload.rating}/5).`,
          channels: ["in_app", "email"],
          resourceType: "review",
          resourceId: event.payload.reviewId,
        },
      ];

    default:
      return [];
  }
}

// ── Dispatcher ────────────────────────────────────────────────

async function dispatch(template: NotificationTemplate, recipientId: string): Promise<void> {
  const notifBody = {
    user_id: recipientId,
    title: template.title,
    body: template.body,
    resource_type: template.resourceType,
    resource_id: template.resourceId,
    channels: template.channels,
  };

  await callEdgeFunction("send-notification", notifBody).catch((err) => {
    logger.error("NotificationEngine dispatch failed", { error: (err as Error)?.message });
  });
}

// ── Engine bootstrap ──────────────────────────────────────────

let _initialized = false;

export function initNotificationEngine(opts: {
  getRecipientId: (role: "traveler" | "host" | "admin", event: StayBFEvent) => string | null;
}): () => void {
  if (_initialized) return () => {};
  _initialized = true;

  const subId = eventBus.onAny(async (event) => {
    const templates = buildTemplates(event);
    await Promise.all(
      templates.map((template) => {
        const recipientId = opts.getRecipientId(template.recipientRole, event);
        return recipientId ? dispatch(template, recipientId) : Promise.resolve();
      })
    );
  });

  return () => {
    eventBus.off(subId);
    _initialized = false;
  };
}
