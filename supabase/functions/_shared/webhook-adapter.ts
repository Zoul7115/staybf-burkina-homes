// ============================================================
// ProviderWebhookAdapter — payment provider abstraction
//
// The webhook processor must NOT know which provider sent the event.
// All provider-specific parsing lives in concrete adapters.
// To add a new provider: implement this interface, register in
// ADAPTER_REGISTRY below, done. No other changes needed.
// ============================================================

export type WebhookVerdict =
  | { valid: true }
  | { valid: false; reason: string };

export type NormalizedWebhookEvent = {
  // Stable provider-assigned event id (used for dedup)
  providerEventId: string;
  // Provider-assigned transaction reference
  providerTransactionId: string;
  // Normalized status — maps provider codes to canonical values
  mappedStatus: "captured" | "failed" | "pending" | "refunded";
  // Raw provider status string (stored for audit)
  providerStatus: string;
  // Amount in the currency's smallest unit (FCFA = whole unit)
  amountFcfa: number | null;
  // ISO-8601 timestamp from provider, or null
  occurredAt: string | null;
  // Arbitrary key-value metadata extracted from the payload
  metadata: Record<string, unknown>;
};

export interface ProviderWebhookAdapter {
  // Provider identifier — must match payments.provider CHECK constraint
  readonly providerName: string;

  // Verify the request authenticity before touching any data
  verifySignature(payload: Record<string, unknown>, headers: Record<string, string>, secret: string): WebhookVerdict;

  // Extract the stable event id from the raw payload
  extractEventId(payload: Record<string, unknown>): string | null;

  // Map raw provider payload to canonical event shape
  normalizeEvent(payload: Record<string, unknown>): NormalizedWebhookEvent;
}

// ── Adapter registry ──────────────────────────────────────────

const ADAPTERS = new Map<string, ProviderWebhookAdapter>();

export function registerAdapter(adapter: ProviderWebhookAdapter): void {
  ADAPTERS.set(adapter.providerName, adapter);
}

export function getAdapter(providerName: string): ProviderWebhookAdapter | null {
  return ADAPTERS.get(providerName) ?? null;
}

export function registeredProviders(): string[] {
  return Array.from(ADAPTERS.keys());
}
