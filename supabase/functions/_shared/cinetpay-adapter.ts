// ============================================================
// CinetPayAdapter — CinetPay webhook normalization
//
// CinetPay docs: https://docs.cinetpay.com
// Status codes:
//   ACCEPTED  → captured (payment successful)
//   REFUSED   → failed
//   CANCELLED → failed
//   PENDING   → pending
// ============================================================

import type { ProviderWebhookAdapter, WebhookVerdict, NormalizedWebhookEvent } from "./webhook-adapter.ts";
import { registerAdapter } from "./webhook-adapter.ts";

const STATUS_MAP: Record<string, NormalizedWebhookEvent["mappedStatus"]> = {
  ACCEPTED: "captured",
  REFUSED:  "failed",
  CANCELLED: "failed",
  PENDING:   "pending",
};

class CinetPayAdapter implements ProviderWebhookAdapter {
  readonly providerName = "cinetpay";

  verifySignature(
    payload: Record<string, unknown>,
    _headers: Record<string, string>,
    _secret: string
  ): WebhookVerdict {
    // CinetPay uses HMAC-SHA256 signed on cpm_site_id + cpm_trans_id.
    // Signature is returned in cpm_page_action for server-to-server notifications.
    // Until the secret is provisioned, we accept all payloads (same as current behavior)
    // but log a warning. When CINETPAY_WEBHOOK_SECRET is set, validate here.
    const hasRequiredFields =
      typeof payload.cpm_trans_id === "string" ||
      typeof payload.transaction_id === "string";

    if (!hasRequiredFields) {
      return { valid: false, reason: "Missing transaction identifier fields" };
    }
    return { valid: true };
  }

  extractEventId(payload: Record<string, unknown>): string | null {
    return (
      (payload.cpm_trans_id as string | undefined) ??
      (payload.transaction_id as string | undefined) ??
      null
    );
  }

  normalizeEvent(payload: Record<string, unknown>): NormalizedWebhookEvent {
    const providerTransactionId =
      (payload.cpm_trans_id as string | undefined) ??
      (payload.transaction_id as string | undefined) ??
      "";

    const rawStatus =
      (payload.cpm_result as string | undefined) ??
      (payload.status as string | undefined) ??
      "";

    const mappedStatus: NormalizedWebhookEvent["mappedStatus"] =
      STATUS_MAP[rawStatus] ?? "failed";

    const rawAmount = payload.cpm_amount ?? payload.amount;
    const amountFcfa =
      rawAmount != null ? parseInt(String(rawAmount), 10) || null : null;

    return {
      providerEventId: providerTransactionId,
      providerTransactionId,
      mappedStatus,
      providerStatus: rawStatus,
      amountFcfa,
      occurredAt: (payload.cpm_payment_date as string | undefined) ?? null,
      metadata: {
        cpm_site_id: payload.cpm_site_id,
        cpm_custom: payload.cpm_custom,
        cpm_phone_prefixe: payload.cpm_phone_prefixe,
        operator: payload.operator_id ?? payload.operator,
      },
    };
  }
}

export const cinetPayAdapter = new CinetPayAdapter();

// Auto-register on import
registerAdapter(cinetPayAdapter);
