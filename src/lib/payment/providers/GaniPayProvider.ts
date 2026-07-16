// ============================================================
// GaniPayProvider — stub implementation of PayoutProvider
//
// This is an empty stub. GaniPay is NOT integrated.
// When GaniPay credentials and API docs are available:
//   1. Fill in createPayout() with the actual API call
//   2. Fill in getPayout() for status polling
//   3. Fill in cancelPayout() if supported
//   4. Register in dispatch-withdrawal EF
//
// The withdrawal engine is provider-agnostic by design —
// no other file imports GaniPay-specific logic.
// ============================================================

import type {
  PayoutProvider,
  PayoutRequest,
  PayoutResult,
  PayoutStatusResult,
  PayoutCancelResult,
} from "./PayoutProvider";

export type GaniPayConfig = {
  apiKey: string;
  baseUrl: string;
  environment: "sandbox" | "production";
};

export class GaniPayProvider implements PayoutProvider {
  readonly name = "ganipay";
  readonly supportedMethods = ["orange_money", "moov_money"];

  constructor(_config: GaniPayConfig) {
    // config will be used once the provider is integrated
  }

  async createPayout(_request: PayoutRequest): Promise<PayoutResult> {
    throw new Error("GaniPayProvider: not yet integrated. Use manual dispatch.");
  }

  async getPayout(_providerPayoutId: string): Promise<PayoutStatusResult> {
    throw new Error("GaniPayProvider: not yet integrated.");
  }

  async cancelPayout(_providerPayoutId: string, _reason?: string): Promise<PayoutCancelResult> {
    throw new Error("GaniPayProvider: not yet integrated.");
  }
}
