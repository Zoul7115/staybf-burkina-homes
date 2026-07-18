-- =============================================================================
-- Migration 0012 — Financial Infrastructure
-- Scope : wallet_ledger (persistent double-entry ledger),
--         payment_webhook_logs (raw HTTP webhook capture before processing),
--         idempotency_keys (shared cross-table idempotency guard)
-- Depends on : 0001 (profiles), 0005 (bookings), 0006 (payments, payouts, refunds)
-- Author: StayBF
-- =============================================================================


-- ============================================================
-- 1. ENUMS
-- ============================================================

-- Double-entry ledger direction
CREATE TYPE public.app_ledger_direction AS ENUM ('debit', 'credit');

-- Chart of Accounts — all internal financial accounts
CREATE TYPE public.app_ledger_account AS ENUM (
  'HOST_PENDING',      -- host earnings not yet eligible for payout
  'HOST_AVAILABLE',    -- host earnings available for payout
  'HOST_WITHDRAWN',    -- host earnings paid out
  'PLATFORM_PENDING',  -- platform commission not yet realised
  'PLATFORM_AVAILABLE', -- platform commission realised
  'PLATFORM_WITHDRAWN', -- platform commission withdrawn (OpEx)
  'ESCROW',            -- funds held in escrow during booking lifecycle
  'REFUNDS',           -- refund reserve
  'FEES',              -- service fees collected
  'TAXES'              -- tax reserve (future)
);

-- Ledger entry types — one per financial operation
CREATE TYPE public.app_ledger_entry_type AS ENUM (
  'booking_accommodation_credit',  -- booking confirmed → host_pending++
  'booking_commission_credit',     -- booking confirmed → platform_pending++
  'booking_service_fee_credit',    -- booking confirmed → fees++
  'booking_completed_release',     -- checkout → host_pending→available
  'booking_cancelled_reversal',    -- cancellation → reverse credits
  'payout_debit',                  -- payout → host_available→withdrawn
  'refund_accommodation_debit',    -- refund → reverse host credit
  'refund_commission_debit',       -- refund → reverse commission
  'refund_service_fee_debit',      -- refund → reverse service fee
  'manual_adjustment'              -- admin correction
);

-- Webhook processing statuses
CREATE TYPE public.app_webhook_status AS ENUM (
  'received',      -- raw log created, not yet processed
  'processing',    -- being processed now
  'processed',     -- successfully handled
  'failed',        -- all retry attempts exhausted
  'ignored',       -- valid webhook but intentionally skipped (duplicate)
  'invalid'        -- signature verification failed
);


-- ============================================================
-- 2. wallet_ledger
-- ============================================================
-- Persistent double-entry ledger. EVERY financial movement writes
-- exactly one row here. Balances are never stored directly —
-- they are always COMPUTED by summing ledger rows.
--
-- Invariant: for each booking lifecycle, total debits = total credits
-- across HOST_PENDING, HOST_AVAILABLE, PLATFORM_PENDING, PLATFORM_AVAILABLE.

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id              uuid                          PRIMARY KEY DEFAULT extensions.gen_random_uuid(),

  -- Semantic label for this entry
  entry_type      public.app_ledger_entry_type  NOT NULL,

  -- Which internal account is affected (credit and debit sides)
  -- A single economic event may touch two accounts (transfer).
  -- We store BOTH accounts on one row to keep the entry atomic.
  debit_account   public.app_ledger_account,
  credit_account  public.app_ledger_account,

  -- Always positive. The direction is determined by debit_account / credit_account.
  amount_fcfa     integer                       NOT NULL,
  currency        text                          NOT NULL DEFAULT 'XOF',

  -- Context references (nullable — not all entries relate to all entities)
  booking_id      uuid,
  payout_id       uuid,
  refund_id       uuid,
  payment_id      uuid,

  -- Host context (NULL for platform-side entries)
  host_id         uuid,

  -- Human-readable booking reference snapshot (no FK — survives deletion)
  reference       text                          NOT NULL,
  description     text                          NOT NULL,

  -- Arbitrary context for reconciliation and debugging
  metadata        jsonb                         NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz                   NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT wallet_ledger_amount_pos    CHECK (amount_fcfa > 0),
  CONSTRAINT wallet_ledger_currency_xof  CHECK (currency = 'XOF'),
  CONSTRAINT wallet_ledger_accounts_differ CHECK (
    debit_account IS NULL OR credit_account IS NULL
    OR debit_account <> credit_account
  ),
  CONSTRAINT wallet_ledger_has_account   CHECK (
    debit_account IS NOT NULL OR credit_account IS NOT NULL
  ),

  FOREIGN KEY (booking_id) REFERENCES public.bookings  (id) ON DELETE SET NULL,
  FOREIGN KEY (payout_id)  REFERENCES public.payouts   (id) ON DELETE SET NULL,
  FOREIGN KEY (refund_id)  REFERENCES public.refunds   (id) ON DELETE SET NULL
  -- payment_id FK omitted: payments.id lives on the same table but we want
  -- the ledger to survive payment record cleanup
);

ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger FORCE ROW LEVEL SECURITY;

-- Hosts can read their own ledger entries; admins can read all
CREATE POLICY "wallet_ledger: host read own"
  ON public.wallet_ledger FOR SELECT
  USING (
    host_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- All writes are via service_role (Edge Functions only)
GRANT SELECT ON public.wallet_ledger TO authenticated;
GRANT ALL    ON public.wallet_ledger TO service_role;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_booking
  ON public.wallet_ledger (booking_id, created_at)
  WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_host
  ON public.wallet_ledger (host_id, created_at)
  WHERE host_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_payout
  ON public.wallet_ledger (payout_id)
  WHERE payout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_refund
  ON public.wallet_ledger (refund_id)
  WHERE refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_entry_type
  ON public.wallet_ledger (entry_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_debit_account
  ON public.wallet_ledger (debit_account, created_at)
  WHERE debit_account IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_credit_account
  ON public.wallet_ledger (credit_account, created_at)
  WHERE credit_account IS NOT NULL;


-- ============================================================
-- 3. payment_webhook_logs
-- ============================================================
-- Raw HTTP capture of every inbound webhook BEFORE any processing.
-- Exists so that: (a) we can replay any webhook on failure,
-- (b) we have forensic evidence of provider payloads,
-- (c) we can detect duplicate delivery.
-- Distinct from payment_events (which stores processed outcomes).

CREATE TABLE IF NOT EXISTS public.payment_webhook_logs (
  id              uuid                      PRIMARY KEY DEFAULT extensions.gen_random_uuid(),

  -- Provider name (must match payments.provider CHECK constraint)
  provider        text                      NOT NULL,

  -- Raw event identifier from the provider
  provider_event_id text,

  -- Raw HTTP request body (before any parsing)
  payload         jsonb                     NOT NULL,

  -- Provider-supplied signature header value
  signature       text,

  -- Snapshot of relevant HTTP headers (Content-Type, User-Agent, etc.)
  headers         jsonb                     NOT NULL DEFAULT '{}'::jsonb,

  -- Current processing status
  status          public.app_webhook_status NOT NULL DEFAULT 'received',

  -- Number of processing attempts (incremented on each retry)
  attempts        integer                   NOT NULL DEFAULT 0,

  -- Last error message from a failed attempt
  last_error      text,

  -- Linked payment (set after successful payload parse)
  payment_id      uuid,

  received_at     timestamptz               NOT NULL DEFAULT now(),
  processed_at    timestamptz,

  CONSTRAINT payment_webhook_logs_provider_valid CHECK (
    provider IN ('cinetpay')
  ),
  CONSTRAINT payment_webhook_logs_attempts_nn CHECK (attempts >= 0),

  FOREIGN KEY (payment_id) REFERENCES public.payments (id) ON DELETE SET NULL
);

ALTER TABLE public.payment_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_logs FORCE ROW LEVEL SECURITY;

-- Only service_role and admins can read webhook logs
CREATE POLICY "payment_webhook_logs: admin read"
  ON public.payment_webhook_logs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT ON public.payment_webhook_logs TO authenticated;
GRANT ALL    ON public.payment_webhook_logs TO service_role;

-- Deduplicate by (provider, provider_event_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_webhook_provider_event
  ON public.payment_webhook_logs (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_webhook_logs_status
  ON public.payment_webhook_logs (status, received_at)
  WHERE status IN ('received', 'failed');

CREATE INDEX IF NOT EXISTS idx_payment_webhook_logs_payment
  ON public.payment_webhook_logs (payment_id)
  WHERE payment_id IS NOT NULL;


-- ============================================================
-- 4. idempotency_keys
-- ============================================================
-- Cross-table idempotency guard. Every Edge Function that performs
-- a financial mutation first inserts here. A UNIQUE conflict means
-- the operation was already processed; the handler returns the
-- cached result without re-executing.

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id              uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),

  -- The key submitted by the caller (UUID v4 or deterministic hash)
  idempotency_key text        NOT NULL UNIQUE,

  -- Which operation this key covers
  operation       text        NOT NULL,

  -- The actor who submitted the request
  actor_id        uuid,

  -- Cached response body (returned on duplicate request)
  response_body   jsonb,

  -- HTTP status code of the original response
  response_status integer     NOT NULL DEFAULT 200,

  -- Whether the original request completed successfully
  completed       boolean     NOT NULL DEFAULT false,

  -- TTL: keys older than 24 h are eligible for cleanup
  expires_at      timestamptz NOT NULL DEFAULT now() + INTERVAL '24 hours',

  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,

  CONSTRAINT idempotency_keys_key_len     CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
  CONSTRAINT idempotency_keys_op_len      CHECK (char_length(operation) BETWEEN 1 AND 100),
  CONSTRAINT idempotency_keys_status_range CHECK (response_status BETWEEN 100 AND 599)
);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys FORCE ROW LEVEL SECURITY;

-- Actors can look up their own keys; service_role gets ALL
CREATE POLICY "idempotency_keys: actor read own"
  ON public.idempotency_keys FOR SELECT
  USING (actor_id = auth.uid());

GRANT SELECT ON public.idempotency_keys TO authenticated;
GRANT ALL    ON public.idempotency_keys TO service_role;

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
  ON public.idempotency_keys (expires_at)
  WHERE completed = false;


-- ============================================================
-- 5. REALTIME PUBLICATIONS
-- ============================================================
-- wallet_ledger entries should trigger realtime on host dashboards.

ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_ledger;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_webhook_logs;


-- ============================================================
-- 6. ROLLBACK
-- ============================================================
-- Uncomment to revert:
--
-- DROP TABLE IF EXISTS public.idempotency_keys;
-- DROP TABLE IF EXISTS public.payment_webhook_logs;
-- DROP TABLE IF EXISTS public.wallet_ledger;
-- DROP TYPE  IF EXISTS public.app_webhook_status;
-- DROP TYPE  IF EXISTS public.app_ledger_entry_type;
-- DROP TYPE  IF EXISTS public.app_ledger_account;
-- DROP TYPE  IF EXISTS public.app_ledger_direction;
