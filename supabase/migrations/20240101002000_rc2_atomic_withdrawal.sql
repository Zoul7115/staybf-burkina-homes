-- =============================================================================
-- Migration 0020 — RC2: Atomic withdrawal + observability + query improvements
--
-- Changes:
--   1. create_withdrawal_atomic RPC — balance check + payout + ledger in ONE
--      PostgreSQL transaction, protected by a host-level advisory lock.
--      Eliminates the double-spend race condition (B09 — BLOQUANT BÊTA).
--   2. Index improvements for retry queue lookups.
--   3. Advisory lock helper used in process-withdrawal Edge Function.
-- =============================================================================


-- ── 1. Atomic withdrawal creation ────────────────────────────────────────────
--
-- Why pg_advisory_xact_lock?
--   A host submitting two concurrent withdrawal requests would both pass the
--   SELECT-based balance check before either writes the ledger debit, allowing
--   the combined withdrawal to exceed the available balance. The advisory lock
--   serializes ALL withdrawals per host: only one transaction at a time can hold
--   the lock for a given host_id hash. The lock is automatically released when
--   the calling transaction commits or rolls back.
--
-- This function performs steps 5-11 of process-withdrawal atomically:
--   Step 5: Compute available balance (within the lock)
--   Step 6: Validate minimum amount
--   Step 7: Validate daily cap
--   Step 8: Validate monthly cap
--   Step 9: INSERT payout
--   Step 11: INSERT wallet_ledger debit entry
--
-- Returns:
--   On success: { "payout_id": "<uuid>", "available_balance": <int> }
--   On error:   { "error": "<code>", ... }
--
-- Error codes:
--   MINIMUM     — amount below 5 000 FCFA
--   INSUFFICIENT — amount exceeds available balance
--   DAILY_CAP   — exceeds 500 000 FCFA daily limit
--   MONTHLY_CAP — exceeds 5 000 000 FCFA monthly limit

CREATE OR REPLACE FUNCTION public.create_withdrawal_atomic(
  p_host_id                uuid,
  p_amount_fcfa            integer,
  p_method                 text,
  p_payout_account_snapshot text,
  p_period_start           date,
  p_period_end             date,
  p_idempotency_key        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_available   integer := 0;
  v_today_total integer := 0;
  v_month_total integer := 0;
  v_payout_id   uuid;
  v_payout_ref  text;
BEGIN
  -- ── Acquire host-level advisory lock ───────────────────────────────────────
  -- hashtext() maps the host UUID string to a 32-bit integer suitable for
  -- pg_advisory_xact_lock. The lock is released when this transaction ends.
  PERFORM pg_advisory_xact_lock(hashtext(p_host_id::text));

  -- ── Compute available balance (HOST_AVAILABLE credits minus debits) ────────
  SELECT GREATEST(0,
    COALESCE(SUM(CASE WHEN credit_account = 'HOST_AVAILABLE' THEN amount_fcfa ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN debit_account  = 'HOST_AVAILABLE' THEN amount_fcfa ELSE 0 END), 0)
  )
  INTO v_available
  FROM public.wallet_ledger
  WHERE host_id = p_host_id;

  -- ── Validate minimum amount ────────────────────────────────────────────────
  IF p_amount_fcfa < 5000 THEN
    RETURN jsonb_build_object(
      'error',             'MINIMUM',
      'available_balance', v_available
    );
  END IF;

  -- ── Validate available balance ─────────────────────────────────────────────
  IF p_amount_fcfa > v_available THEN
    RETURN jsonb_build_object(
      'error',             'INSUFFICIENT',
      'available_balance', v_available
    );
  END IF;

  -- ── Daily cap (500 000 FCFA) ───────────────────────────────────────────────
  SELECT COALESCE(SUM(amount_fcfa), 0)
  INTO   v_today_total
  FROM   public.payouts
  WHERE  host_id = p_host_id
    AND  status NOT IN ('cancelled', 'reversed')
    AND  created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');

  IF v_today_total + p_amount_fcfa > 500000 THEN
    RETURN jsonb_build_object(
      'error',     'DAILY_CAP',
      'remaining', GREATEST(0, 500000 - v_today_total)
    );
  END IF;

  -- ── Monthly cap (5 000 000 FCFA) ──────────────────────────────────────────
  SELECT COALESCE(SUM(amount_fcfa), 0)
  INTO   v_month_total
  FROM   public.payouts
  WHERE  host_id = p_host_id
    AND  status NOT IN ('cancelled', 'reversed')
    AND  created_at >= date_trunc('month', now() AT TIME ZONE 'UTC');

  IF v_month_total + p_amount_fcfa > 5000000 THEN
    RETURN jsonb_build_object(
      'error',     'MONTHLY_CAP',
      'remaining', GREATEST(0, 5000000 - v_month_total)
    );
  END IF;

  -- ── Insert payout ──────────────────────────────────────────────────────────
  INSERT INTO public.payouts (
    host_id,
    status,
    amount_fcfa,
    currency,
    method,
    payout_account_snapshot,
    provider,
    period_start,
    period_end,
    retry_count,
    cancel_reason
  ) VALUES (
    p_host_id,
    'pending',
    p_amount_fcfa,
    'XOF',
    p_method,
    p_payout_account_snapshot,
    'manual',
    p_period_start,
    p_period_end,
    0,
    CASE
      WHEN p_idempotency_key IS NOT NULL
      THEN 'idem:' || p_idempotency_key
      ELSE NULL
    END
  )
  RETURNING id INTO v_payout_id;

  v_payout_ref := 'PAYOUT-' || upper(left(v_payout_id::text, 8));

  -- ── Write ledger debit (HOST_AVAILABLE → HOST_WITHDRAWN) ──────────────────
  -- This is the critical write that must be atomic with the payout INSERT.
  -- Without this, a second request could read the pre-debit balance.
  INSERT INTO public.wallet_ledger (
    entry_type,
    debit_account,
    credit_account,
    amount_fcfa,
    currency,
    payout_id,
    host_id,
    reference,
    description,
    metadata
  ) VALUES (
    'payout_debit',
    'HOST_AVAILABLE',
    'HOST_WITHDRAWN',
    p_amount_fcfa,
    'XOF',
    v_payout_id,
    p_host_id,
    v_payout_ref,
    'Demande de retrait — ' || to_char(p_amount_fcfa, 'FM999G999G999') || ' FCFA (' || p_method || ')',
    jsonb_build_object(
      'method',        p_method,
      'period_start',  p_period_start,
      'period_end',    p_period_end
    )
  );

  RETURN jsonb_build_object(
    'payout_id',         v_payout_id,
    'payout_ref',        v_payout_ref,
    'available_balance', v_available
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_withdrawal_atomic(uuid, integer, text, text, date, date, text)
  TO service_role;

COMMENT ON FUNCTION public.create_withdrawal_atomic IS
  'Atomically creates a withdrawal payout and writes the HOST_AVAILABLE→HOST_WITHDRAWN '
  'ledger debit within a single transaction, protected by a host-level advisory lock. '
  'Eliminates the double-spend race condition where two concurrent requests both pass '
  'the balance check before either commits the ledger debit.';


-- ── 2. Composite index for atomic balance computation ─────────────────────────
-- The RPC reads wallet_ledger filtered by host_id with debit/credit account columns.
-- The existing idx_wallet_ledger_host index covers (host_id, created_at) but
-- adding entry_type + accounts helps the SUM() aggregation skip full table scans.

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_host_accounts
  ON public.wallet_ledger (host_id, debit_account, credit_account)
  WHERE host_id IS NOT NULL;


-- ── 3. Index for payout daily/monthly cap queries ────────────────────────────
-- The RPC queries payouts by (host_id, status, created_at). The existing
-- index on payouts may not cover this efficiently for the NOT IN filter.

CREATE INDEX IF NOT EXISTS idx_payouts_host_status_created
  ON public.payouts (host_id, status, created_at DESC)
  WHERE status NOT IN ('cancelled', 'reversed');


-- ── 4. Index for cancel-booking ledger reversal check ────────────────────────
-- cancel-booking checks for existing reversal entries before writing.

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_booking_type
  ON public.wallet_ledger (booking_id, entry_type)
  WHERE booking_id IS NOT NULL;
