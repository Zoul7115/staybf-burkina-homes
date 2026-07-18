-- =============================================================================
-- Migration 0006 — Payments Domain
-- Scope : payments, payment_events, payouts, payout_items, refunds
--         + deferred FK bookings.payout_id → payouts(id)
-- Depends on : 0001 (profiles, has_role, app_role)
--              0003 (host_profiles, app_payout_method)
--              0005 (bookings, booking_events, app_booking_status,
--                    app_payout_status, app_booking_event_type)
-- Author: StayBF
-- =============================================================================

-- ============================================================
-- 1. ENUMS
-- ============================================================

CREATE TYPE public.app_payment_method AS ENUM (
  'orange_money',
  'moov_money',
  'visa',
  'mastercard',
  'wallet_credit'
);

-- Full CinetPay-mapped payment state machine (Revenue doc §3.2).
CREATE TYPE public.app_payment_status AS ENUM (
  'initiated',           -- row created; provider call not yet made
  'pending',             -- provider transaction created; OTP in progress
  'authorized',          -- OTP / 3DS passed; funds authorized (card flows)
  'captured',            -- funds confirmed received
  'failed',              -- terminal: declined / timeout / retries exhausted
  'refund_pending',      -- refund initiated; awaiting provider confirmation
  'refunded',            -- fully refunded
  'partially_refunded',  -- partial refund completed
  'chargeback'           -- bank-initiated dispute received
);

CREATE TYPE public.app_refund_type AS ENUM (
  'policy_cancellation',  -- computed by cancellation policy matrix
  'host_cancellation',    -- host cancelled; always 100%
  'goodwill',             -- discretionary; requires finance approval
  'dispute_resolution',   -- admin-ordered as part of dispute outcome
  'force_majeure',        -- admin override; 100% refund; no penalty
  'chargeback_reversal'   -- bank-initiated; immediate
);

CREATE TYPE public.app_refund_status AS ENUM (
  'requested',            -- refund row created; awaiting approval
  'approved',             -- approved (auto by policy or manual by finance)
  'processing',           -- provider call made
  'completed',            -- provider confirmed full refund
  'partially_completed',  -- provider confirmed partial refund
  'rejected',             -- denied by policy or finance
  'failed'                -- provider error; eligible for retry
);


-- ============================================================
-- 2. PAYMENTS
-- ============================================================
-- One row per payment attempt on a booking.  Split payments
-- (bookings >= 150 000 FCFA, max 2 payers) produce two rows with
-- the same booking_id.  The booking advances only when
-- SUM(amount_fcfa WHERE status='captured') = bookings.total_amount.
--
-- provider_transaction_id is the CinetPay cpm_trans_id used for
-- webhook correlation and idempotency.
--
-- raw_payload stores the full provider response for forensics and
-- dispute evidence assembly — never used in business logic.

CREATE TABLE IF NOT EXISTS public.payments (
  id                      uuid                      PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  booking_id              uuid                      NOT NULL,
  payer_id                uuid                      NOT NULL,
  method                  public.app_payment_method NOT NULL,
  provider                text                      NOT NULL DEFAULT 'cinetpay',
  provider_transaction_id text,
  status                  public.app_payment_status NOT NULL DEFAULT 'initiated',
  amount_fcfa             integer                   NOT NULL,
  processor_fee_fcfa      integer                   NOT NULL DEFAULT 0,
  -- idempotency_key = booking_id || '-' || attempt_number
  -- Prevents duplicate charges on network retry or browser double-submit.
  idempotency_key         text                      NOT NULL,
  attempt_number          integer                   NOT NULL DEFAULT 1,
  authorized_at           timestamptz,
  captured_at             timestamptz,
  failed_at               timestamptz,
  -- Full CinetPay response stored for forensics; never used in logic
  raw_payload             jsonb,
  created_at              timestamptz               NOT NULL DEFAULT now(),
  updated_at              timestamptz               NOT NULL DEFAULT now(),

  CONSTRAINT payments_amount_pos          CHECK (amount_fcfa > 0),
  CONSTRAINT payments_processor_fee_nn    CHECK (processor_fee_fcfa >= 0),
  CONSTRAINT payments_attempt_pos         CHECK (attempt_number >= 1),
  CONSTRAINT payments_provider_valid      CHECK (provider IN ('cinetpay')),
  CONSTRAINT payments_idempotency_unique  UNIQUE (idempotency_key),

  FOREIGN KEY (booking_id) REFERENCES public.bookings (id) ON DELETE RESTRICT,
  FOREIGN KEY (payer_id)   REFERENCES public.profiles (id) ON DELETE RESTRICT
);

-- Partial unique index: prevents two payment rows for the same provider
-- transaction (e.g. webhook replay creating a duplicate row).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_txn
  ON public.payments (provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;

-- Traveler (payer) reads own payments
CREATE POLICY "payments: payer read own"
  ON public.payments
  FOR SELECT
  USING (payer_id = auth.uid());

-- Host reads payments on their properties (for reconciliation)
CREATE POLICY "payments: host read own bookings"
  ON public.payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_id
        AND public.is_host_of(auth.uid(), b.property_id)
    )
  );

CREATE POLICY "payments: finance read-all"
  ON public.payments
  FOR SELECT
  USING (public.has_role(auth.uid(), 'finance'::public.app_role));

CREATE POLICY "payments: support read-all"
  ON public.payments
  FOR SELECT
  USING (public.has_role(auth.uid(), 'support'::public.app_role));

CREATE POLICY "payments: admin all"
  ON public.payments
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- No INSERT / UPDATE for authenticated: all writes via server functions
-- as service_role (initiatePayment, webhook handlers).

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL    ON public.payments TO service_role;

CREATE INDEX IF NOT EXISTS idx_payments_booking
  ON public.payments (booking_id);

-- Webhook correlation hot path: lookup by provider transaction id
CREATE INDEX IF NOT EXISTS idx_payments_provider_txn
  ON public.payments (provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

-- Live-payment monitoring: exclude terminal states
CREATE INDEX IF NOT EXISTS idx_payments_live_status
  ON public.payments (status, created_at DESC)
  WHERE status NOT IN ('captured', 'failed', 'refunded', 'chargeback');

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 3. PAYMENT_EVENTS
-- ============================================================
-- Append-only log of every webhook and status change received from
-- CinetPay for a payment.  The UNIQUE (payment_id, provider_event_id)
-- constraint IS the idempotency gate: the webhook handler attempts
-- INSERT; a unique violation means already processed → return 200
-- immediately without re-executing business logic.  This eliminates
-- the SELECT-then-INSERT race condition.

CREATE TABLE IF NOT EXISTS public.payment_events (
  id                uuid                      PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  payment_id        uuid                      NOT NULL,
  -- CinetPay cpm_trans_id or equivalent used for deduplication
  provider_event_id text                      NOT NULL,
  event_source      text                      NOT NULL DEFAULT 'webhook',
  -- Raw status string from provider, e.g. '00', 'ACCEPTED', 'REFUSED'
  provider_status   text                      NOT NULL,
  mapped_status     public.app_payment_status NOT NULL,
  -- Confirmed amount from provider (may differ on partial captures)
  amount_fcfa       integer,
  raw_payload       jsonb                     NOT NULL,
  processed_at      timestamptz               NOT NULL DEFAULT now(),
  -- No updated_at: append-only
  created_at        timestamptz               NOT NULL DEFAULT now(),

  CONSTRAINT payment_events_source_valid CHECK (
    event_source IN ('webhook', 'polling', 'manual_reconciliation')
  ),
  -- Idempotency anchor: one row per (payment, provider event)
  CONSTRAINT uq_payment_events_idempotency
    UNIQUE (payment_id, provider_event_id),

  FOREIGN KEY (payment_id) REFERENCES public.payments (id) ON DELETE CASCADE
);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events FORCE ROW LEVEL SECURITY;

-- Raw webhook data is internal only; no traveler or host read
CREATE POLICY "payment_events: finance read-all"
  ON public.payment_events
  FOR SELECT
  USING (public.has_role(auth.uid(), 'finance'::public.app_role));

CREATE POLICY "payment_events: admin all"
  ON public.payment_events
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- No INSERT for authenticated: only service_role via webhook handler
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL    ON public.payment_events TO service_role;

-- Timeline view for a specific payment
CREATE INDEX IF NOT EXISTS idx_payment_events_payment_time
  ON public.payment_events (payment_id, created_at ASC);

-- Lookup by raw provider event id without knowing payment_id
CREATE INDEX IF NOT EXISTS idx_payment_events_provider_event
  ON public.payment_events (provider_event_id);


-- ============================================================
-- 4. PAYOUTS
-- ============================================================
-- One row per batch disbursement to one host for one payout cycle.
-- Multiple bookings may be bundled into a single payout (daily cutoff
-- 18:00 Africa/Ouagadougou).  Individual contributions are tracked in
-- payout_items.
--
-- payout_account_snapshot stores the host's encrypted payout details
-- at dispatch time (not a live reference to host_profiles) so the
-- historical record is accurate even after the host updates their
-- payout method.

CREATE TABLE IF NOT EXISTS public.payouts (
  id                      uuid                    PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  host_id                 uuid                    NOT NULL,
  status                  public.app_payout_status NOT NULL DEFAULT 'pending',
  amount_fcfa             integer                 NOT NULL,
  currency                text                    NOT NULL DEFAULT 'XOF',
  method                  public.app_payout_method NOT NULL,
  -- Encrypted snapshot at dispatch time; libsodium sealed box; never in DTOs
  payout_account_snapshot text                    NOT NULL,
  provider                text                    NOT NULL DEFAULT 'cinetpay',
  provider_payout_id      text,
  period_start            date                    NOT NULL,
  period_end              date                    NOT NULL,
  scheduled_for           timestamptz,
  dispatched_at           timestamptz,
  paid_at                 timestamptz,
  failed_at               timestamptz,
  failure_reason          text,
  -- Max 3 retries per Revenue doc §2.4; after 3 → on_hold
  retry_count             integer                 NOT NULL DEFAULT 0,
  created_at              timestamptz             NOT NULL DEFAULT now(),
  updated_at              timestamptz             NOT NULL DEFAULT now(),

  CONSTRAINT payouts_amount_pos       CHECK (amount_fcfa > 0),
  CONSTRAINT payouts_currency_xof     CHECK (currency = 'XOF'),
  CONSTRAINT payouts_provider_valid   CHECK (provider IN ('cinetpay')),
  CONSTRAINT payouts_retry_range      CHECK (retry_count >= 0 AND retry_count <= 3),
  CONSTRAINT payouts_period_valid     CHECK (period_end >= period_start),

  FOREIGN KEY (host_id) REFERENCES public.host_profiles (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payouts_provider_payout_id
  ON public.payouts (provider_payout_id)
  WHERE provider_payout_id IS NOT NULL;

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts FORCE ROW LEVEL SECURITY;

-- Host reads own payout history
CREATE POLICY "payouts: host read own"
  ON public.payouts
  FOR SELECT
  USING (host_id = auth.uid());

-- Finance manages full payout lifecycle
CREATE POLICY "payouts: finance all"
  ON public.payouts
  FOR ALL
  USING  (public.has_role(auth.uid(), 'finance'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'finance'::public.app_role));

CREATE POLICY "payouts: admin read-all"
  ON public.payouts
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "payouts: super_admin all"
  ON public.payouts
  FOR ALL
  USING  (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- No INSERT for authenticated: created by processPayout() as service_role
GRANT SELECT ON public.payouts TO authenticated;
GRANT ALL    ON public.payouts TO service_role;

-- Host payout history page
CREATE INDEX IF NOT EXISTS idx_payouts_host_period
  ON public.payouts (host_id, period_start DESC);

-- Payout job: dispatch payouts whose scheduled_for has passed
CREATE INDEX IF NOT EXISTS idx_payouts_scheduled
  ON public.payouts (scheduled_for)
  WHERE status = 'scheduled';

-- Monitoring: live payouts only
CREATE INDEX IF NOT EXISTS idx_payouts_live_status
  ON public.payouts (status, created_at DESC)
  WHERE status NOT IN ('paid', 'reversed');

-- Retry candidates: failed payouts below max retry count
CREATE INDEX IF NOT EXISTS idx_payouts_retry
  ON public.payouts (retry_count, failed_at)
  WHERE status = 'failed';

CREATE TRIGGER trg_payouts_updated_at
  BEFORE UPDATE ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 5. PAYOUT_ITEMS
-- ============================================================
-- Junction: one booking contribution per payout batch row.
-- UNIQUE (booking_id) is the race-condition guard: if two concurrent
-- cron runs attempt to batch the same booking, the second INSERT
-- fails with a unique violation and the second transaction rolls back.
-- A booking can belong to exactly one payout — ever.

CREATE TABLE IF NOT EXISTS public.payout_items (
  id          uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  payout_id   uuid        NOT NULL,
  booking_id  uuid        NOT NULL,
  -- Snapshot of bookings.host_payout_amount at batching time
  amount_fcfa integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payout_items_amount_pos CHECK (amount_fcfa > 0),

  -- One booking → one payout only; prevents double-disbursement
  CONSTRAINT uq_payout_items_booking UNIQUE (booking_id),

  FOREIGN KEY (payout_id)  REFERENCES public.payouts (id)   ON DELETE RESTRICT,
  FOREIGN KEY (booking_id) REFERENCES public.bookings (id)  ON DELETE RESTRICT
);

ALTER TABLE public.payout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_items FORCE ROW LEVEL SECURITY;

-- Host reads items belonging to their payouts
CREATE POLICY "payout_items: host read own"
  ON public.payout_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.payouts p
      WHERE p.id      = payout_id
        AND p.host_id = auth.uid()
    )
  );

CREATE POLICY "payout_items: finance all"
  ON public.payout_items
  FOR ALL
  USING  (public.has_role(auth.uid(), 'finance'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'finance'::public.app_role));

CREATE POLICY "payout_items: admin read-all"
  ON public.payout_items
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "payout_items: super_admin all"
  ON public.payout_items
  FOR ALL
  USING  (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

GRANT SELECT ON public.payout_items TO authenticated;
GRANT ALL    ON public.payout_items TO service_role;

-- Fetch all items for a payout (host history, finance reconciliation)
CREATE INDEX IF NOT EXISTS idx_payout_items_payout
  ON public.payout_items (payout_id);


-- ============================================================
-- 6. REFUNDS
-- ============================================================
-- Tracks the lifecycle of a refund from request through provider
-- confirmation.  Always linked to a specific payments row (refunds
-- go to the original payment method).  A booking may have multiple
-- refunds (policy partial + goodwill).
--
-- idempotency_key = payment_id || '-' || refund_type || '-' || booking_event_id
-- Prevents duplicate refund calls on retry or double-webhook.

CREATE TABLE IF NOT EXISTS public.refunds (
  id                  uuid                    PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  payment_id          uuid                    NOT NULL,
  -- Denormalized for query convenience; avoids joining through payments
  booking_id          uuid                    NOT NULL,
  requested_by        uuid,                   -- NULL for system-initiated
  requester_role      public.app_role,
  reason              text                    NOT NULL,
  refund_type         public.app_refund_type  NOT NULL,
  status              public.app_refund_status NOT NULL DEFAULT 'requested',
  refund_amount_fcfa  integer                 NOT NULL,
  processor_fee_fcfa  integer                 NOT NULL DEFAULT 0,
  provider_refund_id  text,
  -- Required when refund_type='goodwill' or refund_amount_fcfa > 100 000 FCFA
  approved_by         uuid,
  approved_at         timestamptz,
  processed_at        timestamptz,
  -- Max 3 retries before manual intervention
  retry_count         integer                 NOT NULL DEFAULT 0,
  idempotency_key     text                    NOT NULL,
  -- Full provider response for forensics
  raw_payload         jsonb,
  created_at          timestamptz             NOT NULL DEFAULT now(),
  updated_at          timestamptz             NOT NULL DEFAULT now(),

  CONSTRAINT refunds_amount_pos           CHECK (refund_amount_fcfa > 0),
  CONSTRAINT refunds_processor_fee_nn     CHECK (processor_fee_fcfa >= 0),
  CONSTRAINT refunds_retry_range          CHECK (retry_count >= 0 AND retry_count <= 3),
  CONSTRAINT refunds_reason_nonempty      CHECK (length(trim(reason)) > 0),
  CONSTRAINT refunds_idempotency_unique   UNIQUE (idempotency_key),

  FOREIGN KEY (payment_id)    REFERENCES public.payments (id)  ON DELETE RESTRICT,
  FOREIGN KEY (booking_id)    REFERENCES public.bookings (id)  ON DELETE RESTRICT,
  FOREIGN KEY (requested_by)  REFERENCES public.profiles (id)  ON DELETE SET NULL,
  FOREIGN KEY (approved_by)   REFERENCES public.profiles (id)  ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_provider_refund_id
  ON public.refunds (provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds FORCE ROW LEVEL SECURITY;

-- Traveler reads refunds on own bookings
CREATE POLICY "refunds: traveler read own"
  ON public.refunds
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id          = booking_id
        AND b.traveler_id = auth.uid()
    )
  );

-- Host reads refunds on own properties' bookings
CREATE POLICY "refunds: host read own"
  ON public.refunds
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_id
        AND public.is_host_of(auth.uid(), b.property_id)
    )
  );

-- Support can read and create refund requests (finance approves)
CREATE POLICY "refunds: support read-write"
  ON public.refunds
  FOR ALL
  USING  (public.has_role(auth.uid(), 'support'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'support'::public.app_role));

CREATE POLICY "refunds: finance all"
  ON public.refunds
  FOR ALL
  USING  (public.has_role(auth.uid(), 'finance'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'finance'::public.app_role));

CREATE POLICY "refunds: admin all"
  ON public.refunds
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT ON public.refunds TO authenticated;
GRANT ALL    ON public.refunds TO service_role;

-- Refund history for a booking
CREATE INDEX IF NOT EXISTS idx_refunds_booking
  ON public.refunds (booking_id, created_at DESC);

-- Lookup by payment (reconciliation)
CREATE INDEX IF NOT EXISTS idx_refunds_payment
  ON public.refunds (payment_id);

-- Live refund monitoring: exclude terminal states
CREATE INDEX IF NOT EXISTS idx_refunds_live_status
  ON public.refunds (status, created_at)
  WHERE status NOT IN ('completed', 'partially_completed', 'rejected');

-- Retry candidates
CREATE INDEX IF NOT EXISTS idx_refunds_retry
  ON public.refunds (retry_count, updated_at)
  WHERE status = 'failed';

CREATE TRIGGER trg_refunds_updated_at
  BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 7. TRIGGER: validate refund does not exceed captured amount
-- ============================================================
-- BEFORE INSERT on refunds: ensures total refunded for a payment
-- never exceeds the captured amount.  This is a hard DB invariant;
-- the server function also enforces it, but the trigger is the
-- backstop for any code path that bypasses the server layer.

CREATE OR REPLACE FUNCTION public.validate_refund_amount()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_captured      integer;
  v_already_refunded integer;
BEGIN
  -- Fetch the captured amount for this payment
  SELECT amount_fcfa INTO v_captured
  FROM   public.payments
  WHERE  id = NEW.payment_id;

  IF v_captured IS NULL THEN
    RAISE EXCEPTION 'validate_refund_amount: payment % not found', NEW.payment_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Sum all prior refunds that are not rejected or failed
  SELECT COALESCE(SUM(refund_amount_fcfa), 0) INTO v_already_refunded
  FROM   public.refunds
  WHERE  payment_id = NEW.payment_id
    AND  status NOT IN (
           'rejected'::public.app_refund_status,
           'failed'::public.app_refund_status
         );

  IF (v_already_refunded + NEW.refund_amount_fcfa) > v_captured THEN
    RAISE EXCEPTION
      'validate_refund_amount: requested % + prior % exceeds captured % for payment %',
      NEW.refund_amount_fcfa, v_already_refunded, v_captured, NEW.payment_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_refund_amount
  BEFORE INSERT ON public.refunds
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_refund_amount();


-- ============================================================
-- 8. TRIGGER: validate payout state machine transitions
-- ============================================================
-- Enforces the approved payout state machine at DB level.
-- Any invalid status transition raises check_violation.

CREATE OR REPLACE FUNCTION public.validate_payout_transition()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    -- From pending
    (OLD.status = 'pending'::public.app_payout_status
       AND NEW.status IN ('scheduled'::public.app_payout_status,
                          'on_hold'::public.app_payout_status))
    -- From scheduled
    OR (OLD.status = 'scheduled'::public.app_payout_status
       AND NEW.status IN ('processing'::public.app_payout_status,
                          'on_hold'::public.app_payout_status))
    -- From on_hold (finance resolves)
    OR (OLD.status = 'on_hold'::public.app_payout_status
       AND NEW.status = 'scheduled'::public.app_payout_status)
    -- From processing
    OR (OLD.status = 'processing'::public.app_payout_status
       AND NEW.status IN ('paid'::public.app_payout_status,
                          'failed'::public.app_payout_status))
    -- From failed (retry; retry_count checked by server function)
    OR (OLD.status = 'failed'::public.app_payout_status
       AND NEW.status IN ('scheduled'::public.app_payout_status,
                          'on_hold'::public.app_payout_status))
    -- From paid (chargeback / fraud clawback)
    OR (OLD.status = 'paid'::public.app_payout_status
       AND NEW.status = 'reversed'::public.app_payout_status)
  ) THEN
    RAISE EXCEPTION
      'Invalid payout status transition: % → % (payout_id: %)',
      OLD.status, NEW.status, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payout_state_machine
  BEFORE UPDATE OF status ON public.payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payout_transition();


-- ============================================================
-- 9. TRIGGER: validate payment state machine transitions
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_payment_transition()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    -- From initiated
    (OLD.status = 'initiated'::public.app_payment_status
       AND NEW.status IN ('pending'::public.app_payment_status,
                          'failed'::public.app_payment_status))
    -- From pending
    OR (OLD.status = 'pending'::public.app_payment_status
       AND NEW.status IN ('authorized'::public.app_payment_status,
                          'captured'::public.app_payment_status,
                          'failed'::public.app_payment_status))
    -- From authorized (card 3DS flow)
    OR (OLD.status = 'authorized'::public.app_payment_status
       AND NEW.status IN ('captured'::public.app_payment_status,
                          'failed'::public.app_payment_status))
    -- From captured
    OR (OLD.status = 'captured'::public.app_payment_status
       AND NEW.status IN ('refund_pending'::public.app_payment_status,
                          'chargeback'::public.app_payment_status))
    -- From refund_pending
    OR (OLD.status = 'refund_pending'::public.app_payment_status
       AND NEW.status IN ('refunded'::public.app_payment_status,
                          'partially_refunded'::public.app_payment_status,
                          'failed'::public.app_payment_status))
    -- From partially_refunded (further refund)
    OR (OLD.status = 'partially_refunded'::public.app_payment_status
       AND NEW.status IN ('refund_pending'::public.app_payment_status,
                          'refunded'::public.app_payment_status))
  ) THEN
    RAISE EXCEPTION
      'Invalid payment status transition: % → % (payment_id: %)',
      OLD.status, NEW.status, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payment_state_machine
  BEFORE UPDATE OF status ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payment_transition();


-- ============================================================
-- 10. FUNCTION: process_payout_batch
-- ============================================================
-- Creates payout batches for all eligible hosts in a single call.
-- Called by the nightly cron (service_role only).
--
-- Eligibility criteria (Revenue doc §2.4):
--   bookings.status        = 'completed'
--   bookings.payout_status = 'pending'
--   host_profiles.status   = 'verified'
--   host has payout_method + payout_account configured
--   SUM(host_payout_amount) >= 10 000 FCFA (PAYOUT_MIN_FCFA)
--
-- Race condition guard: UPDATE bookings WHERE payout_status='pending'
-- prevents double-batching if two cron instances run concurrently.
-- The UNIQUE(booking_id) on payout_items provides a second guard.
--
-- Returns the number of payout batches created.

CREATE OR REPLACE FUNCTION public.process_payout_batch(
  p_t_plus_days_subscribed integer DEFAULT 1,
  p_t_plus_days_standard   integer DEFAULT 5
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_host              record;
  v_booking           record;
  v_payout_id         uuid;
  v_total_amount      integer;
  v_payout_min        constant integer := 10000;
  v_batches_created   integer := 0;
  v_scheduled_for     timestamptz;
BEGIN
  -- Outer loop: one iteration per eligible host
  FOR v_host IN
    SELECT
      hp.id                  AS host_id,
      hp.payout_method,
      hp.payout_account,
      SUM(b.host_payout_amount) AS total_amount,
      MIN(b.completed_at::date)  AS period_start,
      MAX(b.completed_at::date)  AS period_end,
      -- Subscribed hosts get T+1; others get T+5
      CASE WHEN EXISTS (
        SELECT 1
        FROM   billing.subscription_plans sp
        JOIN   billing.subscriptions s ON s.plan_id = sp.id
        WHERE  s.host_id = hp.id
          AND  s.status  IN ('trialing', 'active')
          AND  sp.slug  != 'free'
      ) THEN p_t_plus_days_subscribed
        ELSE p_t_plus_days_standard
      END AS t_plus_days
    FROM  public.bookings b
    JOIN  public.host_profiles hp ON hp.id = b.host_id
    WHERE b.status        = 'completed'::public.app_booking_status
      AND b.payout_status = 'pending'::public.app_payout_status
      AND hp.status       = 'verified'::public.app_host_status
      AND hp.payout_method  IS NOT NULL
      AND hp.payout_account IS NOT NULL
    GROUP BY hp.id, hp.payout_method, hp.payout_account
    HAVING SUM(b.host_payout_amount) >= v_payout_min
  LOOP
    v_scheduled_for := now() + (v_host.t_plus_days || ' days')::interval;

    BEGIN
      -- Create the payout batch row
      INSERT INTO public.payouts (
        host_id,
        status,
        amount_fcfa,
        method,
        -- payout_account_snapshot is the encrypted account value copied
        -- directly from host_profiles; decryption only happens at dispatch
        payout_account_snapshot,
        provider,
        period_start,
        period_end,
        scheduled_for,
        created_at,
        updated_at
      )
      VALUES (
        v_host.host_id,
        'scheduled'::public.app_payout_status,
        v_host.total_amount,
        v_host.payout_method,
        v_host.payout_account,
        'cinetpay',
        v_host.period_start,
        v_host.period_end,
        v_scheduled_for,
        now(),
        now()
      )
      RETURNING id INTO v_payout_id;

      -- Create one payout_item per eligible booking
      FOR v_booking IN
        SELECT id, host_payout_amount
        FROM   public.bookings
        WHERE  host_id       = v_host.host_id
          AND  status        = 'completed'::public.app_booking_status
          AND  payout_status = 'pending'::public.app_payout_status
      LOOP
        INSERT INTO public.payout_items (payout_id, booking_id, amount_fcfa)
        VALUES (v_payout_id, v_booking.id, v_booking.host_payout_amount);
      END LOOP;

      -- Lock bookings into this batch; guard prevents double-batching
      UPDATE public.bookings
      SET    payout_status = 'scheduled'::public.app_payout_status,
             payout_id     = v_payout_id,
             updated_at    = now()
      WHERE  host_id       = v_host.host_id
        AND  status        = 'completed'::public.app_booking_status
        AND  payout_status = 'pending'::public.app_payout_status;

      v_batches_created := v_batches_created + 1;

    EXCEPTION
      -- If UNIQUE violation on payout_items.booking_id, a concurrent run
      -- already batched this host — skip silently.
      WHEN unique_violation THEN
        RAISE NOTICE 'process_payout_batch: concurrent batch detected for host %, skipping',
          v_host.host_id;
    END;
  END LOOP;

  RETURN v_batches_created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_payout_batch(integer, integer)
  TO service_role;


-- ============================================================
-- 11. FUNCTION: retry_failed_payout
-- ============================================================
-- Reschedules a single failed payout for retry.
-- Enforces max retry_count = 3; on third failure the payout is
-- placed on_hold instead and must be manually resolved by finance.
-- Called by the payout cron after receiving a failure webhook.

CREATE OR REPLACE FUNCTION public.retry_failed_payout(
  p_payout_id uuid
)
  RETURNS public.app_payout_status   -- new status after retry decision
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_retry_count    integer;
  v_new_status     public.app_payout_status;
  v_scheduled_for  timestamptz;
  -- Retry delays: 0h, 48h, 120h per Revenue doc §2.4
  v_delays         integer[] := ARRAY[0, 48, 120];
BEGIN
  IF p_payout_id IS NULL THEN
    RAISE EXCEPTION 'retry_failed_payout: null payout_id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT retry_count INTO v_retry_count
  FROM   public.payouts
  WHERE  id     = p_payout_id
    AND  status = 'failed'::public.app_payout_status
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'retry_failed_payout: payout % not found or not in failed status',
      p_payout_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_retry_count >= 3 THEN
    -- Max retries exhausted: place on hold for manual finance resolution
    v_new_status := 'on_hold'::public.app_payout_status;
    UPDATE public.payouts
    SET    status       = v_new_status,
           updated_at   = now()
    WHERE  id = p_payout_id;
  ELSE
    -- Schedule retry with appropriate delay
    v_scheduled_for := now() + (v_delays[v_retry_count + 1] || ' hours')::interval;
    v_new_status    := 'scheduled'::public.app_payout_status;
    UPDATE public.payouts
    SET    status        = v_new_status,
           retry_count   = retry_count + 1,
           scheduled_for = v_scheduled_for,
           updated_at    = now()
    WHERE  id = p_payout_id;
  END IF;

  RETURN v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_failed_payout(uuid) TO service_role;


-- ============================================================
-- 12. DEFERRED FK: bookings.payout_id → payouts(id)
-- ============================================================
-- Noted as deferred in Migration 0005; payouts table now exists.

ALTER TABLE public.bookings
  ADD CONSTRAINT fk_bookings_payout
  FOREIGN KEY (payout_id)
  REFERENCES public.payouts (id)
  ON DELETE SET NULL;


-- =============================================================================
-- DOWN MIGRATION
-- =============================================================================
/*
  To roll back (execute in reverse dependency order):

  ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS fk_bookings_payout;

  DROP FUNCTION IF EXISTS public.retry_failed_payout(uuid);
  DROP FUNCTION IF EXISTS public.process_payout_batch(integer, integer);

  DROP FUNCTION IF EXISTS public.validate_payment_transition();
  DROP FUNCTION IF EXISTS public.validate_payout_transition();
  DROP FUNCTION IF EXISTS public.validate_refund_amount();

  DROP TABLE IF EXISTS public.refunds;
  DROP TABLE IF EXISTS public.payout_items;
  DROP TABLE IF EXISTS public.payouts;
  DROP TABLE IF EXISTS public.payment_events;
  DROP TABLE IF EXISTS public.payments;

  DROP TYPE IF EXISTS public.app_refund_status;
  DROP TYPE IF EXISTS public.app_refund_type;
  DROP TYPE IF EXISTS public.app_payment_status;
  DROP TYPE IF EXISTS public.app_payment_method;
*/
