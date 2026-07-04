// ============================================================
// PaymentProvider — abstract interface
//
// Every payment provider (FedaPay, PayDunya, Flutterwave, ...)
// MUST implement this interface. Nothing in the application
// depends on a concrete provider — only on this interface.
//
// To integrate FedaPay:
//   1. Create src/lib/payment/providers/fedapay.ts
//   2. Implement FedaPayProvider extends PaymentProvider
//   3. Register: gateway.register("fedapay", new FedaPayProvider(config))
//   4. Zero other changes required.
// ============================================================

import type {
  PaymentIntent,
  PaymentIntentStatus,
  PaymentMethodId,
  RefundRequest,
  RefundResult,
  WebhookVerificationResult,
} from "./types";

// ── Provider configuration ────────────────────────────────────

export type ProviderConfig = {
  publicKey: string;
  secretKey: string;
  environment: "sandbox" | "production";
  webhookSecret: string;
  callbackUrl: string;
  cancelUrl: string;
};

// ── Create intent request ─────────────────────────────────────

export type CreateIntentRequest = {
  bookingId: string;
  bookingReference: string;
  payerId: string;
  payerEmail: string;
  payerPhone: string;
  amountFcfa: number;
  currency: "XOF";
  method: PaymentMethodId;
  idempotencyKey: string;
  description: string;
  metadata: Record<string, unknown>;
};

// ── Provider interface ────────────────────────────────────────

export interface PaymentProvider {
  readonly name: string;
  readonly supportedMethods: PaymentMethodId[];

  /**
   * Create a payment intent with the provider.
   * Returns a partial PaymentIntent — the gateway completes the DB write.
   */
  createIntent(request: CreateIntentRequest): Promise<{
    providerTransactionId: string;
    providerRedirectUrl: string | null;
    providerCheckoutToken: string | null;
    requiresAction: boolean;
    actionUrl: string | null;
    expiresAt: string;
  }>;

  /**
   * Poll the provider for the current status of a transaction.
   * Used when webhooks are not available or for reconciliation.
   */
  getStatus(providerTransactionId: string): Promise<PaymentIntentStatus>;

  /**
   * Capture a previously authorized payment.
   * Only needed for two-step auth/capture flows.
   */
  capture(providerTransactionId: string, amountFcfa?: number): Promise<void>;

  /**
   * Cancel a pending or authorized payment.
   */
  cancel(providerTransactionId: string, reason?: string): Promise<void>;

  /**
   * Issue a refund for a captured payment.
   */
  refund(request: RefundRequest & { providerTransactionId: string }): Promise<RefundResult>;

  /**
   * Verify and parse an incoming webhook payload.
   * Returns the parsed event or an error if signature is invalid.
   */
  verifyWebhook(
    payload: string,
    signature: string,
    secret: string
  ): Promise<WebhookVerificationResult>;
}

// ── Provider adapter base ─────────────────────────────────────
// Concrete providers extend this for shared utilities.

export abstract class BasePaymentProvider implements PaymentProvider {
  abstract readonly name: string;
  abstract readonly supportedMethods: PaymentMethodId[];
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract createIntent(request: CreateIntentRequest): Promise<{
    providerTransactionId: string;
    providerRedirectUrl: string | null;
    providerCheckoutToken: string | null;
    requiresAction: boolean;
    actionUrl: string | null;
    expiresAt: string;
  }>;

  abstract getStatus(providerTransactionId: string): Promise<PaymentIntentStatus>;

  async capture(_providerTransactionId: string, _amountFcfa?: number): Promise<void> {
    // Default: no-op for providers that auto-capture on authorization
  }

  async cancel(_providerTransactionId: string, _reason?: string): Promise<void> {
    throw new Error(`${this.name}: cancel not implemented`);
  }

  abstract refund(request: RefundRequest & { providerTransactionId: string }): Promise<RefundResult>;
  abstract verifyWebhook(payload: string, signature: string, secret: string): Promise<WebhookVerificationResult>;

  protected ttlFromNow(minutes: number): string {
    return new Date(Date.now() + minutes * 60_000).toISOString();
  }
}
