// ============================================================
// GaniPay Sandbox — Scénarios d'intégration
//
// Couvre les 8 cas demandés pour la certification sandbox :
//   1. Paiement réussi (payment.successful)
//   2. Paiement refusé (payment.failed)
//   3. Timeout réseau
//   4. Double webhook (idempotence)
//   5. Webhook en retard (freshness check)
//   6. Double paiement (même idempotencyKey)
//   7. Refund complet
//   8. Payout hôte
//
// Tous les tests sont purement unitaires (fetch mocké).
// Aucun appel réseau réel. Données fixture réalistes (XOF, BF).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GaniPayProvider } from "../providers/GaniPayProvider";
import type { GaniPayConfig } from "../providers/GaniPayProvider";

// ── Config sandbox ────────────────────────────────────────────

const SANDBOX_CONFIG: GaniPayConfig = {
  apiKey:        "test_sandbox_key_staybf",
  environment:   "sandbox",
  webhookSecret: "sandbox_webhook_secret_staybf",
  callbackUrl:   "https://staybf.com/checkout/success",
  cancelUrl:     "https://staybf.com/checkout",
};

// ── Fixtures ──────────────────────────────────────────────────

const BOOKING_FIXTURES = {
  id:        "bk-ouaga-001",
  reference: "STBF-2026-0001",
  hostId:    "host-ouaga-001",
  traveler: {
    id:    "traveler-ouaga-001",
    email: "kader.traore@email.bf",
    phone: "70000001",
  },
};

const INTENT_REQUEST = {
  bookingId:        BOOKING_FIXTURES.id,
  bookingReference: BOOKING_FIXTURES.reference,
  payerId:          BOOKING_FIXTURES.traveler.id,
  payerEmail:       BOOKING_FIXTURES.traveler.email,
  payerPhone:       BOOKING_FIXTURES.traveler.phone,
  amountFcfa:       55_000,
  currency:         "XOF" as const,
  method:           "orange_money" as const,
  idempotencyKey:   "idem-bk-ouaga-001",
  description:      `Réservation ${BOOKING_FIXTURES.reference}`,
  metadata:         { booking_id: BOOKING_FIXTURES.id },
};

// ── Mock helpers ──────────────────────────────────────────────

function mockFetch(responses: Array<{ body: unknown; status?: number }>) {
  let call = 0;
  global.fetch = vi.fn().mockImplementation(() => {
    const r = responses[call] ?? responses[responses.length - 1];
    call++;
    const status = r.status ?? 200;
    return Promise.resolve({
      ok:     status >= 200 && status < 300,
      status,
      text:   async () => JSON.stringify(r.body),
      json:   async () => r.body,
    });
  });
}

function mockFetchNetworkError(message = "Network error") {
  global.fetch = vi.fn().mockRejectedValue(new Error(message));
}

async function buildWebhookSignature(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

let provider: GaniPayProvider;

beforeEach(() => {
  provider = new GaniPayProvider(SANDBOX_CONFIG);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Scénario 1 : Paiement réussi ─────────────────────────────
// GaniPay accepte le paiement mobile money, retourne checkout_url.
// Le webhook payment.successful confirme la réservation.

describe("Scénario 1 — Paiement réussi (Orange Money)", () => {
  it("createIntent retourne checkout_url et providerTransactionId", async () => {
    mockFetch([{
      body: {
        id:           "gp-pay-ouaga-001",
        reference:    INTENT_REQUEST.idempotencyKey,
        status:       "pending",
        amount:       55_000,
        currency:     "XOF",
        checkout_url: "https://sandbox.ganipay.com/checkout/gp-pay-ouaga-001",
        expires_at:   "2026-07-18T22:00:00Z",
        created_at:   "2026-07-18T21:30:00Z",
      },
    }]);

    const result = await provider.createIntent(INTENT_REQUEST);

    expect(result.providerTransactionId).toBe("gp-pay-ouaga-001");
    expect(result.providerRedirectUrl).toBe("https://sandbox.ganipay.com/checkout/gp-pay-ouaga-001");
    expect(result.requiresAction).toBe(true);
    expect(result.actionUrl).toBe("https://sandbox.ganipay.com/checkout/gp-pay-ouaga-001");
    expect(result.expiresAt).toBe("2026-07-18T22:00:00Z");
  });

  it("webhook payment.successful → status captured avec signature valide", async () => {
    const payloadObj = {
      event_id:    "evt-success-001",
      event_type:  "payment.successful",
      payment_id:  "gp-pay-ouaga-001",
      reference:   INTENT_REQUEST.idempotencyKey,
      amount:      55_000,
      currency:    "XOF",
      status:      "successful",
      occurred_at: new Date().toISOString(),
      operator:    "orange",
      phone:       BOOKING_FIXTURES.traveler.phone,
      metadata:    { booking_id: BOOKING_FIXTURES.id },
    };
    const rawBody = JSON.stringify(payloadObj);
    const signature = await buildWebhookSignature(SANDBOX_CONFIG.webhookSecret, rawBody);

    const result = await provider.verifyWebhook(rawBody, signature, SANDBOX_CONFIG.webhookSecret);

    expect(result.valid).toBe(true);
    expect(result.event?.type).toBe("payment.captured");
    expect(result.event?.mappedStatus).toBe("captured");
    expect(result.event?.providerEventId).toBe("evt-success-001");
    expect(result.event?.amountFcfa).toBe(55_000);
  });

  it("polling getStatus retourne captured après confirmation", async () => {
    mockFetch([{
      body: {
        id:       "gp-pay-ouaga-001",
        status:   "successful",
        amount:   55_000,
        currency: "XOF",
        paid_at:  "2026-07-18T21:45:00Z",
      },
    }]);

    // getStatus returns PaymentIntentStatus directly (a string)
    const status = await provider.getStatus("gp-pay-ouaga-001");
    expect(status).toBe("captured");
  });
});

// ── Scénario 2 : Paiement refusé ─────────────────────────────
// L'utilisateur entre un PIN incorrect ou n'a pas assez de solde.
// GaniPay retourne payment.failed — la réservation revient à pending_payment.

describe("Scénario 2 — Paiement refusé (solde insuffisant)", () => {
  it("webhook payment.failed → status failed", async () => {
    const payloadObj = {
      event_id:       "evt-failed-001",
      event_type:     "payment.failed",
      payment_id:     "gp-pay-ouaga-002",
      reference:      "idem-bk-ouaga-002",
      amount:         55_000,
      currency:       "XOF",
      status:         "failed",
      occurred_at:    new Date().toISOString(),
      failure_reason: "Insufficient balance",
      operator:       "orange",
      phone:          "70000002",
      metadata:       {},
    };
    const rawBody = JSON.stringify(payloadObj);
    const signature = await buildWebhookSignature(SANDBOX_CONFIG.webhookSecret, rawBody);

    const result = await provider.verifyWebhook(rawBody, signature, SANDBOX_CONFIG.webhookSecret);

    expect(result.valid).toBe(true);
    expect(result.event?.type).toBe("payment.failed");
    expect(result.event?.mappedStatus).toBe("failed");
    expect(result.event?.providerEventId).toBe("evt-failed-001");
  });

  it("webhook payment.cancelled → status cancelled (distinct de failed)", async () => {
    const payloadObj = {
      event_id:    "evt-cancelled-001",
      event_type:  "payment.cancelled",
      payment_id:  "gp-pay-ouaga-003",
      reference:   "idem-bk-ouaga-003",
      amount:      55_000,
      currency:    "XOF",
      status:      "cancelled",
      occurred_at: new Date().toISOString(),
      operator:    "orange",
      phone:       "70000003",
      metadata:    {},
    };
    const rawBody = JSON.stringify(payloadObj);
    const signature = await buildWebhookSignature(SANDBOX_CONFIG.webhookSecret, rawBody);

    const result = await provider.verifyWebhook(rawBody, signature, SANDBOX_CONFIG.webhookSecret);

    expect(result.valid).toBe(true);
    expect(result.event?.type).toBe("payment.cancelled");
    expect(result.event?.mappedStatus).toBe("cancelled");
  });

  it("getStatus retourne failed pour un paiement échoué", async () => {
    mockFetch([{
      body: {
        id:             "gp-pay-ouaga-002",
        status:         "failed",
        amount:         55_000,
        currency:       "XOF",
        failed_at:      "2026-07-18T21:40:00Z",
        failure_reason: "Insufficient balance",
      },
    }]);

    // getStatus returns PaymentIntentStatus directly (a string)
    const status = await provider.getStatus("gp-pay-ouaga-002");
    expect(status).toBe("failed");
  });
});

// ── Scénario 3 : Timeout réseau ──────────────────────────────
// GaniPay ne répond pas dans les 15 secondes (AbortSignal.timeout).
// L'erreur doit se propager — le paiement reste en status=initiated.

describe("Scénario 3 — Timeout réseau (15 s)", () => {
  it("createIntent lance une erreur sur timeout", async () => {
    // AbortError simule le signal de timeout
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    global.fetch = vi.fn().mockRejectedValue(abortError);

    await expect(provider.createIntent(INTENT_REQUEST)).rejects.toThrow();
  });

  it("getStatus lance une erreur sur timeout", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    global.fetch = vi.fn().mockRejectedValue(abortError);

    await expect(provider.getStatus("gp-pay-ouaga-001")).rejects.toThrow();
  });

  it("erreur réseau générique est propagée", async () => {
    mockFetchNetworkError("fetch failed");

    await expect(provider.createIntent(INTENT_REQUEST)).rejects.toThrow("fetch failed");
  });

  it("getStatus sur erreur réseau est propagée (sera attrapée par payment-status EF)", async () => {
    mockFetchNetworkError("connect ECONNREFUSED");

    await expect(provider.getStatus("gp-pay-ouaga-001")).rejects.toThrow("connect ECONNREFUSED");
  });
});

// ── Scénario 4 : Double webhook (idempotence) ─────────────────
// GaniPay peut livrer le même webhook deux fois.
// La deuxième livraison doit être détectée et ignorée via event_id.

describe("Scénario 4 — Double webhook (idempotence GaniPay)", () => {
  it("deux webhooks avec le même event_id ont le même providerEventId", async () => {
    const sharedEventId = "evt-idem-001";
    const payloadObj = {
      event_id:    sharedEventId,
      event_type:  "payment.successful",
      payment_id:  "gp-pay-idem",
      reference:   "idem-bk-idem",
      amount:      30_000,
      currency:    "XOF",
      status:      "successful",
      occurred_at: "2026-07-18T21:45:00Z",
      operator:    "orange",
      phone:       "70000001",
      metadata:    {},
    };
    const rawBody = JSON.stringify(payloadObj);
    const signature = await buildWebhookSignature(SANDBOX_CONFIG.webhookSecret, rawBody);

    const result1 = await provider.verifyWebhook(rawBody, signature, SANDBOX_CONFIG.webhookSecret);
    const result2 = await provider.verifyWebhook(rawBody, signature, SANDBOX_CONFIG.webhookSecret);

    // Les deux vérifications réussissent — la déduplication est
    // responsabilité de la couche DB (UNIQUE sur provider_event_id).
    expect(result1.valid).toBe(true);
    expect(result2.valid).toBe(true);
    expect(result1.event?.providerEventId).toBe(sharedEventId);
    expect(result2.event?.providerEventId).toBe(sharedEventId);
    // event_id identique → la DB UNIQUE rejettera le second INSERT
    expect(result1.event?.providerEventId).toBe(result2.event?.providerEventId);
  });

  it("signature invalide sur le second webhook (altération en transit) → rejeté", async () => {
    const payloadObj = {
      event_id:    "evt-idem-tampered",
      event_type:  "payment.successful",
      payment_id:  "gp-pay-idem-2",
      reference:   "idem-bk-idem-2",
      amount:      30_000,
      currency:    "XOF",
      status:      "successful",
      occurred_at: new Date().toISOString(),
      operator:    "orange",
      phone:       "70000001",
      metadata:    {},
    };
    const rawBody = JSON.stringify(payloadObj);
    const validSig = await buildWebhookSignature(SANDBOX_CONFIG.webhookSecret, rawBody);

    // Second envoi avec body altéré (montant changé)
    const tamperedBody = rawBody.replace("30000", "1");
    const result = await provider.verifyWebhook(tamperedBody, validSig, SANDBOX_CONFIG.webhookSecret);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Signature mismatch");
  });
});

// ── Scénario 5 : Webhook en retard ───────────────────────────
// GaniPay peut livrer un webhook plusieurs minutes après l'événement.
// Le freshness check dans payment-webhook EF (5 min) rejette les webhooks
// trop anciens pour les appels directs — les retries internes bypassent.
// Ici on teste que la signature reste valide (la validation HMAC est
// indépendante du timestamp).

describe("Scénario 5 — Webhook en retard (arrived > 5 min after occurred_at)", () => {
  it("signature valide même si occurred_at est ancien (HMAC ne dépend pas du temps)", async () => {
    const oldTimestamp = "2026-07-18T10:00:00Z"; // plus de 5 min dans le passé
    const payloadObj = {
      event_id:    "evt-late-001",
      event_type:  "payment.successful",
      payment_id:  "gp-pay-late",
      reference:   "idem-bk-late",
      amount:      20_000,
      currency:    "XOF",
      status:      "successful",
      occurred_at: oldTimestamp,
      operator:    "moov",
      phone:       "60000001",
      metadata:    {},
    };
    const rawBody = JSON.stringify(payloadObj);
    const signature = await buildWebhookSignature(SANDBOX_CONFIG.webhookSecret, rawBody);

    // HMAC valide — le rejet timestamp est dans l'EF payment-webhook (couche applicative)
    const result = await provider.verifyWebhook(rawBody, signature, SANDBOX_CONFIG.webhookSecret);
    expect(result.valid).toBe(true);
    expect(result.event?.providerEventId).toBe("evt-late-001");
  });

  it("webhook en retard sans signature → rejeté même si timestamp OK", async () => {
    const payloadObj = {
      event_id:    "evt-late-002",
      event_type:  "payment.successful",
      payment_id:  "gp-pay-late-2",
      reference:   "idem-bk-late-2",
      amount:      20_000,
      currency:    "XOF",
      status:      "successful",
      occurred_at: new Date().toISOString(),
      operator:    "moov",
      phone:       "60000001",
      metadata:    {},
    };
    const rawBody = JSON.stringify(payloadObj);

    const result = await provider.verifyWebhook(rawBody, "0000000000000000", SANDBOX_CONFIG.webhookSecret);
    expect(result.valid).toBe(false);
  });
});

// ── Scénario 6 : Double paiement (même idempotencyKey) ───────
// Un client soumet deux fois le formulaire de paiement.
// Le même idempotencyKey doit être renvoyé à GaniPay, qui déduplique.

describe("Scénario 6 — Double paiement (même idempotencyKey)", () => {
  it("deux appels createIntent avec le même idempotencyKey envoient la même reference", async () => {
    const sharedIdem = "idem-double-bk-ouaga";

    // Premier appel : GaniPay crée le paiement
    mockFetch([
      {
        body: {
          id:           "gp-pay-double-001",
          reference:    sharedIdem,
          status:       "pending",
          amount:       55_000,
          currency:     "XOF",
          checkout_url: "https://sandbox.ganipay.com/checkout/gp-pay-double-001",
          expires_at:   "2026-07-18T22:00:00Z",
        },
      },
      // Second appel : GaniPay retourne le même objet (idempotence côté GaniPay)
      {
        body: {
          id:           "gp-pay-double-001",
          reference:    sharedIdem,
          status:       "pending",
          amount:       55_000,
          currency:     "XOF",
          checkout_url: "https://sandbox.ganipay.com/checkout/gp-pay-double-001",
          expires_at:   "2026-07-18T22:00:00Z",
        },
      },
    ]);

    const req = { ...INTENT_REQUEST, idempotencyKey: sharedIdem };
    const r1 = await provider.createIntent(req);
    const r2 = await provider.createIntent(req);

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;

    // La même reference est envoyée dans les deux requêtes
    const body1 = JSON.parse(calls[0][1].body as string);
    const body2 = JSON.parse(calls[1][1].body as string);
    expect(body1.reference).toBe(sharedIdem);
    expect(body2.reference).toBe(sharedIdem);

    // Les deux réponses retournent le même providerTransactionId
    expect(r1.providerTransactionId).toBe(r2.providerTransactionId);
  });

  it("GaniPay retourne 409 sur la seconde tentative sans idempotency → erreur propagée", async () => {
    mockFetch([
      { body: { id: "gp-1", status: "pending", checkout_url: null, expires_at: "2026-07-18T22:00:00Z" }, status: 200 },
      { body: { error: "Payment already exists for this reference" },                                      status: 409 },
    ]);

    const req1 = { ...INTENT_REQUEST, idempotencyKey: "idem-first" };
    const req2 = { ...INTENT_REQUEST, idempotencyKey: "idem-different-but-409" };

    await provider.createIntent(req1); // OK
    await expect(provider.createIntent(req2)).rejects.toThrow(/already exists/i);
  });
});

// ── Scénario 7 : Refund ──────────────────────────────────────
// Remboursement partiel ou total après un paiement capturé.
// GaniPay livre un webhook refund.completed.

describe("Scénario 7 — Refund (remboursement partiel et total)", () => {
  it("refund partiel (50%) → retourne refundAmountFcfa correct", async () => {
    const halfAmount = 27_500;
    mockFetch([{
      body: {
        id:         "gp-refund-001",
        payment_id: "gp-pay-ouaga-001",
        amount:     halfAmount,
        status:     "completed",
        created_at: "2026-07-18T22:00:00Z",
      },
    }]);

    const result = await provider.refund({
      providerTransactionId: "gp-pay-ouaga-001",
      refundAmountFcfa:      halfAmount,
      reason:                "Annulation client — droit de rétractation",
      idempotencyKey:        "refund-half-bk-ouaga-001",
    } as any);

    expect(result.status).toBe("completed");
    expect(result.refundAmountFcfa).toBe(halfAmount);
    expect(result.providerRefundId).toBe("gp-refund-001");
    expect(result.processedAt).not.toBeNull();
  });

  it("refund total → retourne le montant original", async () => {
    mockFetch([{
      body: {
        id:         "gp-refund-002",
        payment_id: "gp-pay-ouaga-001",
        amount:     55_000,
        status:     "completed",
        created_at: "2026-07-18T22:05:00Z",
      },
    }]);

    const result = await provider.refund({
      providerTransactionId: "gp-pay-ouaga-001",
      refundAmountFcfa:      55_000,
      reason:                "Annulation hôte — force majeure",
      idempotencyKey:        "refund-full-bk-ouaga-001",
    } as any);

    expect(result.status).toBe("completed");
    expect(result.refundAmountFcfa).toBe(55_000);
  });

  it("refund en cours (pending) → status processing", async () => {
    mockFetch([{
      body: {
        id:         "gp-refund-003",
        payment_id: "gp-pay-ouaga-002",
        amount:     55_000,
        status:     "pending",
        created_at: "2026-07-18T22:10:00Z",
      },
    }]);

    const result = await provider.refund({
      providerTransactionId: "gp-pay-ouaga-002",
      refundAmountFcfa:      55_000,
      reason:                "Litigo en cours",
      idempotencyKey:        "refund-pending-bk-ouaga-002",
    } as any);

    expect(result.status).toBe("processing");
    expect(result.processedAt).toBeNull();
  });

  it("webhook refund.completed → status refunded", async () => {
    const payloadObj = {
      event_id:    "evt-refund-001",
      event_type:  "refund.completed",
      payment_id:  "gp-pay-ouaga-001",
      reference:   "idem-bk-ouaga-001",
      amount:      55_000,
      currency:    "XOF",
      status:      "refunded",
      occurred_at: new Date().toISOString(),
      operator:    "orange",
      phone:       BOOKING_FIXTURES.traveler.phone,
      metadata:    { booking_id: BOOKING_FIXTURES.id },
    };
    const rawBody = JSON.stringify(payloadObj);
    const signature = await buildWebhookSignature(SANDBOX_CONFIG.webhookSecret, rawBody);

    const result = await provider.verifyWebhook(rawBody, signature, SANDBOX_CONFIG.webhookSecret);

    expect(result.valid).toBe(true);
    expect(result.event?.type).toBe("refund.completed");
    expect(result.event?.mappedStatus).toBe("refunded");
  });

  it("refund envoie les bons champs à GaniPay (montant, reason, idempotency_key)", async () => {
    mockFetch([{
      body: { id: "gp-refund-check", payment_id: "gp-pay-check", amount: 30_000, status: "completed", created_at: "2026-07-18T22:15:00Z" },
    }]);

    await provider.refund({
      providerTransactionId: "gp-pay-check",
      refundAmountFcfa:      30_000,
      reason:                "Test refund fields",
      idempotencyKey:        "refund-check-key",
    } as any);

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.amount).toBe(30_000);
    expect(body.reason).toBe("Test refund fields");
    expect(body.idempotency_key).toBe("refund-check-key");
    // URL correcte
    expect(call[0]).toContain("/payments/gp-pay-check/refund");
  });
});

// ── Scénario 8 : Payout ──────────────────────────────────────
// Décaissement vers le compte Orange Money d'un hôte.
// Flow: createPayout → status processing → webhook payout.paid.

describe("Scénario 8 — Payout hôte (Orange Money)", () => {
  const PAYOUT_REQUEST = {
    payoutId:       "payout-ouaga-001",
    hostId:         BOOKING_FIXTURES.hostId,
    amountFcfa:     46_750,
    currency:       "XOF" as const,
    method:         "orange_money" as const,
    accountDetails: JSON.stringify({ phone: "70000010" }),
    reference:      "payout-ouaga-001",
    description:    `Retrait hôte ${BOOKING_FIXTURES.hostId.slice(0, 8)} — 46 750 FCFA`,
    idempotencyKey: "payout-ouaga-001",
    metadata:       { host_name: "Oumarou Zongo" },
  };

  it("createPayout retourne providerPayoutId et status processing", async () => {
    mockFetch([{
      body: {
        id:                 "gp-payout-ouaga-001",
        reference:          PAYOUT_REQUEST.idempotencyKey,
        status:             "processing",
        amount:             46_750,
        currency:           "XOF",
        method:             "orange_money",
        phone:              "70000010",
        bank_account:       null,
        estimated_arrival:  "2026-07-19T10:00:00Z",
        created_at:         "2026-07-18T22:00:00Z",
      },
    }]);

    const result = await provider.createPayout(PAYOUT_REQUEST);

    expect(result.providerPayoutId).toBe("gp-payout-ouaga-001");
    expect(result.status).toBe("processing");
    expect(result.estimatedArrivalAt).toBe("2026-07-19T10:00:00Z");
  });

  it("createPayout envoie les bons champs (montant, méthode, téléphone)", async () => {
    mockFetch([{
      body: { id: "gp-payout-check", status: "processing", amount: 46_750, currency: "XOF", method: "orange_money", phone: "70000010", estimated_arrival: null, created_at: "2026-07-18T22:00:00Z" },
    }]);

    await provider.createPayout(PAYOUT_REQUEST);

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.amount).toBe(46_750);
    expect(body.currency).toBe("XOF");
    expect(body.method).toBe("orange_money");
    expect(body.phone).toBe("70000010");
    // createPayout sends idempotencyKey as `reference`
    expect(body.reference).toBe(PAYOUT_REQUEST.idempotencyKey);
    expect(call[0]).toContain("/payouts");
  });

  it("getPayout retourne paid et paidAt une fois le paiement effectué", async () => {
    mockFetch([{
      body: {
        id:             "gp-payout-ouaga-001",
        status:         "paid",
        amount:         46_750,
        currency:       "XOF",
        paid_at:        "2026-07-19T09:30:00Z",
        failure_reason: null,
      },
    }]);

    const status = await provider.getPayout("gp-payout-ouaga-001");

    expect(status.status).toBe("paid");
    expect(status.paidAt).toBe("2026-07-19T09:30:00Z");
    expect(status.failureReason).toBeNull();
  });

  it("getPayout retourne failed avec failure_reason si le paiement échoue", async () => {
    mockFetch([{
      body: {
        id:             "gp-payout-ouaga-002",
        status:         "failed",
        amount:         25_000,
        currency:       "XOF",
        paid_at:        null,
        failure_reason: "Invalid phone number",
      },
    }]);

    const status = await provider.getPayout("gp-payout-ouaga-002");

    expect(status.status).toBe("failed");
    expect(status.failureReason).toBe("Invalid phone number");
  });

  it("payout via virement bancaire utilise bank_account et bank_code", async () => {
    mockFetch([{
      body: { id: "gp-payout-bank-001", status: "processing", amount: 100_000, currency: "XOF", method: "bank", estimated_arrival: "2026-07-22T00:00:00Z", created_at: "2026-07-18T22:00:00Z" },
    }]);

    await provider.createPayout({
      ...PAYOUT_REQUEST,
      method:         "bank",
      accountDetails: JSON.stringify({ account: "BF-00001234567890", code: "BIB-BF" }),
    });

    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string
    );
    expect(body.bank_account).toBe("BF-00001234567890");
    expect(body.bank_code).toBe("BIB-BF");
    expect(body.phone).toBeUndefined();
  });

  it("cancelPayout annule un payout avant décaissement", async () => {
    mockFetch([{ body: { success: true } }]);

    const result = await provider.cancelPayout("gp-payout-ouaga-003", "Erreur de compte");

    expect(result.cancelled).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("cancelPayout retourne cancelled=false si déjà décaissé", async () => {
    mockFetch([{ body: { error: "Payout already disbursed" }, status: 409 }]);

    const result = await provider.cancelPayout("gp-payout-ouaga-001");

    expect(result.cancelled).toBe(false);
    expect(result.reason).toContain("already disbursed");
  });
});

// ── Sécurité : vérification HMAC ─────────────────────────────

describe("Sécurité — Vérification HMAC-SHA256 (toutes attaques courantes)", () => {
  it("secret absent → rejet immédiat (pas d'accès sans configuration)", async () => {
    const rawBody = JSON.stringify({ event_id: "x", event_type: "payment.successful" });
    const result = await provider.verifyWebhook(rawBody, "any-signature", "");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("not configured");
  });

  it("signature forgée avec mauvais secret → rejet", async () => {
    const payloadObj = {
      event_id:    "evt-forge-001",
      event_type:  "payment.successful",
      payment_id:  "gp-pay-forge",
      reference:   "idem-forge",
      amount:      1_000_000,
      currency:    "XOF",
      status:      "successful",
      occurred_at: new Date().toISOString(),
      operator:    "orange",
      phone:       "70000001",
      metadata:    {},
    };
    const rawBody = JSON.stringify(payloadObj);
    const wrongSig = await buildWebhookSignature("attacker_secret", rawBody);

    const result = await provider.verifyWebhook(rawBody, wrongSig, SANDBOX_CONFIG.webhookSecret);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Signature mismatch");
  });

  it("payload JSON invalide → rejet", async () => {
    const notJson = "not-json-payload";
    const sig = await buildWebhookSignature(SANDBOX_CONFIG.webhookSecret, notJson);

    const result = await provider.verifyWebhook(notJson, sig, SANDBOX_CONFIG.webhookSecret);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Invalid JSON");
  });

  it("event_id manquant → rejet (champ requis pour idempotence)", async () => {
    const rawBody = JSON.stringify({ event_type: "payment.successful" }); // pas d'event_id
    const sig = await buildWebhookSignature(SANDBOX_CONFIG.webhookSecret, rawBody);

    const result = await provider.verifyWebhook(rawBody, sig, SANDBOX_CONFIG.webhookSecret);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("event_id");
  });
});
