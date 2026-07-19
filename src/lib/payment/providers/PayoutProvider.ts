// ============================================================
// PayoutProvider — provider-agnostic payout interface
//
// Every payout provider (GaniPay, CinetPay, manual wire, …)
// MUST implement this interface. The withdrawal engine never
// imports a concrete provider — only this interface.
//
// To integrate GaniPay:
//   1. Implement GaniPayProvider (stub already exists)
//   2. Register it in the dispatch-withdrawal Edge Function
//   3. Zero other changes required.
// ============================================================

export type PayoutRequest = {
  payoutId: string;
  hostId: string;
  amountFcfa: number;
  currency: "XOF";
  method: "orange_money" | "moov_money" | "bank";
  accountDetails: string;
  reference: string;
  description: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
};

export type PayoutResult = {
  providerPayoutId: string;
  status: "pending" | "processing" | "paid" | "failed";
  estimatedArrivalAt: string | null;
  rawResponse: Record<string, unknown>;
};

export type PayoutStatusResult = {
  providerPayoutId: string;
  status: "pending" | "processing" | "paid" | "failed";
  paidAt: string | null;
  failureReason: string | null;
  rawResponse: Record<string, unknown>;
};

export type PayoutCancelResult = {
  cancelled: boolean;
  reason: string | null;
};

export interface PayoutProvider {
  readonly name: string;
  readonly supportedMethods: string[];

  /**
   * Initiate a payout to the host's account.
   * Returns provider-specific identifiers for tracking.
   */
  createPayout(request: PayoutRequest): Promise<PayoutResult>;

  /**
   * Poll the provider for the current status of a payout.
   * Used for reconciliation and retry logic.
   */
  getPayout(providerPayoutId: string): Promise<PayoutStatusResult>;

  /**
   * Cancel a pending payout before it is processed.
   * Not all providers support cancellation.
   */
  cancelPayout(providerPayoutId: string, reason?: string): Promise<PayoutCancelResult>;
}
