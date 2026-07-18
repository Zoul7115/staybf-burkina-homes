-- =============================================================================
-- 0017 — Withdrawal State Machine: approved + cancelled states, GaniPay provider
-- =============================================================================
-- Problem: payouts table only has 'scheduled'/'on_hold' as intermediary states.
-- No 'approved' (admin review) or 'cancelled' (host/admin abort) state exist.
-- The provider CHECK only allows 'cinetpay', blocking provider-agnostic design.
-- process_payout_batch (0015) uses provider='fedapay' which violates the constraint.
--
-- Solution:
--   1. Extend app_payout_status enum with 'approved' and 'cancelled'
--   2. Extend app_ledger_entry_type with 'payout_reversal' (for cancelled withdrawals)
--   3. Widen provider CHECK to include 'ganipay' and 'manual'
--   4. Replace trg_payout_state_machine with the full 7-state machine
--   5. Fix process_payout_batch to use provider='manual' instead of 'fedapay'
-- =============================================================================


-- ── 1. Extend payout status enum ─────────────────────────────────────────────

ALTER TYPE public.app_payout_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.app_payout_status ADD VALUE IF NOT EXISTS 'cancelled';


-- ── 2. Extend ledger entry type enum ─────────────────────────────────────────

ALTER TYPE public.app_ledger_entry_type ADD VALUE IF NOT EXISTS 'payout_reversal';


-- ── 3. Widen provider CHECK constraint ───────────────────────────────────────

ALTER TABLE public.payouts
  DROP CONSTRAINT IF EXISTS payouts_provider_check;

ALTER TABLE public.payouts
  ADD CONSTRAINT payouts_provider_check
  CHECK (provider IN ('cinetpay', 'ganipay', 'manual'));


-- ── 4. Replace state machine trigger ─────────────────────────────────────────
--
-- Full 7-state machine:
--
--   pending   → approved        (admin approves host request)
--             → cancelled       (admin/host cancels before approval)
--             → scheduled       (legacy batch path — kept for cron compat)
--             → on_hold         (admin suspends)
--
--   approved  → processing      (admin dispatches to provider)
--             → cancelled       (admin cancels approved request)
--
--   scheduled → processing      (legacy batch path)
--             → on_hold         (legacy)
--             → approved        (promote to approved)
--
--   on_hold   → approved        (admin un-holds)
--             → scheduled       (legacy)
--             → cancelled       (admin cancels)
--
--   processing → paid           (provider confirms)
--              → failed         (provider rejects)
--
--   failed    → approved        (admin retries via new path)
--             → scheduled       (legacy retry)
--             → on_hold         (admin holds for investigation)
--
--   paid      → reversed        (chargeback / error)
--
--   cancelled → (terminal)
--   reversed  → (terminal)

CREATE OR REPLACE FUNCTION public.validate_payout_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  allowed text[];
BEGIN
  -- No-op: same status
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status::text
    WHEN 'pending'    THEN allowed := ARRAY['approved', 'cancelled', 'scheduled', 'on_hold'];
    WHEN 'approved'   THEN allowed := ARRAY['processing', 'cancelled'];
    WHEN 'scheduled'  THEN allowed := ARRAY['processing', 'on_hold', 'approved'];
    WHEN 'on_hold'    THEN allowed := ARRAY['approved', 'scheduled', 'cancelled'];
    WHEN 'processing' THEN allowed := ARRAY['paid', 'failed'];
    WHEN 'failed'     THEN allowed := ARRAY['approved', 'scheduled', 'on_hold'];
    WHEN 'paid'       THEN allowed := ARRAY['reversed'];
    -- Terminal states
    WHEN 'cancelled'  THEN allowed := ARRAY[]::text[];
    WHEN 'reversed'   THEN allowed := ARRAY[]::text[];
    ELSE                   allowed := ARRAY[]::text[];
  END CASE;

  IF NOT (NEW.status::text = ANY(allowed)) THEN
    RAISE EXCEPTION
      'Invalid payout status transition: % → % (allowed: %)',
      OLD.status, NEW.status, array_to_string(allowed, ', ');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_payout_status_transition() IS
  'Enforces the payout state machine: '
  'pending→approved/cancelled/scheduled/on_hold | '
  'approved→processing/cancelled | '
  'processing→paid/failed | '
  'failed→approved/scheduled/on_hold | '
  'paid→reversed. '
  'cancelled and reversed are terminal.';

DROP TRIGGER IF EXISTS trg_payout_state_machine ON public.payouts;

CREATE TRIGGER trg_payout_state_machine
  BEFORE UPDATE ON public.payouts
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.validate_payout_status_transition();


-- ── 5. Fix process_payout_batch (uses 'fedapay' which violates CHECK) ────────

CREATE OR REPLACE FUNCTION public.process_payout_batch()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  processed  integer := 0;
  payout_rec RECORD;
  host_id_v  uuid;
BEGIN
  FOR payout_rec IN
    SELECT po.*
    FROM   public.payouts po
    WHERE  po.status IN ('approved', 'scheduled')
      AND  (po.scheduled_for IS NULL OR po.scheduled_for <= now())
    ORDER  BY po.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 50
  LOOP
    -- Resolve host_id via host_profiles (payouts.host_id → host_profiles.id)
    host_id_v := payout_rec.host_id;

    UPDATE public.payouts
    SET
      status        = 'processing',
      dispatched_at = now(),
      provider      = 'manual',
      updated_at    = now()
    WHERE id = payout_rec.id
      AND status IN ('approved', 'scheduled');

    IF FOUND THEN
      processed := processed + 1;
    END IF;
  END LOOP;

  RETURN processed;
END;
$$;

COMMENT ON FUNCTION public.process_payout_batch() IS
  'Moves approved/scheduled payouts to processing. '
  'Uses provider=manual (provider-agnostic). '
  'Actual dispatch is handled by the dispatch-withdrawal Edge Function.';


-- ── 6. Add approved_at and cancelled_at timestamps to payouts ─────────────────

ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS approved_at   timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason text;


-- ── 7. RLS: hosts can only see their own payouts (SELECT) ─────────────────────
-- Policy "host: own payouts" already exists from migration 0006.
-- Add policy for INSERT so hosts can create withdrawal requests.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payouts' AND policyname = 'payouts: host insert own'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "payouts: host insert own"
        ON public.payouts
        FOR INSERT
        TO authenticated
        WITH CHECK (host_id = auth.uid())
    $policy$;
  END IF;
END;
$$;
