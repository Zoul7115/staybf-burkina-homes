-- =============================================================================
-- Migration 0009a — Audit Fixes
-- Scope : Corrects all Critical and selected High findings from the
--         architecture audit of migrations 0001–0009.
--
-- Fixed findings:
--   C-1  expire_pending_bookings cron call had wrong arity (now() arg added)
--   C-2  retry_failed_payout cron called with date instead of uuid;
--          replaced with new retry_failed_payouts_batch() batch wrapper
--   C-3  process_payout_batch cron called with CURRENT_DATE (date → integer mismatch)
--   C-4  drop_expired_audit_partitions() function was never defined
--   C-5  billing.subscriptions table never created;
--          referenced in process_payout_batch() on every execution
--   H-1  run_analytics_rollup: refunds.amount_fcfa → refund_amount_fcfa;
--          refunds.refunded_at → processed_at;
--          refund status filter → 'completed'
--   H-2  run_analytics_rollup: reviews.submitted_at → created_at;
--          reviews.overall_score → overall_rating
--   H-4  claim_availability / release_availability granted to authenticated;
--          revoked — service_role only
--   H-5  blocked_dates missing SELECT grant for authenticated
--   H-6  validate_kyc_transition did not mirror new status to profiles.kyc_status
--
-- Depends on : 0001–0009 (all preceding migrations applied)
-- Author     : StayBF Engineering
-- =============================================================================


-- =============================================================================
-- SECTION 1 — C-5: CREATE billing.subscriptions
-- =============================================================================
-- Referenced by process_payout_batch() in Migration 0006 to determine whether
-- a host holds an active paid plan (T+1 payout) or is on the free plan (T+5).
-- Must exist before any dependent function is re-executed.
-- =============================================================================

CREATE TABLE IF NOT EXISTS billing.subscriptions (
  id                    uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),

  -- The host this subscription belongs to.
  host_id               uuid        NOT NULL,

  -- The plan this subscription is on.
  plan_id               uuid        NOT NULL,

  -- Lifecycle state.
  --   trialing   : within the trial window; treated as active for payout timing.
  --   active     : paid and current.
  --   past_due   : last payment failed; grace period in progress.
  --   cancelled  : host cancelled; remains active until period_end.
  --   expired    : period ended; not renewed.
  status                text        NOT NULL DEFAULT 'active',

  -- Trial end; NULL for plans with no trial.
  trial_ends_at         timestamptz,

  -- Billing cycle boundaries (updated on each renewal).
  current_period_start  timestamptz NOT NULL DEFAULT now(),
  current_period_end    timestamptz,

  -- Set when host or admin cancels; subscription stays active until period_end.
  cancelled_at          timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT subscriptions_status_valid CHECK (
    status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired')
  ),
  CONSTRAINT subscriptions_period_order CHECK (
    current_period_end IS NULL OR current_period_end > current_period_start
  ),

  FOREIGN KEY (host_id)  REFERENCES public.host_profiles  (id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id)  REFERENCES billing.subscription_plans (id) ON DELETE RESTRICT
);

ALTER TABLE billing.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.subscriptions FORCE ROW LEVEL SECURITY;

-- Host reads own subscription.
CREATE POLICY "subscriptions: host read own"
  ON billing.subscriptions FOR SELECT
  USING (host_id = auth.uid());

-- Finance and admin read-all.
CREATE POLICY "subscriptions: finance read-all"
  ON billing.subscriptions FOR SELECT
  USING (public.has_role(auth.uid(), 'finance'::public.app_role));

CREATE POLICY "subscriptions: admin all"
  ON billing.subscriptions FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- No INSERT / UPDATE / DELETE for authenticated; all lifecycle transitions are
-- server-function-gated (service_role).
GRANT SELECT ON billing.subscriptions TO authenticated;
GRANT ALL    ON billing.subscriptions TO service_role;

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON billing.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Active subscription lookup (hot path in process_payout_batch).
CREATE INDEX IF NOT EXISTS idx_subscriptions_host_status
  ON billing.subscriptions (host_id, status)
  WHERE status IN ('trialing', 'active');

-- Renewal job: subscriptions approaching period_end.
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end
  ON billing.subscriptions (current_period_end)
  WHERE status IN ('trialing', 'active');


-- =============================================================================
-- SECTION 2 — C-4: CREATE drop_expired_audit_partitions()
-- =============================================================================
-- Drops audit_logs partitions older than 24 months.
-- Mirrors the pattern of drop_expired_analytics_partitions() from Migration 0009.
-- Called monthly by the 'audit-log-retention' pg_cron job.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.drop_expired_audit_partitions(
  p_tick timestamptz
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_nominal_tick    timestamptz;
  v_acquired        boolean;
  v_cutoff          date;
  v_dropped         integer := 0;
  r                 record;
  v_partition_start date;
  v_partition_end   date;
BEGIN
  v_nominal_tick := date_trunc('month', p_tick);

  v_acquired := public.begin_scheduled_job('audit-log-retention', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  -- Retention: 24 months rolling. Cutoff = start of the month 24 months ago.
  v_cutoff := date_trunc('month', p_tick - interval '24 months')::date;

  BEGIN
    FOR r IN
      SELECT table_name
      FROM   information_schema.tables
      WHERE  table_schema = 'public'
        AND  table_name   LIKE 'audit\_logs\_%'
        AND  table_type   = 'BASE TABLE'
      ORDER  BY table_name
    LOOP
      -- Parse partition bounds from table name: audit_logs_YYYY_MM
      BEGIN
        v_partition_start := to_date(
          substring(r.table_name FROM 'audit_logs_(\d{4}_\d{2})'),
          'YYYY_MM'
        );
        v_partition_end := v_partition_start + interval '1 month';
      EXCEPTION WHEN OTHERS THEN
        CONTINUE;  -- skip tables that don't match the naming convention
      END;

      -- Only drop partitions entirely before the 24-month cutoff.
      IF v_partition_end > v_cutoff THEN
        CONTINUE;
      END IF;

      EXECUTE format('DROP TABLE IF EXISTS public.%I', r.table_name);
      v_dropped := v_dropped + 1;

      PERFORM public.log_audit_event(
        NULL, 'system',
        'audit_log_partition_dropped'::public.app_audit_action,
        'audit_logs', NULL,
        NULL, NULL, NULL, NULL,
        jsonb_build_object(
          'partition',  r.table_name,
          'cutoff_date', v_cutoff,
          'job_tick',   p_tick
        )
      );
    END LOOP;

    PERFORM public.finish_scheduled_job(
      'audit-log-retention', v_nominal_tick,
      'success'::public.app_job_status,
      v_dropped,
      NULL,
      jsonb_build_object('dropped', v_dropped, 'cutoff_date', v_cutoff)
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'audit-log-retention', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;

  RETURN v_dropped;
END;
$$;

GRANT EXECUTE ON FUNCTION public.drop_expired_audit_partitions(timestamptz)
  TO service_role;


-- =============================================================================
-- SECTION 3 — C-4: Add audit action value for partition drops
-- =============================================================================
-- The existing app_audit_action enum has no value for partition lifecycle
-- events.  Adding one so drop_expired_audit_partitions() and the analytics
-- retention job can log correctly instead of mis-using 'moderation_queued'.
-- =============================================================================

ALTER TYPE public.app_audit_action ADD VALUE IF NOT EXISTS 'audit_log_partition_dropped';
ALTER TYPE public.app_audit_action ADD VALUE IF NOT EXISTS 'analytics_partition_dropped';
ALTER TYPE public.app_audit_action ADD VALUE IF NOT EXISTS 'analytics_partition_skipped';


-- =============================================================================
-- SECTION 4 — H-1 & H-2: REPLACE run_analytics_rollup
-- =============================================================================
-- Corrects the following column name errors present in the original:
--   H-1: refunds.amount_fcfa      → refund_amount_fcfa
--         refunds.refunded_at     → processed_at
--         status filter 'refunded' → 'completed'::public.app_refund_status
--   H-2: reviews.submitted_at    → created_at
--         reviews.overall_score  → overall_rating
--         status filter 'published' → 'published'::public.app_review_status
-- All other logic is unchanged.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.run_analytics_rollup(
  p_date          date,
  p_scheduled_for timestamptz
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_nominal_tick  timestamptz;
  v_acquired      boolean;
  v_rows          integer := 0;
  v_start         date;
  v_end           date;
BEGIN
  v_nominal_tick := date_trunc('day', p_scheduled_for);

  v_acquired := public.begin_scheduled_job('analytics-rollup', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('analytics-rollup')::bigint) THEN
    PERFORM public.finish_scheduled_job(
      'analytics-rollup', v_nominal_tick,
      'skipped'::public.app_job_status, 0,
      'advisory lock held by concurrent session'
    );
    RETURN 0;
  END IF;

  -- Explicit date boundaries for guaranteed partition pruning on analytics_events.
  v_start := p_date;
  v_end   := p_date + 1;

  BEGIN
    -- ──────────────────────────────────────────────────────────────────────
    -- Pass 1a — Property-level financial metrics
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO public.daily_metrics (
      metric_date,       dimension_type,    dimension_id,
      bookings_created,  bookings_confirmed, bookings_cancelled, bookings_completed,
      gross_revenue_fcfa, net_revenue_fcfa,  refund_amount_fcfa,
      reviews_submitted, avg_review_score,
      rollup_version
    )
    SELECT
      p_date,
      'property'::public.app_metric_dimension,
      b.property_id,
      COUNT(b.id) FILTER (WHERE b.created_at   >= v_start::timestamptz
                              AND b.created_at   < v_end::timestamptz),
      COUNT(b.id) FILTER (WHERE b.confirmed_at >= v_start::timestamptz
                              AND b.confirmed_at < v_end::timestamptz),
      COUNT(b.id) FILTER (WHERE b.cancelled_at >= v_start::timestamptz
                              AND b.cancelled_at < v_end::timestamptz),
      COUNT(b.id) FILTER (WHERE b.completed_at >= v_start::timestamptz
                              AND b.completed_at < v_end::timestamptz),
      -- gross = what traveler paid on confirmed bookings
      COALESCE(SUM(b.total_amount)
        FILTER (WHERE b.confirmed_at >= v_start::timestamptz
                  AND b.confirmed_at  < v_end::timestamptz), 0),
      -- net = platform take (service fee + host commission)
      COALESCE(SUM(b.service_fee_amount + b.commission_amount)
        FILTER (WHERE b.confirmed_at >= v_start::timestamptz
                  AND b.confirmed_at  < v_end::timestamptz), 0),
      -- [H-1] refunds settled today for bookings on this property
      -- Correct column: refund_amount_fcfa (not amount_fcfa)
      -- Correct timestamp: processed_at (not refunded_at)
      -- Correct status: 'completed' (not 'refunded')
      COALESCE((
        SELECT SUM(r.refund_amount_fcfa)
        FROM   public.refunds r
        WHERE  r.booking_id   = b.id
          AND  r.processed_at >= v_start::timestamptz
          AND  r.processed_at  < v_end::timestamptz
          AND  r.status = 'completed'::public.app_refund_status
      ), 0),
      -- [H-2] reviews written for stays at this property
      -- Correct timestamp: created_at (not submitted_at)
      -- Correct status: 'published'::app_review_status
      COALESCE((
        SELECT COUNT(*)
        FROM   public.reviews rv
        JOIN   public.bookings rb ON rb.id = rv.booking_id
        WHERE  rb.property_id = b.property_id
          AND  rv.created_at  >= v_start::timestamptz
          AND  rv.created_at   < v_end::timestamptz
          AND  rv.status = 'published'::public.app_review_status
      ), 0),
      NULL,  -- avg_review_score computed below via UPDATE
      1
    FROM public.bookings b
    WHERE (
      (b.created_at   >= v_start::timestamptz AND b.created_at   < v_end::timestamptz)
      OR (b.confirmed_at >= v_start::timestamptz AND b.confirmed_at < v_end::timestamptz)
      OR (b.cancelled_at >= v_start::timestamptz AND b.cancelled_at < v_end::timestamptz)
      OR (b.completed_at >= v_start::timestamptz AND b.completed_at < v_end::timestamptz)
    )
    GROUP BY b.property_id
    ON CONFLICT ON CONSTRAINT uq_daily_metrics_dim DO UPDATE SET
      bookings_created    = EXCLUDED.bookings_created,
      bookings_confirmed  = EXCLUDED.bookings_confirmed,
      bookings_cancelled  = EXCLUDED.bookings_cancelled,
      bookings_completed  = EXCLUDED.bookings_completed,
      gross_revenue_fcfa  = EXCLUDED.gross_revenue_fcfa,
      net_revenue_fcfa    = EXCLUDED.net_revenue_fcfa,
      refund_amount_fcfa  = EXCLUDED.refund_amount_fcfa,
      reviews_submitted   = EXCLUDED.reviews_submitted,
      rollup_version      = public.daily_metrics.rollup_version + 1,
      updated_at          = now();

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    -- [H-2] Update avg_review_score for properties with reviews today.
    -- Correct column: overall_rating (not overall_score)
    UPDATE public.daily_metrics dm
    SET    avg_review_score = sub.avg_score
    FROM (
      SELECT rb.property_id,
             AVG(rv.overall_rating)::numeric(3,2) AS avg_score
      FROM   public.reviews rv
      JOIN   public.bookings rb ON rb.id = rv.booking_id
      WHERE  rv.created_at >= v_start::timestamptz
        AND  rv.created_at  < v_end::timestamptz
        AND  rv.status = 'published'::public.app_review_status
      GROUP BY rb.property_id
    ) sub
    WHERE  dm.metric_date    = p_date
      AND  dm.dimension_type = 'property'::public.app_metric_dimension
      AND  dm.dimension_id   = sub.property_id;

    -- ──────────────────────────────────────────────────────────────────────
    -- Pass 1b — Host-level financial metrics (aggregated from bookings)
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO public.daily_metrics (
      metric_date,       dimension_type,      dimension_id,
      bookings_created,  bookings_confirmed,  bookings_cancelled, bookings_completed,
      gross_revenue_fcfa, net_revenue_fcfa,   refund_amount_fcfa,
      payout_amount_fcfa, rollup_version
    )
    SELECT
      p_date,
      'host'::public.app_metric_dimension,
      p.host_id,
      COUNT(b.id) FILTER (WHERE b.created_at   >= v_start::timestamptz
                              AND b.created_at   < v_end::timestamptz),
      COUNT(b.id) FILTER (WHERE b.confirmed_at >= v_start::timestamptz
                              AND b.confirmed_at < v_end::timestamptz),
      COUNT(b.id) FILTER (WHERE b.cancelled_at >= v_start::timestamptz
                              AND b.cancelled_at < v_end::timestamptz),
      COUNT(b.id) FILTER (WHERE b.completed_at >= v_start::timestamptz
                              AND b.completed_at < v_end::timestamptz),
      COALESCE(SUM(b.total_amount)
        FILTER (WHERE b.confirmed_at >= v_start::timestamptz
                  AND b.confirmed_at  < v_end::timestamptz), 0),
      COALESCE(SUM(b.service_fee_amount + b.commission_amount)
        FILTER (WHERE b.confirmed_at >= v_start::timestamptz
                  AND b.confirmed_at  < v_end::timestamptz), 0),
      -- [H-1] Correct columns: refund_amount_fcfa, processed_at, status 'completed'
      COALESCE((
        SELECT SUM(r2.refund_amount_fcfa)
        FROM   public.refunds r2
        JOIN   public.bookings b2  ON b2.id  = r2.booking_id
        JOIN   public.properties p2 ON p2.id = b2.property_id
        WHERE  p2.host_id      = p.host_id
          AND  r2.processed_at >= v_start::timestamptz
          AND  r2.processed_at  < v_end::timestamptz
          AND  r2.status = 'completed'::public.app_refund_status
      ), 0),
      COALESCE((
        SELECT SUM(py.amount_fcfa)
        FROM   public.payouts py
        WHERE  py.host_id = p.host_id
          AND  py.paid_at >= v_start::timestamptz
          AND  py.paid_at  < v_end::timestamptz
          AND  py.status  = 'paid'::public.app_payout_status
      ), 0),
      1
    FROM public.bookings b
    JOIN public.properties p ON p.id = b.property_id
    WHERE (
      (b.created_at   >= v_start::timestamptz AND b.created_at   < v_end::timestamptz)
      OR (b.confirmed_at >= v_start::timestamptz AND b.confirmed_at < v_end::timestamptz)
      OR (b.cancelled_at >= v_start::timestamptz AND b.cancelled_at < v_end::timestamptz)
      OR (b.completed_at >= v_start::timestamptz AND b.completed_at < v_end::timestamptz)
    )
    GROUP BY p.host_id
    ON CONFLICT ON CONSTRAINT uq_daily_metrics_dim DO UPDATE SET
      bookings_created    = EXCLUDED.bookings_created,
      bookings_confirmed  = EXCLUDED.bookings_confirmed,
      bookings_cancelled  = EXCLUDED.bookings_cancelled,
      bookings_completed  = EXCLUDED.bookings_completed,
      gross_revenue_fcfa  = EXCLUDED.gross_revenue_fcfa,
      net_revenue_fcfa    = EXCLUDED.net_revenue_fcfa,
      refund_amount_fcfa  = EXCLUDED.refund_amount_fcfa,
      payout_amount_fcfa  = EXCLUDED.payout_amount_fcfa,
      rollup_version      = public.daily_metrics.rollup_version + 1,
      updated_at          = now();

    -- ──────────────────────────────────────────────────────────────────────
    -- Pass 1c — Platform-level totals + growth metrics
    -- ──────────────────────────────────────────────────────────────────────
    INSERT INTO public.daily_metrics (
      metric_date,       dimension_type,      dimension_id,
      bookings_created,  bookings_confirmed,  bookings_cancelled, bookings_completed,
      gross_revenue_fcfa, net_revenue_fcfa,   payout_amount_fcfa, refund_amount_fcfa,
      new_users,         new_hosts,
      reviews_submitted,
      tickets_opened,    tickets_resolved,
      kyc_submitted,     kyc_approved,
      rollup_version
    )
    SELECT
      p_date,
      'platform'::public.app_metric_dimension,
      NULL,
      (SELECT COUNT(*) FROM public.bookings
       WHERE created_at   >= v_start::timestamptz AND created_at   < v_end::timestamptz),
      (SELECT COUNT(*) FROM public.bookings
       WHERE confirmed_at >= v_start::timestamptz AND confirmed_at < v_end::timestamptz),
      (SELECT COUNT(*) FROM public.bookings
       WHERE cancelled_at >= v_start::timestamptz AND cancelled_at < v_end::timestamptz),
      (SELECT COUNT(*) FROM public.bookings
       WHERE completed_at >= v_start::timestamptz AND completed_at < v_end::timestamptz),
      (SELECT COALESCE(SUM(total_amount), 0) FROM public.bookings
       WHERE confirmed_at >= v_start::timestamptz AND confirmed_at < v_end::timestamptz),
      (SELECT COALESCE(SUM(service_fee_amount + commission_amount), 0) FROM public.bookings
       WHERE confirmed_at >= v_start::timestamptz AND confirmed_at < v_end::timestamptz),
      (SELECT COALESCE(SUM(amount_fcfa), 0) FROM public.payouts
       WHERE paid_at >= v_start::timestamptz AND paid_at < v_end::timestamptz
         AND status = 'paid'::public.app_payout_status),
      -- [H-1] Correct columns: refund_amount_fcfa, processed_at, status 'completed'
      (SELECT COALESCE(SUM(refund_amount_fcfa), 0) FROM public.refunds
       WHERE processed_at >= v_start::timestamptz AND processed_at < v_end::timestamptz
         AND status = 'completed'::public.app_refund_status),
      (SELECT COUNT(*) FROM public.profiles
       WHERE created_at >= v_start::timestamptz AND created_at < v_end::timestamptz),
      (SELECT COUNT(*) FROM public.host_profiles
       WHERE created_at >= v_start::timestamptz AND created_at < v_end::timestamptz),
      -- [H-2] Correct timestamp: created_at (not submitted_at)
      -- Correct status cast: 'published'::app_review_status
      (SELECT COUNT(*) FROM public.reviews
       WHERE created_at >= v_start::timestamptz AND created_at < v_end::timestamptz
         AND status = 'published'::public.app_review_status),
      (SELECT COUNT(*) FROM public.support_tickets
       WHERE created_at >= v_start::timestamptz AND created_at < v_end::timestamptz),
      (SELECT COUNT(*) FROM public.support_tickets
       WHERE resolved_at >= v_start::timestamptz AND resolved_at < v_end::timestamptz),
      (SELECT COUNT(*) FROM public.host_verifications
       WHERE created_at >= v_start::timestamptz AND created_at < v_end::timestamptz),
      (SELECT COUNT(*) FROM public.host_verifications
       WHERE reviewed_at >= v_start::timestamptz AND reviewed_at < v_end::timestamptz
         AND status = 'approved'::public.app_kyc_status),
      1
    ON CONFLICT ON CONSTRAINT uq_daily_metrics_dim DO UPDATE SET
      bookings_created    = EXCLUDED.bookings_created,
      bookings_confirmed  = EXCLUDED.bookings_confirmed,
      bookings_cancelled  = EXCLUDED.bookings_cancelled,
      bookings_completed  = EXCLUDED.bookings_completed,
      gross_revenue_fcfa  = EXCLUDED.gross_revenue_fcfa,
      net_revenue_fcfa    = EXCLUDED.net_revenue_fcfa,
      payout_amount_fcfa  = EXCLUDED.payout_amount_fcfa,
      refund_amount_fcfa  = EXCLUDED.refund_amount_fcfa,
      new_users           = EXCLUDED.new_users,
      new_hosts           = EXCLUDED.new_hosts,
      reviews_submitted   = EXCLUDED.reviews_submitted,
      tickets_opened      = EXCLUDED.tickets_opened,
      tickets_resolved    = EXCLUDED.tickets_resolved,
      kyc_submitted       = EXCLUDED.kyc_submitted,
      kyc_approved        = EXCLUDED.kyc_approved,
      rollup_version      = public.daily_metrics.rollup_version + 1,
      updated_at          = now();

    -- ──────────────────────────────────────────────────────────────────────
    -- Pass 2 — Behavioral metrics from analytics_events
    -- Explicit timestamptz range guarantees partition pruning.
    -- ──────────────────────────────────────────────────────────────────────

    -- Property-level view counts
    UPDATE public.daily_metrics dm
    SET    property_views = ae.cnt,
           updated_at     = now()
    FROM (
      SELECT property_id,
             COUNT(*) AS cnt
      FROM   public.analytics_events
      WHERE  occurred_at  >= v_start::timestamptz
        AND  occurred_at   < v_end::timestamptz
        AND  event_type    = 'property_viewed'::public.app_analytics_event_type
        AND  property_id  IS NOT NULL
      GROUP BY property_id
    ) ae
    WHERE  dm.metric_date    = p_date
      AND  dm.dimension_type = 'property'::public.app_metric_dimension
      AND  dm.dimension_id   = ae.property_id;

    -- Platform-level search count
    UPDATE public.daily_metrics
    SET    search_count = (
             SELECT COUNT(*)
             FROM   public.analytics_events
             WHERE  occurred_at >= v_start::timestamptz
               AND  occurred_at  < v_end::timestamptz
               AND  event_type   = 'search_executed'::public.app_analytics_event_type
           ),
           updated_at = now()
    WHERE  metric_date    = p_date
      AND  dimension_type = 'platform'::public.app_metric_dimension;

  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'analytics-rollup', v_nominal_tick,
      'failed'::public.app_job_status, v_rows, SQLERRM
    );
    RAISE;
  END;

  PERFORM public.finish_scheduled_job(
    'analytics-rollup', v_nominal_tick,
    'success'::public.app_job_status, v_rows
  );

  PERFORM public.refresh_dashboard_metrics(now());

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_analytics_rollup(date, timestamptz)
  TO service_role;


-- =============================================================================
-- SECTION 5 — C-2: CREATE retry_failed_payouts_batch()
-- =============================================================================
-- The existing retry_failed_payout(p_payout_id uuid) retries a single payout.
-- The cron job incorrectly called it with CURRENT_DATE (a date, not a UUID).
-- This new batch wrapper iterates over all eligible failed payouts and calls
-- the single-record function for each, honouring the existing retry_count and
-- on_hold logic already encoded there.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.retry_failed_payouts_batch(
  p_tick timestamptz
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_nominal_tick  timestamptz;
  v_acquired      boolean;
  v_payout        record;
  v_count         integer := 0;
BEGIN
  v_nominal_tick := date_trunc('day', p_tick);

  v_acquired := public.begin_scheduled_job('retry-failed-payouts', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  BEGIN
    -- Iterate over payouts in 'failed' status that have not yet exhausted retries.
    -- retry_failed_payout() handles the retry_count < 3 / on_hold branching
    -- and updates the payout row directly; we just need to drive the loop.
    FOR v_payout IN
      SELECT id
      FROM   public.payouts
      WHERE  status      = 'failed'::public.app_payout_status
        AND  retry_count < 3
      ORDER  BY failed_at ASC
      LIMIT  100  -- safety cap; runs daily so backlog should be small
    LOOP
      PERFORM public.retry_failed_payout(v_payout.id);
      v_count := v_count + 1;
    END LOOP;

    PERFORM public.finish_scheduled_job(
      'retry-failed-payouts', v_nominal_tick,
      'success'::public.app_job_status, v_count
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'retry-failed-payouts', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_failed_payouts_batch(timestamptz)
  TO service_role;


-- =============================================================================
-- SECTION 6 — H-6: REPLACE validate_kyc_transition
-- =============================================================================
-- Original trigger did not mirror new status to profiles.kyc_status.
-- After this fix, every status transition in host_verifications is immediately
-- reflected on profiles.kyc_status so client queries always see current state.
-- All other logic (state machine edges, side effects, terminal guards) is
-- unchanged from Migration 0008.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_kyc_transition()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states: rejected and expired cannot be updated further.
  -- Resubmission creates a new host_verifications row.
  IF OLD.status IN (
    'rejected'::public.app_kyc_status,
    'expired'::public.app_kyc_status
  ) THEN
    RAISE EXCEPTION
      'host_verifications: % is a terminal state; resubmit by creating a new row (verification_id: %)',
      OLD.status, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Validate allowed state machine edges.
  IF NOT (
    (OLD.status = 'pending'::public.app_kyc_status
      AND NEW.status = 'under_review'::public.app_kyc_status)
    OR
    (OLD.status = 'under_review'::public.app_kyc_status
      AND NEW.status IN (
        'approved'::public.app_kyc_status,
        'rejected'::public.app_kyc_status
      ))
    OR
    (OLD.status = 'approved'::public.app_kyc_status
      AND NEW.status = 'expired'::public.app_kyc_status)
  ) THEN
    RAISE EXCEPTION
      'host_verifications: invalid status transition % → % (verification_id: %)',
      OLD.status, NEW.status, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Side effects on rejection.
  IF NEW.status = 'rejected'::public.app_kyc_status THEN
    IF NEW.rejection_reason IS NULL OR char_length(NEW.rejection_reason) < 5 THEN
      RAISE EXCEPTION
        'host_verifications: rejection_reason (min 5 chars) required when rejecting (verification_id: %)',
        OLD.id USING ERRCODE = 'check_violation';
    END IF;
    NEW.reviewed_at := now();
  END IF;

  -- Side effects on approval.
  IF NEW.status = 'approved'::public.app_kyc_status THEN
    NEW.reviewed_at := now();
    NEW.expires_at  := now() + interval '2 years';
  END IF;

  -- [H-6] Mirror the new status to profiles.kyc_status so the profile row
  -- always reflects the current KYC state without waiting for the nightly job.
  -- host_id may be NULL if the profile was deleted (GDPR); UPDATE is a no-op.
  IF NEW.host_id IS NOT NULL THEN
    UPDATE public.profiles
    SET    kyc_status = NEW.status,
           updated_at = now()
    WHERE  id = NEW.host_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already exists on host_verifications (created in Migration 0008).
-- CREATE OR REPLACE FUNCTION above replaces the body in place;
-- the trigger binding does not need to be recreated.


-- =============================================================================
-- SECTION 7 — H-4: REVOKE claim_availability / release_availability from authenticated
-- =============================================================================
-- Both functions were incorrectly granted to authenticated in Migration 0004,
-- allowing any browser-side client to manipulate room availability directly.
-- Only service_role (server-function layer) should be able to call these.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.claim_availability(uuid, date, date, uuid)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.release_availability(uuid)
  FROM authenticated;

-- Confirm service_role grant is present (idempotent; safe to re-run).
GRANT EXECUTE ON FUNCTION public.claim_availability(uuid, date, date, uuid)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.release_availability(uuid)
  TO service_role;


-- =============================================================================
-- SECTION 8 — H-5: ADD SELECT grant on blocked_dates for authenticated
-- =============================================================================
-- Migration 0004 granted INSERT, UPDATE, DELETE but omitted SELECT.
-- The RLS policy "blocked_dates: host all own" covers SELECT at the policy
-- layer, but without the GRANT the host cannot read their own calendar blocks
-- from any Supabase client call.
-- =============================================================================

GRANT SELECT ON public.blocked_dates TO authenticated;


-- =============================================================================
-- SECTION 9 — C-1, C-2, C-3: REPLACE pg_cron REGISTRATIONS
-- =============================================================================
-- Fixes three cron function calls that had wrong argument types or arities:
--
--   C-1: expire-pending-bookings called expire_pending_bookings(now())
--        but the function takes no arguments → call without args
--
--   C-2: retry-failed-payouts called retry_failed_payout(CURRENT_DATE)
--        which passes a date where a uuid is required, and the function
--        retries only one payout → replace with new batch wrapper
--
--   C-3: process-payout-batch called process_payout_batch(CURRENT_DATE)
--        which passes a date where an integer is required → call with no
--        args (uses defaults: T+1 for subscribed hosts, T+5 for free plan)
-- =============================================================================

-- Unschedule the three affected jobs.
SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname IN (
  'expire-pending-bookings',
  'retry-failed-payouts',
  'process-payout-batch'
);

-- C-1: correct call — no arguments.
SELECT cron.schedule(
  'expire-pending-bookings',
  '*/15 * * * *',
  $$SELECT public.expire_pending_bookings()$$
);

-- C-2: correct call — batch wrapper with now() tick.
SELECT cron.schedule(
  'retry-failed-payouts',
  '0 3 * * *',
  $$SELECT public.retry_failed_payouts_batch(now())$$
);

-- C-3: correct call — no positional argument; function defaults apply.
SELECT cron.schedule(
  'process-payout-batch',
  '0 6 * * *',
  $$SELECT public.process_payout_batch()$$
);


-- =============================================================================
-- SECTION 10 — C-4: REPLACE audit-log-retention cron registration
-- =============================================================================
-- The 'audit-log-retention' job was registered in Migration 0009 calling
-- drop_expired_audit_partitions() which did not exist.  Now that the function
-- is defined above (Section 2), re-register with the correct call.
-- =============================================================================

SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname = 'audit-log-retention';

SELECT cron.schedule(
  'audit-log-retention',
  '0 3 1 * *',
  $$SELECT public.drop_expired_audit_partitions(now())$$
);


-- =============================================================================
-- END OF MIGRATION
-- =============================================================================


-- =============================================================================
-- DOWN MIGRATION (reference only — do not execute in production)
-- =============================================================================
-- To roll back (execute in reverse dependency order).
-- WARNING: restores the broken state from 0009 — run only in development.
--
-- 1. Restore cron jobs to their (broken) 0009 forms
-- SELECT cron.unschedule(jobid) FROM cron.job
-- WHERE jobname IN (
--   'expire-pending-bookings', 'retry-failed-payouts',
--   'process-payout-batch', 'audit-log-retention'
-- );
-- SELECT cron.schedule('expire-pending-bookings', '* /15 * * * *',
--   $$SELECT public.expire_pending_bookings(now())$$);
-- SELECT cron.schedule('retry-failed-payouts', '0 3 * * *',
--   $$SELECT public.retry_failed_payout(CURRENT_DATE)$$);
-- SELECT cron.schedule('process-payout-batch', '0 6 * * *',
--   $$SELECT public.process_payout_batch(CURRENT_DATE)$$);
-- SELECT cron.schedule('audit-log-retention', '0 3 1 * *',
--   $$SELECT public.drop_expired_audit_partitions(now())$$);
--
-- 2. Revoke SELECT on blocked_dates (restores broken state)
-- REVOKE SELECT ON public.blocked_dates FROM authenticated;
--
-- 3. Restore claim_availability / release_availability to authenticated
-- GRANT EXECUTE ON FUNCTION public.claim_availability(uuid, date, date, uuid) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.release_availability(uuid) TO authenticated;
--
-- 4. Drop new functions
-- DROP FUNCTION IF EXISTS public.retry_failed_payouts_batch(timestamptz);
-- DROP FUNCTION IF EXISTS public.drop_expired_audit_partitions(timestamptz);
--
-- 5. Drop subscriptions table
-- DROP TABLE IF EXISTS billing.subscriptions;
--
-- Note: validate_kyc_transition() and run_analytics_rollup() are replaced
-- in-place; restoring them requires re-applying their original bodies from
-- Migration 0009 and 0008 respectively.
-- =============================================================================
