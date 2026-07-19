// ============================================================
// GaniPayProvider — complete GaniPay integration
//
// GaniPay is a West-African mobile-money gateway serving Burkina Faso.
// Supported methods: orange_money, moov_money
//
// API base URLs:
//   Sandbox:    https://sandbox.ganipay.com/v1
//   Production: https://api.ganipay.com/v1
//
// Authentication: Authorization: Bearer <API_KEY>
// Webhook signature: HMAC-SHA256 of raw body, header: X-GaniPay-Signature
//
// This is the ONLY file that imports GaniPay-specific logic.
// All business code depends on PaymentProvider / PayoutProvider.
// ============================================================

import type {
  PaymentProvider,
  ProviderConfig,
  CreateIntentRequest,
} from "../provider";
import type {
  PaymentIntentStatus,
  PaymentMethodId,
  RefundRequest,
  RefundResult,
  WebhookVerificationResult,
  WebhookEvent,
} from "../types";
import type {
  PayoutProvider,
  PayoutRequest,
  PayoutResult,
  PayoutStatusResult,
  PayoutCancelResult,
} from "./PayoutProvider";

// ── GaniPay API types ─────────────────────────────────────────

type GaniPayPaymentStatus =
  | "pending"
  | "processing"
  | "successful"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded";

type GaniPayPaymentResponse = {
  id: string;
  reference: string;
  status: GaniPayPaymentStatus;
  amount: number;
  currency: string;
  checkout_url: string | null;
  expires_at: string;
  created_at: string;
  metadata: Record<string, unknown>;
};

type GaniPayPaymentStatusResponse = {
  id: string;
  reference: string;
  status: GaniPayPaymentStatus;
  amount: number;
  currency: string;
  paid_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  operator: string | null;
  phone: string | null;
};

type GaniPayRefundResponse = {
  id: string;
  payment_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  amount: number;
  currency: string;
  created_at: string;
};

type GaniPayPayoutResponse = {
  id: string;
  reference: string;
  status: "pending" | "processing" | "paid" | "failed" | "cancelled";
  amount: number;
  currency: string;
  method: string;
  phone: string | null;
  bank_account: string | null;
  estimated_arrival: string | null;
  created_at: string;
};

type GaniPayPayoutStatusResponse = GaniPayPayoutResponse & {
  paid_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
};

type GaniPayWebhookPayload = {
  event_id: string;
  event_type: "payment.successful" | "payment.failed" | "payment.cancelled" | "refund.completed" | "payout.paid" | "payout.failed";
  payment_id?: string;
  payout_id?: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  occurred_at: string;
  metadata?: Record<string, unknown>;
};

// ── Status mappings ───────────────────────────────────────────

const PAYMENT_STATUS_MAP: Record<GaniPayPaymentStatus, PaymentIntentStatus> = {
  pending:     "pending",
  processing:  "processing",
  successful:  "captured",
  failed:      "failed",
  cancelled:   "cancelled",
  expired:     "expired",
  refunded:    "refunded",
};

export type GaniPayConfig = {
  apiKey: string;
  environment: "sandbox" | "production";
  webhookSecret: string;
  callbackUrl: string;
  cancelUrl: string;
};

// ── GaniPay HTTP client ───────────────────────────────────────

class GaniPayClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: GaniPayConfig) {
    this.baseUrl = config.environment === "production"
      ? "https://api.ganipay.com/v1"
      : "https://sandbox.ganipay.com/v1";
    this.apiKey = config.apiKey;
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let msg = `GaniPay API error ${res.status}`;
      try {
        const json = JSON.parse(text);
        msg = json.message ?? json.error ?? msg;
      } catch {
        msg = text || msg;
      }
      throw new Error(msg);
    }

    return res.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let msg = `GaniPay API error ${res.status}`;
      try {
        const json = JSON.parse(text);
        msg = json.message ?? json.error ?? msg;
      } catch {
        msg = text || msg;
      }
      throw new Error(msg);
    }

    return res.json() as Promise<T>;
  }
}

// ── GaniPayProvider — implements PaymentProvider + PayoutProvider ──

export class GaniPayProvider implements PaymentProvider, PayoutProvider {
  readonly name = "ganipay";
  readonly supportedMethods: PaymentMethodId[] = ["orange_money", "moov_money"];

  private readonly client: GaniPayClient;
  private readonly config: GaniPayConfig;

  constructor(config: GaniPayConfig) {
    this.config = config;
    this.client = new GaniPayClient(config);
  }

  // ── PaymentProvider: createIntent ─────────────────────────

  async createIntent(request: CreateIntentRequest): Promise<{
    providerTransactionId: string;
    providerRedirectUrl: string | null;
    providerCheckoutToken: string | null;
    requiresAction: boolean;
    actionUrl: string | null;
    expiresAt: string;
  }> {
    const body: Record<string, unknown> = {
      reference:      request.idempotencyKey,
      amount:         request.amountFcfa,
      currency:       "XOF",
      method:         request.method,
      description:    request.description,
      callback_url:   this.config.callbackUrl,
      cancel_url:     this.config.cancelUrl,
      customer: {
        id:    request.payerId,
        email: request.payerEmail,
        phone: request.payerPhone,
      },
      metadata: {
        booking_id:        request.bookingId,
        booking_reference: request.bookingReference,
        ...request.metadata,
      },
    };

    const res = await this.client.post<GaniPayPaymentResponse>("/payments", body);

    return {
      providerTransactionId:  res.id,
      providerRedirectUrl:    res.checkout_url,
      providerCheckoutToken:  null,
      requiresAction:         res.checkout_url !== null,
      actionUrl:              res.checkout_url,
      expiresAt:              res.expires_at,
    };
  }

  // ── PaymentProvider: getStatus ────────────────────────────

  async getStatus(providerTransactionId: string): Promise<PaymentIntentStatus> {
    const res = await this.client.get<GaniPayPaymentStatusResponse>(
      `/payments/${providerTransactionId}`
    );
    return PAYMENT_STATUS_MAP[res.status] ?? "failed";
  }

  // ── PaymentProvider: capture ──────────────────────────────
  // GaniPay auto-captures on authorization — no explicit capture step.

  async capture(_providerTransactionId: string, _amountFcfa?: number): Promise<void> {
    // No-op: GaniPay auto-captures
  }

  // ── PaymentProvider: cancel ───────────────────────────────

  async cancel(providerTransactionId: string, _reason?: string): Promise<void> {
    await this.client.post(`/payments/${providerTransactionId}/cancel`, {});
  }

  // ── PaymentProvider: refund ───────────────────────────────

  async refund(request: RefundRequest & { providerTransactionId: string }): Promise<RefundResult> {
    const res = await this.client.post<GaniPayRefundResponse>(
      `/payments/${request.providerTransactionId}/refund`,
      {
        amount:     request.refundAmountFcfa,
        reason:     request.reason,
        idempotency_key: request.idempotencyKey,
      }
    );

    return {
      refundId:        res.id,
      status:          res.status === "completed" ? "completed" : res.status === "failed" ? "failed" : "processing",
      refundAmountFcfa: res.amount,
      providerRefundId: res.id,
      processedAt:     res.status === "completed" ? res.created_at : null,
    };
  }

  // ── PaymentProvider: verifyWebhook ────────────────────────

  async verifyWebhook(
    payload: string,
    signature: string,
    secret: string
  ): Promise<WebhookVerificationResult> {
    if (!secret) {
      return { valid: false, reason: "GANIPAY_WEBHOOK_SECRET not configured" };
    }

    const expectedSig = await hmacSha256(secret, payload);
    if (!timingSafeEqual(expectedSig, signature)) {
      return { valid: false, reason: "Signature mismatch" };
    }

    let parsed: GaniPayWebhookPayload;
    try {
      parsed = JSON.parse(payload) as GaniPayWebhookPayload;
    } catch {
      return { valid: false, reason: "Invalid JSON payload" };
    }

    if (!parsed.event_id || !parsed.event_type) {
      return { valid: false, reason: "Missing required fields: event_id, event_type" };
    }

    const event = this.mapWebhookPayload(parsed);
    return { valid: true, event };
  }

  // ── PayoutProvider: createPayout ─────────────────────────

  async createPayout(request: PayoutRequest): Promise<PayoutResult> {
    const body: Record<string, unknown> = {
      reference:        request.idempotencyKey,
      amount:           request.amountFcfa,
      currency:         "XOF",
      method:           request.method,
      description:      request.description,
      metadata: {
        payout_id: request.payoutId,
        host_id:   request.hostId,
        ...request.metadata,
      },
    };

    // Add method-specific fields
    const details = parseAccountDetails(request.accountDetails);
    if (request.method === "bank") {
      body.bank_account = details.account;
      body.bank_code    = details.code ?? null;
    } else {
      body.phone = details.phone ?? request.accountDetails;
    }

    const res = await this.client.post<GaniPayPayoutResponse>("/payouts", body);

    return {
      providerPayoutId:     res.id,
      status:               res.status === "paid" ? "paid" : res.status === "failed" ? "failed" : "processing",
      estimatedArrivalAt:   res.estimated_arrival,
      rawResponse:          res as unknown as Record<string, unknown>,
    };
  }

  // ── PayoutProvider: getPayout ─────────────────────────────

  async getPayout(providerPayoutId: string): Promise<PayoutStatusResult> {
    const res = await this.client.get<GaniPayPayoutStatusResponse>(
      `/payouts/${providerPayoutId}`
    );

    return {
      providerPayoutId: res.id,
      status:           res.status === "paid" ? "paid" : res.status === "failed" ? "failed" : res.status === "cancelled" ? "failed" : "processing",
      paidAt:           res.paid_at,
      failureReason:    res.failure_reason,
      rawResponse:      res as unknown as Record<string, unknown>,
    };
  }

  // ── PayoutProvider: cancelPayout ─────────────────────────

  async cancelPayout(providerPayoutId: string, reason?: string): Promise<PayoutCancelResult> {
    try {
      await this.client.post(`/payouts/${providerPayoutId}/cancel`, { reason: reason ?? "Cancelled by admin" });
      return { cancelled: true, reason: null };
    } catch (e) {
      return { cancelled: false, reason: (e as Error).message };
    }
  }

  // ── Private: map webhook payload ──────────────────────────

  private mapWebhookPayload(parsed: GaniPayWebhookPayload): WebhookEvent {
    const type = EVENT_TYPE_MAP[parsed.event_type] ?? "payment.failed";
    const status = STATUS_FROM_EVENT[parsed.event_type] ?? "failed";

    return {
      id:                    parsed.event_id,
      provider:              "ganipay",
      providerEventId:       parsed.event_id,
      type,
      paymentId:             parsed.payment_id ?? null,
      providerTransactionId: parsed.payment_id ?? parsed.payout_id ?? parsed.reference,
      mappedStatus:          status,
      amountFcfa:            parsed.amount,
      rawPayload:            parsed as unknown as Record<string, unknown>,
      receivedAt:            parsed.occurred_at,
    };
  }
}

// ── Event type maps ───────────────────────────────────────────

const EVENT_TYPE_MAP: Record<GaniPayWebhookPayload["event_type"], WebhookEvent["type"]> = {
  "payment.successful": "payment.captured",
  "payment.failed":     "payment.failed",
  "payment.cancelled":  "payment.cancelled",
  "refund.completed":   "refund.completed",
  // Payout events are routed separately in the webhook EF and never reach verifyWebhook
  "payout.paid":        "payment.captured",
  "payout.failed":      "payment.failed",
};

import type { PaymentStatus } from "../types";

const STATUS_FROM_EVENT: Record<GaniPayWebhookPayload["event_type"], PaymentStatus> = {
  "payment.successful": "captured",
  "payment.failed":     "failed",
  "payment.cancelled":  "cancelled",
  "refund.completed":   "refunded",
  // Payout events never flow through verifyWebhook — handled by handlePayoutEvent in EF
  "payout.paid":        "captured",
  "payout.failed":      "failed",
};

// ── Crypto helpers (browser + Node compatible) ────────────────

async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ── Account details parser ────────────────────────────────────
// accountDetails may be a JSON string or plain phone number / account

function parseAccountDetails(raw: string): { phone?: string; account?: string; code?: string } {
  try {
    return JSON.parse(raw) as { phone?: string; account?: string; code?: string };
  } catch {
    return { phone: raw };
  }
}

// ── Factory ───────────────────────────────────────────────────

export function createGaniPayProvider(config: GaniPayConfig): GaniPayProvider {
  return new GaniPayProvider(config);
}

// ── Default config (from environment variables) ───────────────
// Used at app startup / Edge Function boot

export function ganipayConfigFromEnv(): GaniPayConfig {
  const apiKey = (typeof process !== "undefined" ? process.env.GANIPAY_API_KEY : undefined)
    ?? (typeof Deno !== "undefined" ? Deno.env.get("GANIPAY_API_KEY") : undefined)
    ?? "";
  const webhookSecret = (typeof process !== "undefined" ? process.env.GANIPAY_WEBHOOK_SECRET : undefined)
    ?? (typeof Deno !== "undefined" ? Deno.env.get("GANIPAY_WEBHOOK_SECRET") : undefined)
    ?? "";
  const env = (typeof process !== "undefined" ? process.env.GANIPAY_ENV : undefined)
    ?? (typeof Deno !== "undefined" ? Deno.env.get("GANIPAY_ENV") : undefined)
    ?? "sandbox";
  const callbackUrl = (typeof process !== "undefined" ? process.env.GANIPAY_CALLBACK_URL : undefined)
    ?? (typeof Deno !== "undefined" ? Deno.env.get("GANIPAY_CALLBACK_URL") : undefined)
    ?? "";
  const cancelUrl = (typeof process !== "undefined" ? process.env.GANIPAY_CANCEL_URL : undefined)
    ?? (typeof Deno !== "undefined" ? Deno.env.get("GANIPAY_CANCEL_URL") : undefined)
    ?? "";

  return {
    apiKey,
    webhookSecret,
    environment: env === "production" ? "production" : "sandbox",
    callbackUrl,
    cancelUrl,
  };
}
