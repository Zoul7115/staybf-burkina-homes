// ============================================================
// PaymentGateway — orchestrator
//
// The gateway:
//   1. Selects the correct provider for a given payment method
//   2. Manages idempotency
//   3. Records all operations in the DB (via Edge Functions)
//   4. Emits domain events on status changes
//
// Providers are registered at startup — the gateway never
// knows which provider is active until registration.
// ============================================================

import type { PaymentProvider } from "./provider";
import type {
  PaymentIntent,
  PaymentMethodId,
  PaymentIntentStatus,
  RefundRequest,
  RefundResult,
} from "./types";
import type { CreateIntentRequest } from "./provider";
import { callEdgeFunction } from "@/lib/storage";
import { eventBus } from "@/lib/events/bus";

// ── Registry ──────────────────────────────────────────────────

class PaymentGateway {
  private providers = new Map<string, PaymentProvider>();
  private methodProviderMap = new Map<PaymentMethodId, string>();

  register(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
    for (const method of provider.supportedMethods) {
      this.methodProviderMap.set(method, provider.name);
    }
  }

  getProvider(method: PaymentMethodId): PaymentProvider {
    const name = this.methodProviderMap.get(method);
    if (!name) throw new Error(`No payment provider registered for method: ${method}`);
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Provider "${name}" registered but not found`);
    return provider;
  }

  getProviderByName(name: string): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Provider "${name}" not registered`);
    return provider;
  }

  listRegistered(): string[] {
    return Array.from(this.providers.keys());
  }

  isMethodSupported(method: PaymentMethodId): boolean {
    return this.methodProviderMap.has(method);
  }

  // ── Intent lifecycle ────────────────────────────────────────

  async createIntent(request: CreateIntentRequest): Promise<PaymentIntent> {
    const provider = this.getProvider(request.method);

    const providerResult = await provider.createIntent(request);

    // Persist via Edge Function (service_role write)
    const result = await callEdgeFunction<{ payment: PaymentIntent }>("create-payment-intent", {
      booking_id: request.bookingId,
      payer_id: request.payerId,
      method: request.method,
      provider: provider.name,
      amount_fcfa: request.amountFcfa,
      idempotency_key: request.idempotencyKey,
      provider_transaction_id: providerResult.providerTransactionId,
      expires_at: providerResult.expiresAt,
      metadata: request.metadata,
    });

    eventBus.emit({
      type: "PAYMENT_INTENT_CREATED",
      payload: { intentId: result.payment.id, bookingId: request.bookingId, amountFcfa: request.amountFcfa },
    });

    return result.payment;
  }

  async pollStatus(providerName: string, providerTransactionId: string): Promise<PaymentIntentStatus> {
    const provider = this.getProviderByName(providerName);
    return provider.getStatus(providerTransactionId);
  }

  async capture(providerName: string, providerTransactionId: string, amountFcfa?: number): Promise<void> {
    const provider = this.getProviderByName(providerName);
    await provider.capture(providerTransactionId, amountFcfa);
  }

  async cancel(providerName: string, providerTransactionId: string, reason?: string): Promise<void> {
    const provider = this.getProviderByName(providerName);
    await provider.cancel(providerTransactionId, reason);
  }

  async refund(providerName: string, request: RefundRequest & { providerTransactionId: string }): Promise<RefundResult> {
    const provider = this.getProviderByName(providerName);
    const result = await provider.refund(request);

    eventBus.emit({
      type: "REFUND_CREATED",
      payload: { refundId: result.refundId, bookingId: request.bookingId, amountFcfa: result.refundAmountFcfa },
    });

    return result;
  }
}

// ── Singleton ─────────────────────────────────────────────────
// Register providers at app startup in src/main.tsx or a provider module.

export const paymentGateway = new PaymentGateway();
