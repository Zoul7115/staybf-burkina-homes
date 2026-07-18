-- =============================================================================
-- Migration 0009 — Analytics & Automation
-- Scope : analytics_events (partitioned), daily_metrics, dashboard_metrics,
--         scheduled_jobs, rollup functions, pg_cron job registrations
-- Depends on : 0001 (profiles, has_role, app_role, set_updated_at)
--              0002 (regions, cities)
--              0003 (properties, host_profiles)
--              0005 (bookings, booking_events, app_booking_event_type)
--              0006 (payouts, refunds)
--              0007 (notifications, reviews)
--              0008 (host_verifications, support_tickets, audit_logs,
--                    log_audit_event, create_audit_partition,
--                    drop_expired_audit_partitions — extended here)
-- Author: StayBF
-- =============================================================================


-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
-- pg_cron is required for cron.schedule() / cron.unschedule() calls below.
-- pg_cron always creates the 'cron' schema itself; WITH SCHEMA is not supported.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant cron usage to postgres (required for job scheduling)
GRANT USAGE ON SCHEMA cron TO postgres;


-- ============================================================
-- 0b. DEFERRED INDEX FROM MIGRATION 0008
-- ============================================================
-- uq_host_verifications_active could not be created in migration 0008 because:
--   • Its WHERE predicate uses 'under_review' and 'approved', which were added
--     via ALTER TYPE ADD VALUE in that same transaction.
--   • PostgreSQL forbids typed enum literals in index predicates when the value
--     was added in the same transaction ("unsafe use of new enum value").
--   • The ::text workaround is also forbidden (enum→text cast not IMMUTABLE).
-- Now that migration 0008 has committed, the enum values are fully visible
-- and can be used as typed literals in index predicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_host_verifications_active
  ON public.host_verifications (host_id)
  WHERE status IN (
    'pending'::public.app_kyc_status,
    'under_review'::public.app_kyc_status,
    'approved'::public.app_kyc_status
  );

-- Admin review queue: pending and under_review submissions
-- (deferred from 0008 — same reason as uq_host_verifications_active)
CREATE INDEX IF NOT EXISTS idx_host_verifications_review_queue
  ON public.host_verifications (status, created_at)
  WHERE status IN (
    'pending'::public.app_kyc_status,
    'under_review'::public.app_kyc_status
  );

-- Nightly expiry job: approved documents approaching expiry window
-- (deferred from 0008 — same reason as uq_host_verifications_active)
CREATE INDEX IF NOT EXISTS idx_host_verifications_expiry
  ON public.host_verifications (expires_at)
  WHERE status = 'approved'::public.app_kyc_status
    AND expires_at IS NOT NULL;


-- ============================================================
-- 1. ENUMS
-- ============================================================

-- Behavioral and transactional events tracked in analytics_events.
CREATE TYPE public.app_analytics_event_type AS ENUM (
  -- Discovery
  'search_executed',        'filter_applied',         'property_viewed',
  'room_viewed',            'photo_gallery_opened',   'map_interacted',
  'region_browsed',
  -- Booking funnel
  'booking_funnel_started', 'booking_funnel_dates_selected',
  'booking_funnel_guests_set', 'booking_funnel_quote_viewed',
  'booking_created',        'booking_confirmed',      'booking_cancelled',
  'booking_completed',      'booking_payment_initiated',
  -- Engagement
  'review_submitted',       'favorite_added',         'favorite_removed',
  'message_sent',           'thread_opened',
  -- Platform (server-side transactional events; inserted within business txn)
  'user_registered',        'user_logged_in',         'host_onboarded',
  'kyc_submitted',          'payment_initiated',      'payment_captured',
  'payout_received'
);

-- Dimension granularity for daily_metrics rows.
CREATE TYPE public.app_metric_dimension AS ENUM (
  'platform',   -- single row covering all activity
  'property',   -- one row per property_id
  'host',       -- one row per host_id (aggregated across all properties)
  'region',     -- one row per region_id
  'room'        -- reserved; not populated at MVP
);

-- Execution status for scheduled_jobs rows.
CREATE TYPE public.app_job_status AS ENUM (
  'running',   -- currently executing
  'success',   -- completed without error
  'failed',    -- terminated with an exception
  'skipped',   -- duplicate execution guard fired; no work done
  'missed',    -- watchdog detected a gap in expected executions
  'partial'    -- completed with per-key errors (dashboard refresh only)
);


-- ============================================================
-- 2. SCHEDULED_JOBS
-- ============================================================
-- Self-audit log for every pg_cron job execution.
-- UNIQUE (job_name, scheduled_for) is the duplicate-execution guard:
-- each job function INSERTs this pair first; a second session for the
-- same tick hits the constraint and exits without doing any work.

CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id             uuid                    PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  job_name       text                    NOT NULL,
  -- Nominal pg_cron tick timestamp (truncated to schedule interval).
  -- Used as the collision key — NOT the actual wall-clock start time.
  scheduled_for  timestamptz             NOT NULL,
  started_at     timestamptz             NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         public.app_job_status   NOT NULL DEFAULT 'running',
  rows_processed integer,
  last_error     text,
  metadata       jsonb,

  CONSTRAINT scheduled_jobs_name_len    CHECK (char_length(job_name) BETWEEN 1 AND 100),
  CONSTRAINT scheduled_jobs_rows_pos    CHECK (rows_processed IS NULL OR rows_processed >= 0),
  CONSTRAINT scheduled_jobs_finish_order CHECK (
    finished_at IS NULL OR finished_at >= started_at
  ),

  -- Primary duplicate-execution guard.
  CONSTRAINT uq_scheduled_jobs_tick UNIQUE (job_name, scheduled_for)
);

ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY "scheduled_jobs: admin read"
  ON public.scheduled_jobs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- No INSERT / UPDATE / DELETE for authenticated; all writes via service_role.
GRANT SELECT ON public.scheduled_jobs TO authenticated;
GRANT ALL    ON public.scheduled_jobs TO service_role;

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_name_tick
  ON public.scheduled_jobs (job_name, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status
  ON public.scheduled_jobs (status, started_at DESC)
  WHERE status IN ('running', 'failed', 'missed');


-- ============================================================
-- 3. ANALYTICS_EVENTS (partitioned)
-- ============================================================
-- Immutable, append-only stream of behavioral and transactional events.
-- Partitioned monthly by occurred_at.  Retention: 12 months rolling.
-- No FK constraints on actor_id / entity columns:
--   1. Partitioned tables make FK maintenance expensive.
--   2. Actors and entities may be deleted; events must outlive them.
--   3. Referential integrity is enforced at the server-function write layer.
--
-- Composite PK (id, occurred_at) is required by Postgres for partitioned tables.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id              uuid                            NOT NULL DEFAULT extensions.gen_random_uuid(),
  occurred_at     timestamptz                     NOT NULL DEFAULT now(),
  event_type      public.app_analytics_event_type NOT NULL,
  -- Client-generated session UUID; no FK (sessions are ephemeral).
  session_id      uuid,
  -- Authenticated user who triggered the event; NULL for anon.
  actor_id        uuid,
  actor_role      text,
  -- Denormalized entity references for fast partition-pruned aggregation.
  -- No FKs — see notes above.
  property_id     uuid,
  room_id         uuid,
  booking_id      uuid,
  -- Arbitrary event payload: search terms, filter values, funnel step data.
  -- Must not contain PII.
  event_data      jsonb,
  -- Hashed client IP (SHA-256 truncated to 16 bytes; not raw IP).
  client_ip_hash  text,
  user_agent      text,
  -- Client-supplied key for deduplication.  Convention for transactional events:
  -- '{event_type}:{entity_id}'.  Behavioral events may omit this.
  idempotency_key text,

  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

-- Deduplication anchor: prevents duplicate inserts for the same logical event.
-- Partial index excludes the majority of behavioral events with no key.
-- occurred_at must be included: Postgres requires all partitioning columns
-- in every unique constraint on a partitioned table.
CREATE UNIQUE INDEX IF NOT EXISTS uq_analytics_events_idempotency
  ON public.analytics_events (idempotency_key, occurred_at)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events FORCE ROW LEVEL SECURITY;

-- Raw events contain session and behavioral data; no client read access.
-- Admin may SELECT for investigation; service_role for all writes.
CREATE POLICY "analytics_events: admin read"
  ON public.analytics_events FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- No INSERT/UPDATE/DELETE for authenticated — server function via service_role.
GRANT SELECT ON public.analytics_events TO authenticated;
GRANT ALL    ON public.analytics_events TO service_role;

-- Indexes on parent propagate as LOCAL indexes to each partition.

-- User-level funnel: "all events by actor X over N days"
CREATE INDEX IF NOT EXISTS idx_analytics_events_actor
  ON public.analytics_events (actor_id, occurred_at)
  WHERE actor_id IS NOT NULL;

-- Event-type time-series: "all property_viewed events this month"
CREATE INDEX IF NOT EXISTS idx_analytics_events_type
  ON public.analytics_events (event_type, occurred_at);

-- Property-level conversion funnel: "views → bookings for property X"
CREATE INDEX IF NOT EXISTS idx_analytics_events_property
  ON public.analytics_events (property_id, event_type, occurred_at)
  WHERE property_id IS NOT NULL;


-- -------------------------------------------------------
-- 3a. Initial partitions — 2026-06 through 2027-03
-- -------------------------------------------------------
-- pg_cron creates future partitions via create_analytics_partition()
-- on the 25th of each month (targeting month+2).

CREATE TABLE IF NOT EXISTS public.analytics_events_2026_06
  PARTITION OF public.analytics_events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE IF NOT EXISTS public.analytics_events_2026_07
  PARTITION OF public.analytics_events
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE IF NOT EXISTS public.analytics_events_2026_08
  PARTITION OF public.analytics_events
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE IF NOT EXISTS public.analytics_events_2026_09
  PARTITION OF public.analytics_events
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE IF NOT EXISTS public.analytics_events_2026_10
  PARTITION OF public.analytics_events
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE IF NOT EXISTS public.analytics_events_2026_11
  PARTITION OF public.analytics_events
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE IF NOT EXISTS public.analytics_events_2026_12
  PARTITION OF public.analytics_events
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS public.analytics_events_2027_01
  PARTITION OF public.analytics_events
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE IF NOT EXISTS public.analytics_events_2027_02
  PARTITION OF public.analytics_events
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE IF NOT EXISTS public.analytics_events_2027_03
  PARTITION OF public.analytics_events
  FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');


-- ============================================================
-- 4. DAILY_METRICS
-- ============================================================
-- One row per (metric_date, dimension_type, dimension_id).
-- Populated nightly by run_analytics_rollup().
-- Upsert-safe: ON CONFLICT DO UPDATE recalculates from scratch on re-run.
-- NULLS NOT DISTINCT (Postgres 15+) makes two NULL dimension_ids equal,
-- allowing exactly one 'platform' row per date.

CREATE TABLE IF NOT EXISTS public.daily_metrics (
  id                  uuid                        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  metric_date         date                        NOT NULL,
  dimension_type      public.app_metric_dimension NOT NULL,
  -- NULL only when dimension_type = 'platform'.
  dimension_id        uuid,

  -- Booking counts
  bookings_created    integer NOT NULL DEFAULT 0,
  bookings_confirmed  integer NOT NULL DEFAULT 0,
  bookings_cancelled  integer NOT NULL DEFAULT 0,
  bookings_completed  integer NOT NULL DEFAULT 0,

  -- Financial (FCFA)
  gross_revenue_fcfa  bigint  NOT NULL DEFAULT 0,   -- SUM(total_amount) on confirmed bookings
  net_revenue_fcfa    bigint  NOT NULL DEFAULT 0,   -- SUM(service_fee_amount + commission_amount)
  payout_amount_fcfa  bigint  NOT NULL DEFAULT 0,   -- SUM(payouts.amount_fcfa) paid on date
  refund_amount_fcfa  bigint  NOT NULL DEFAULT 0,   -- SUM(refunds.amount_fcfa) settled on date

  -- Growth (platform-level only; zero for other dimensions)
  new_users           integer NOT NULL DEFAULT 0,
  new_hosts           integer NOT NULL DEFAULT 0,

  -- Behavioral (from analytics_events)
  property_views      integer NOT NULL DEFAULT 0,
  search_count        integer NOT NULL DEFAULT 0,

  -- Engagement
  reviews_submitted   integer NOT NULL DEFAULT 0,
  avg_review_score    numeric(3,2),

  -- Support / operations (platform-level only)
  tickets_opened      integer NOT NULL DEFAULT 0,
  tickets_resolved    integer NOT NULL DEFAULT 0,
  kyc_submitted       integer NOT NULL DEFAULT 0,
  kyc_approved        integer NOT NULL DEFAULT 0,

  -- Incremented on each re-run; values > 1 signal a re-run occurred.
  rollup_version      integer NOT NULL DEFAULT 1,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Counter non-negativity
  CONSTRAINT daily_metrics_bookings_created_pos    CHECK (bookings_created    >= 0),
  CONSTRAINT daily_metrics_bookings_confirmed_pos  CHECK (bookings_confirmed  >= 0),
  CONSTRAINT daily_metrics_bookings_cancelled_pos  CHECK (bookings_cancelled  >= 0),
  CONSTRAINT daily_metrics_bookings_completed_pos  CHECK (bookings_completed  >= 0),
  CONSTRAINT daily_metrics_gross_revenue_pos       CHECK (gross_revenue_fcfa  >= 0),
  CONSTRAINT daily_metrics_net_revenue_pos         CHECK (net_revenue_fcfa    >= 0),
  CONSTRAINT daily_metrics_payout_pos              CHECK (payout_amount_fcfa  >= 0),
  CONSTRAINT daily_metrics_refund_pos              CHECK (refund_amount_fcfa  >= 0),
  CONSTRAINT daily_metrics_new_users_pos           CHECK (new_users           >= 0),
  CONSTRAINT daily_metrics_new_hosts_pos           CHECK (new_hosts           >= 0),
  CONSTRAINT daily_metrics_views_pos               CHECK (property_views      >= 0),
  CONSTRAINT daily_metrics_search_pos              CHECK (search_count        >= 0),
  CONSTRAINT daily_metrics_reviews_pos             CHECK (reviews_submitted   >= 0),
  CONSTRAINT daily_metrics_avg_score_range         CHECK (
    avg_review_score IS NULL
    OR avg_review_score BETWEEN 1.00 AND 5.00
  ),
  CONSTRAINT daily_metrics_rollup_version_pos      CHECK (rollup_version      >= 1),

  -- Unique per (date, dimension) — NULLS NOT DISTINCT treats all NULL
  -- dimension_ids as equal so exactly one platform row exists per date.
  CONSTRAINT uq_daily_metrics_dim
    UNIQUE NULLS NOT DISTINCT (metric_date, dimension_type, dimension_id)
);

ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics FORCE ROW LEVEL SECURITY;

-- Hosts may read their own dimension rows (property / host dimension_id = their id).
CREATE POLICY "daily_metrics: host read own"
  ON public.daily_metrics FOR SELECT
  USING (
    dimension_type IN (
      'property'::public.app_metric_dimension,
      'host'::public.app_metric_dimension
    )
    AND dimension_id = auth.uid()
  );

-- Admin full read.
CREATE POLICY "daily_metrics: admin read"
  ON public.daily_metrics FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- No INSERT / UPDATE for authenticated; rollup job uses service_role.
GRANT SELECT ON public.daily_metrics TO authenticated;
GRANT ALL    ON public.daily_metrics TO service_role;

-- Dashboard time-series: most recent dates first, filtered by dimension
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date_dim
  ON public.daily_metrics (metric_date DESC, dimension_type);

-- Host/property drill-down
CREATE INDEX IF NOT EXISTS idx_daily_metrics_dim_date
  ON public.daily_metrics (dimension_type, dimension_id, metric_date DESC)
  WHERE dimension_id IS NOT NULL;

-- Retention pruning
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date
  ON public.daily_metrics (metric_date);

CREATE TRIGGER trg_daily_metrics_updated_at
  BEFORE UPDATE ON public.daily_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 5. DASHBOARD_METRICS
-- ============================================================
-- Point-in-time cached snapshots for the admin dashboard.
-- Refreshed every 15 minutes by refresh_dashboard_metrics().
-- Each row is a named key (metric_key) with a JSONB payload.
-- Shape of metric_value varies per key; documented inline.

CREATE TABLE IF NOT EXISTS public.dashboard_metrics (
  id           uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  -- Stable human-readable key; determines payload shape.
  metric_key   text        NOT NULL UNIQUE,
  metric_value jsonb       NOT NULL,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  -- Client skips refetch when now() < valid_until.
  valid_until  timestamptz NOT NULL,

  CONSTRAINT dashboard_metrics_key_len   CHECK (char_length(metric_key) BETWEEN 1 AND 100),
  CONSTRAINT dashboard_metrics_valid_until CHECK (valid_until > computed_at)
);

ALTER TABLE public.dashboard_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_metrics FORCE ROW LEVEL SECURITY;

CREATE POLICY "dashboard_metrics: admin read"
  ON public.dashboard_metrics FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- No client INSERT / UPDATE; refresh job uses service_role.
GRANT SELECT ON public.dashboard_metrics TO authenticated;
GRANT ALL    ON public.dashboard_metrics TO service_role;

-- Stale detection: find keys past their valid_until
CREATE INDEX IF NOT EXISTS idx_dashboard_metrics_valid_until
  ON public.dashboard_metrics (valid_until);


-- ============================================================
-- 6. JOB LOCK HELPERS
-- ============================================================
-- Shared preamble / epilogue for all scheduled job functions.
-- Encapsulating the pattern here keeps each job function DRY
-- and ensures the duplicate-execution guard is applied uniformly.

-- -------------------------------------------------------
-- 6a. begin_scheduled_job
-- -------------------------------------------------------
-- Attempts to claim exclusive execution rights for (job_name, nominal_tick).
-- Returns TRUE  → lock acquired; caller should proceed.
-- Returns FALSE → duplicate execution detected; caller must return immediately.

CREATE OR REPLACE FUNCTION public.begin_scheduled_job(
  p_job_name     text,
  p_nominal_tick timestamptz
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_inserted integer;
BEGIN
  INSERT INTO public.scheduled_jobs (job_name, scheduled_for, started_at, status)
  VALUES (p_job_name, p_nominal_tick, now(), 'running')
  ON CONFLICT (job_name, scheduled_for) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.begin_scheduled_job(text, timestamptz)
  TO service_role;


-- -------------------------------------------------------
-- 6b. finish_scheduled_job
-- -------------------------------------------------------
-- Writes the final status, duration, and row count for a job execution.

CREATE OR REPLACE FUNCTION public.finish_scheduled_job(
  p_job_name       text,
  p_nominal_tick   timestamptz,
  p_status         public.app_job_status,
  p_rows_processed integer DEFAULT NULL,
  p_last_error     text    DEFAULT NULL,
  p_metadata       jsonb   DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  UPDATE public.scheduled_jobs
  SET    status         = p_status,
         finished_at    = now(),
         rows_processed = p_rows_processed,
         last_error     = p_last_error,
         metadata       = p_metadata
  WHERE  job_name       = p_job_name
    AND  scheduled_for  = p_nominal_tick;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finish_scheduled_job(
  text, timestamptz, public.app_job_status, integer, text, jsonb
) TO service_role;


-- ============================================================
-- 7. HELPER: create_analytics_partition
-- ============================================================
-- Creates the analytics_events partition for the given year + month.
-- Called by pg_cron on the 25th of each month for month + 2.
-- Idempotent: CREATE TABLE IF NOT EXISTS is safe to re-run.

CREATE OR REPLACE FUNCTION public.create_analytics_partition(
  p_year  integer,
  p_month integer
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_table_name text;
  v_start_date date;
  v_end_date   date;
BEGIN
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'create_analytics_partition: month must be 1–12 (got %)',
      p_month USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_start_date := make_date(p_year, p_month, 1);
  v_end_date   := v_start_date + interval '1 month';
  v_table_name := format(
    'analytics_events_%s_%s',
    p_year,
    lpad(p_month::text, 2, '0')
  );

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS public.%I
        PARTITION OF public.analytics_events
        FOR VALUES FROM (%L) TO (%L)
    $sql$,
    v_table_name, v_start_date, v_end_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_analytics_partition(integer, integer)
  TO service_role;


-- ============================================================
-- 8. JOB: detect_stuck_jobs
-- ============================================================
-- Watchdog: finds scheduled_jobs rows stuck in 'running' for > 1 hour
-- and marks them 'failed'.  Runs every 30 minutes.
-- This is a monitoring / cleanup function; it does not block future
-- ticks (each tick has a unique scheduled_for, so old running rows
-- do not prevent new ones from starting).

CREATE OR REPLACE FUNCTION public.detect_stuck_jobs(
  p_tick timestamptz
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_nominal_tick timestamptz;
  v_acquired     boolean;
  v_count        integer;
BEGIN
  -- Nominal tick: truncate to nearest 30-minute boundary
  v_nominal_tick := date_trunc('hour', p_tick)
    + (EXTRACT(MINUTE FROM p_tick)::integer / 30) * interval '30 minutes';

  v_acquired := public.begin_scheduled_job('stuck-job-watchdog', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  UPDATE public.scheduled_jobs
  SET    status     = 'failed',
         finished_at = now(),
         last_error  = 'watchdog: session timeout (running > 1 hour)'
  WHERE  status      = 'running'
    AND  started_at  < p_tick - interval '1 hour'
    AND  job_name   != 'stuck-job-watchdog';  -- don't touch watchdog's own rows

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.finish_scheduled_job(
    'stuck-job-watchdog', v_nominal_tick,
    'success'::public.app_job_status, v_count
  );
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_stuck_jobs(timestamptz)
  TO service_role;


-- ============================================================
-- 9. JOB: run_analytics_rollup
-- ============================================================
-- Nightly three-pass rollup from transactional tables and analytics_events.
-- Called at 02:00 UTC daily for p_date = CURRENT_DATE - 1.
-- Idempotent: ON CONFLICT DO UPDATE recalculates from scratch.
-- rollup_version increments on each re-run.
--
-- Pass 1a: Property-level financial metrics from bookings.
-- Pass 1b: Host-level financial metrics (aggregated from bookings).
-- Pass 1c: Platform-level totals + growth metrics.
-- Pass 2:  Behavioral metrics from analytics_events (property_views,
--          search_count).

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
  -- Nominal tick: daily boundary
  v_nominal_tick := date_trunc('day', p_scheduled_for);

  v_acquired := public.begin_scheduled_job('analytics-rollup', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  -- Advisory lock guards against concurrent manual re-runs for the same date.
  IF NOT pg_try_advisory_xact_lock(hashtext('analytics-rollup')::bigint) THEN
    PERFORM public.finish_scheduled_job(
      'analytics-rollup', v_nominal_tick,
      'skipped'::public.app_job_status, 0,
      'advisory lock held by concurrent session'
    );
    RETURN 0;
  END IF;

  -- Date range for partition-pruned queries on analytics_events.
  v_start := p_date;
  v_end   := p_date + 1;

  BEGIN
    -- ─────────────────────────────────────────────────────────────
    -- Pass 1a — Property-level financial metrics
    -- ─────────────────────────────────────────────────────────────
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
      COUNT(b.id)         FILTER (WHERE b.created_at   >= v_start::timestamptz
                                    AND b.created_at    < v_end::timestamptz),
      COUNT(b.id)         FILTER (WHERE b.confirmed_at >= v_start::timestamptz
                                    AND b.confirmed_at  < v_end::timestamptz),
      COUNT(b.id)         FILTER (WHERE b.cancelled_at >= v_start::timestamptz
                                    AND b.cancelled_at  < v_end::timestamptz),
      COUNT(b.id)         FILTER (WHERE b.completed_at >= v_start::timestamptz
                                    AND b.completed_at  < v_end::timestamptz),
      -- gross = what traveler paid on confirmed bookings
      COALESCE(SUM(b.total_amount)
        FILTER (WHERE b.confirmed_at >= v_start::timestamptz
                  AND b.confirmed_at  < v_end::timestamptz), 0),
      -- net = platform take (service fee + host commission)
      COALESCE(SUM(b.service_fee_amount + b.commission_amount)
        FILTER (WHERE b.confirmed_at >= v_start::timestamptz
                  AND b.confirmed_at  < v_end::timestamptz), 0),
      -- refunds settled today for bookings on this property
      COALESCE((
        SELECT SUM(r.amount_fcfa)
        FROM   public.refunds r
        WHERE  r.booking_id = b.id
          AND  r.refunded_at >= v_start::timestamptz
          AND  r.refunded_at  < v_end::timestamptz
          AND  r.status = 'refunded'
      ), 0),
      -- reviews written for stays at this property
      COALESCE((
        SELECT COUNT(*)
        FROM   public.reviews rv
        JOIN   public.bookings rb ON rb.id = rv.booking_id
        WHERE  rb.property_id = b.property_id
          AND  rv.submitted_at >= v_start::timestamptz
          AND  rv.submitted_at  < v_end::timestamptz
          AND  rv.status = 'published'
        LIMIT 1
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

    -- Update avg_review_score for properties with reviews today
    UPDATE public.daily_metrics dm
    SET    avg_review_score = sub.avg_score
    FROM (
      SELECT rb.property_id,
             AVG(rv.overall_score)::numeric(3,2) AS avg_score
      FROM   public.reviews rv
      JOIN   public.bookings rb ON rb.id = rv.booking_id
      WHERE  rv.submitted_at >= v_start::timestamptz
        AND  rv.submitted_at  < v_end::timestamptz
        AND  rv.status = 'published'
      GROUP BY rb.property_id
    ) sub
    WHERE  dm.metric_date    = p_date
      AND  dm.dimension_type = 'property'::public.app_metric_dimension
      AND  dm.dimension_id   = sub.property_id;

    -- ─────────────────────────────────────────────────────────────
    -- Pass 1b — Host-level financial metrics (aggregated from bookings)
    -- ─────────────────────────────────────────────────────────────
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
      COALESCE((
        SELECT SUM(r2.amount_fcfa)
        FROM   public.refunds r2
        JOIN   public.bookings b2 ON b2.id = r2.booking_id
        JOIN   public.properties p2 ON p2.id = b2.property_id
        WHERE  p2.host_id = p.host_id
          AND  r2.refunded_at >= v_start::timestamptz
          AND  r2.refunded_at  < v_end::timestamptz
          AND  r2.status = 'refunded'
      ), 0),
      -- payout amounts disbursed to this host today
      COALESCE((
        SELECT SUM(py.amount_fcfa)
        FROM   public.payouts py
        WHERE  py.host_id = p.host_id
          AND  py.paid_at >= v_start::timestamptz
          AND  py.paid_at  < v_end::timestamptz
          AND  py.status  = 'paid'
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

    -- ─────────────────────────────────────────────────────────────
    -- Pass 1c — Platform-level totals + growth metrics
    -- ─────────────────────────────────────────────────────────────
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
         AND status = 'paid'),
      (SELECT COALESCE(SUM(amount_fcfa), 0) FROM public.refunds
       WHERE refunded_at >= v_start::timestamptz AND refunded_at < v_end::timestamptz
         AND status = 'refunded'),
      (SELECT COUNT(*) FROM public.profiles
       WHERE created_at >= v_start::timestamptz AND created_at < v_end::timestamptz),
      (SELECT COUNT(*) FROM public.host_profiles
       WHERE created_at >= v_start::timestamptz AND created_at < v_end::timestamptz),
      (SELECT COUNT(*) FROM public.reviews
       WHERE submitted_at >= v_start::timestamptz AND submitted_at < v_end::timestamptz
         AND status = 'published'),
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

    -- ─────────────────────────────────────────────────────────────
    -- Pass 2 — Behavioral metrics from analytics_events
    -- Uses explicit timestamptz range to guarantee partition pruning.
    -- ─────────────────────────────────────────────────────────────

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

  -- Bonus: refresh dashboard metrics at end of rollup so admin sees
  -- fresh totals at 02:00 UTC without waiting for the 15-min tick.
  PERFORM public.refresh_dashboard_metrics(now());

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_analytics_rollup(date, timestamptz)
  TO service_role;


-- ============================================================
-- 10. JOB: refresh_dashboard_metrics
-- ============================================================
-- Upserts all dashboard_metrics keys from pre-aggregated daily_metrics
-- and indexed transactional table counts.
-- Runs every 15 minutes.  Each key is wrapped in a SAVEPOINT so a
-- single key failure does not abort the others (status = 'partial').

CREATE OR REPLACE FUNCTION public.refresh_dashboard_metrics(
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
  v_errors        text[] := '{}';
  v_key_count     integer := 0;
  v_final_status  public.app_job_status;
BEGIN
  -- Nominal tick: nearest 15-minute boundary
  v_nominal_tick := date_trunc('hour', p_scheduled_for)
    + (EXTRACT(MINUTE FROM p_scheduled_for)::integer / 15) * interval '15 minutes';

  v_acquired := public.begin_scheduled_job('refresh-dashboard-metrics', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  -- ── Key: platform_summary_7d ──────────────────────────────────
  BEGIN
    INSERT INTO public.dashboard_metrics (metric_key, metric_value, computed_at, valid_until)
    SELECT
      'platform_summary_7d',
      jsonb_build_object(
        'bookings_created',   COALESCE(SUM(bookings_created),   0),
        'bookings_confirmed', COALESCE(SUM(bookings_confirmed), 0),
        'gross_revenue_fcfa', COALESCE(SUM(gross_revenue_fcfa), 0),
        'net_revenue_fcfa',   COALESCE(SUM(net_revenue_fcfa),   0),
        'new_users',          COALESCE(SUM(new_users),          0),
        'new_hosts',          COALESCE(SUM(new_hosts),          0)
      ),
      now(),
      now() + interval '20 minutes'
    FROM public.daily_metrics
    WHERE dimension_type = 'platform'::public.app_metric_dimension
      AND metric_date   >= CURRENT_DATE - 7
    ON CONFLICT (metric_key) DO UPDATE SET
      metric_value = EXCLUDED.metric_value,
      computed_at  = EXCLUDED.computed_at,
      valid_until  = EXCLUDED.valid_until;
    v_key_count := v_key_count + 1;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'platform_summary_7d: ' || SQLERRM);
  END;

  -- ── Key: platform_summary_30d ─────────────────────────────────
  BEGIN
    INSERT INTO public.dashboard_metrics (metric_key, metric_value, computed_at, valid_until)
    SELECT
      'platform_summary_30d',
      jsonb_build_object(
        'bookings_created',   COALESCE(SUM(bookings_created),   0),
        'bookings_confirmed', COALESCE(SUM(bookings_confirmed), 0),
        'bookings_cancelled', COALESCE(SUM(bookings_cancelled), 0),
        'gross_revenue_fcfa', COALESCE(SUM(gross_revenue_fcfa), 0),
        'net_revenue_fcfa',   COALESCE(SUM(net_revenue_fcfa),   0),
        'payout_amount_fcfa', COALESCE(SUM(payout_amount_fcfa), 0),
        'new_users',          COALESCE(SUM(new_users),          0),
        'new_hosts',          COALESCE(SUM(new_hosts),          0),
        'reviews_submitted',  COALESCE(SUM(reviews_submitted),  0)
      ),
      now(),
      now() + interval '20 minutes'
    FROM public.daily_metrics
    WHERE dimension_type = 'platform'::public.app_metric_dimension
      AND metric_date   >= CURRENT_DATE - 30
    ON CONFLICT (metric_key) DO UPDATE SET
      metric_value = EXCLUDED.metric_value,
      computed_at  = EXCLUDED.computed_at,
      valid_until  = EXCLUDED.valid_until;
    v_key_count := v_key_count + 1;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'platform_summary_30d: ' || SQLERRM);
  END;

  -- ── Key: kyc_queue_depth ──────────────────────────────────────
  BEGIN
    INSERT INTO public.dashboard_metrics (metric_key, metric_value, computed_at, valid_until)
    SELECT
      'kyc_queue_depth',
      jsonb_build_object(
        'pending',      COUNT(*) FILTER (WHERE status = 'pending'::public.app_kyc_status),
        'under_review', COUNT(*) FILTER (WHERE status = 'under_review'::public.app_kyc_status)
      ),
      now(),
      now() + interval '20 minutes'
    FROM public.host_verifications
    WHERE status IN ('pending'::public.app_kyc_status, 'under_review'::public.app_kyc_status)
    ON CONFLICT (metric_key) DO UPDATE SET
      metric_value = EXCLUDED.metric_value,
      computed_at  = EXCLUDED.computed_at,
      valid_until  = EXCLUDED.valid_until;
    v_key_count := v_key_count + 1;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'kyc_queue_depth: ' || SQLERRM);
  END;

  -- ── Key: moderation_queue_depth ───────────────────────────────
  BEGIN
    INSERT INTO public.dashboard_metrics (metric_key, metric_value, computed_at, valid_until)
    SELECT
      'moderation_queue_depth',
      jsonb_build_object(
        'pending',      COUNT(*) FILTER (WHERE status = 'pending'::public.app_moderation_status),
        'under_review', COUNT(*) FILTER (WHERE status = 'under_review'::public.app_moderation_status),
        'escalated',    COUNT(*) FILTER (WHERE status = 'escalated'::public.app_moderation_status)
      ),
      now(),
      now() + interval '20 minutes'
    FROM public.moderation_queue
    WHERE status IN (
      'pending'::public.app_moderation_status,
      'under_review'::public.app_moderation_status,
      'escalated'::public.app_moderation_status
    )
    ON CONFLICT (metric_key) DO UPDATE SET
      metric_value = EXCLUDED.metric_value,
      computed_at  = EXCLUDED.computed_at,
      valid_until  = EXCLUDED.valid_until;
    v_key_count := v_key_count + 1;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'moderation_queue_depth: ' || SQLERRM);
  END;

  -- ── Key: ticket_queue_by_priority ────────────────────────────
  BEGIN
    INSERT INTO public.dashboard_metrics (metric_key, metric_value, computed_at, valid_until)
    SELECT
      'ticket_queue_by_priority',
      jsonb_build_object(
        'p1',         COUNT(*) FILTER (WHERE priority = 'p1'::public.app_ticket_priority),
        'p2',         COUNT(*) FILTER (WHERE priority = 'p2'::public.app_ticket_priority),
        'p3',         COUNT(*) FILTER (WHERE priority = 'p3'::public.app_ticket_priority),
        'sla_breached', COUNT(*) FILTER (WHERE sla_due_at < now())
      ),
      now(),
      now() + interval '20 minutes'
    FROM public.support_tickets
    WHERE status NOT IN (
      'resolved'::public.app_ticket_status,
      'closed'::public.app_ticket_status
    )
    ON CONFLICT (metric_key) DO UPDATE SET
      metric_value = EXCLUDED.metric_value,
      computed_at  = EXCLUDED.computed_at,
      valid_until  = EXCLUDED.valid_until;
    v_key_count := v_key_count + 1;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'ticket_queue_by_priority: ' || SQLERRM);
  END;

  -- ── Key: pending_payouts ──────────────────────────────────────
  BEGIN
    INSERT INTO public.dashboard_metrics (metric_key, metric_value, computed_at, valid_until)
    SELECT
      'pending_payouts',
      jsonb_build_object(
        'count',       COUNT(*),
        'amount_fcfa', COALESCE(SUM(amount_fcfa), 0)
      ),
      now(),
      now() + interval '20 minutes'
    FROM public.payouts
    WHERE status = 'pending'::public.app_payout_status
    ON CONFLICT (metric_key) DO UPDATE SET
      metric_value = EXCLUDED.metric_value,
      computed_at  = EXCLUDED.computed_at,
      valid_until  = EXCLUDED.valid_until;
    v_key_count := v_key_count + 1;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'pending_payouts: ' || SQLERRM);
  END;

  -- ── Key: top_properties_30d ───────────────────────────────────
  BEGIN
    INSERT INTO public.dashboard_metrics (metric_key, metric_value, computed_at, valid_until)
    SELECT
      'top_properties_30d',
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'property_id',      dimension_id,
            'bookings',         bookings_confirmed,
            'gross_revenue_fcfa', gross_revenue_fcfa
          )
          ORDER BY gross_revenue_fcfa DESC
        ),
        '[]'::jsonb
      ),
      now(),
      now() + interval '20 minutes'
    FROM (
      SELECT dimension_id,
             SUM(bookings_confirmed) AS bookings_confirmed,
             SUM(gross_revenue_fcfa) AS gross_revenue_fcfa
      FROM   public.daily_metrics
      WHERE  dimension_type = 'property'::public.app_metric_dimension
        AND  metric_date   >= CURRENT_DATE - 30
      GROUP  BY dimension_id
      ORDER  BY SUM(gross_revenue_fcfa) DESC
      LIMIT  10
    ) sub
    ON CONFLICT (metric_key) DO UPDATE SET
      metric_value = EXCLUDED.metric_value,
      computed_at  = EXCLUDED.computed_at,
      valid_until  = EXCLUDED.valid_until;
    v_key_count := v_key_count + 1;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'top_properties_30d: ' || SQLERRM);
  END;

  -- ── Key: revenue_trend_90d ────────────────────────────────────
  BEGIN
    INSERT INTO public.dashboard_metrics (metric_key, metric_value, computed_at, valid_until)
    SELECT
      'revenue_trend_90d',
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'date',             metric_date,
            'gross_revenue_fcfa', gross_revenue_fcfa,
            'net_revenue_fcfa',   net_revenue_fcfa
          )
          ORDER BY metric_date
        ),
        '[]'::jsonb
      ),
      now(),
      now() + interval '20 minutes'
    FROM public.daily_metrics
    WHERE dimension_type = 'platform'::public.app_metric_dimension
      AND metric_date   >= CURRENT_DATE - 90
    ON CONFLICT (metric_key) DO UPDATE SET
      metric_value = EXCLUDED.metric_value,
      computed_at  = EXCLUDED.computed_at,
      valid_until  = EXCLUDED.valid_until;
    v_key_count := v_key_count + 1;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'revenue_trend_90d: ' || SQLERRM);
  END;

  v_final_status := CASE
    WHEN array_length(v_errors, 1) > 0 THEN 'partial'::public.app_job_status
    ELSE 'success'::public.app_job_status
  END;

  PERFORM public.finish_scheduled_job(
    'refresh-dashboard-metrics', v_nominal_tick,
    v_final_status, v_key_count,
    CASE WHEN array_length(v_errors, 1) > 0
         THEN array_to_string(v_errors, ' | ')
         ELSE NULL
    END
  );

  RETURN v_key_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dashboard_metrics(timestamptz)
  TO service_role;


-- ============================================================
-- 11. JOB: expire_approved_kyc
-- ============================================================
-- Sets status = 'expired' on host_verifications whose expires_at
-- has passed.  validate_kyc_transition() trigger fires on each row,
-- enforcing the state machine.  Also mirrors the status onto
-- profiles.kyc_status.

CREATE OR REPLACE FUNCTION public.expire_approved_kyc(
  p_tick timestamptz
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_nominal_tick timestamptz;
  v_acquired     boolean;
  v_count        integer;
BEGIN
  v_nominal_tick := date_trunc('day', p_tick);

  v_acquired := public.begin_scheduled_job('kyc-expiry', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  BEGIN
    -- Transition approved → expired; trigger validates and sets reviewed_at.
    -- Only rows where expires_at <= now() qualify.
    WITH expired AS (
      UPDATE public.host_verifications
      SET    status = 'expired'::public.app_kyc_status
      WHERE  status     = 'approved'::public.app_kyc_status
        AND  expires_at <= p_tick
      RETURNING host_id
    )
    UPDATE public.profiles p
    SET    kyc_status  = 'expired'::public.app_kyc_status,
           updated_at  = now()
    FROM   expired e
    WHERE  p.id = e.host_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    PERFORM public.finish_scheduled_job(
      'kyc-expiry', v_nominal_tick,
      'success'::public.app_job_status, v_count
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'kyc-expiry', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_approved_kyc(timestamptz)
  TO service_role;


-- ============================================================
-- 12. JOB: purge_expired_kyc_documents
-- ============================================================
-- Two-phase retention cleanup for host_verifications:
--
-- Phase 1 (Storage purge):  rows WHERE reviewed_at < now() - 24 months
--   AND document_path IS NOT NULL → set document_number_enc = NULL,
--   document_path = NULL.  Actual Storage object deletion is triggered
--   by the application layer; this marks the row for deletion and
--   removes the reference so the application knows to clean up.
--
-- Phase 2 (Row purge): rows WHERE reviewed_at < now() - 36 months
--   AND document_path IS NULL → hard-delete the row.
--
-- Both phases are logged to audit_logs via log_audit_event().

CREATE OR REPLACE FUNCTION public.purge_expired_kyc_documents(
  p_tick timestamptz
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_nominal_tick timestamptz;
  v_acquired     boolean;
  v_purged_docs  integer := 0;
  v_purged_rows  integer := 0;
BEGIN
  v_nominal_tick := date_trunc('day', p_tick);

  v_acquired := public.begin_scheduled_job('kyc-document-cleanup', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('kyc-document-cleanup')::bigint) THEN
    PERFORM public.finish_scheduled_job(
      'kyc-document-cleanup', v_nominal_tick,
      'skipped'::public.app_job_status, 0,
      'advisory lock held by concurrent session'
    );
    RETURN 0;
  END IF;

  BEGIN
    -- Phase 1: null sensitive fields; marks row for Storage deletion
    WITH purged AS (
      UPDATE public.host_verifications
      SET    document_number_enc = NULL,
             document_path       = NULL,
             updated_at          = now()
      WHERE  reviewed_at < p_tick - interval '24 months'
        AND  document_path IS NOT NULL
      RETURNING id, host_id
    )
    SELECT COUNT(*) INTO v_purged_docs FROM purged;

    IF v_purged_docs > 0 THEN
      PERFORM public.log_audit_event(
        NULL, 'system',
        'kyc_document_purged'::public.app_audit_action,
        'host_verifications', NULL,
        NULL, NULL, NULL, NULL,
        jsonb_build_object('count', v_purged_docs, 'job_tick', p_tick)
      );
    END IF;

    -- Phase 2: hard-delete rows past the 36-month row retention window
    -- (document_path must already be NULL from Phase 1 or a prior run)
    WITH deleted AS (
      DELETE FROM public.host_verifications
      WHERE  reviewed_at < p_tick - interval '36 months'
        AND  document_path IS NULL
      RETURNING id
    )
    SELECT COUNT(*) INTO v_purged_rows FROM deleted;

    IF v_purged_rows > 0 THEN
      PERFORM public.log_audit_event(
        NULL, 'system',
        'kyc_record_purged'::public.app_audit_action,
        'host_verifications', NULL,
        NULL, NULL, NULL, NULL,
        jsonb_build_object('count', v_purged_rows, 'job_tick', p_tick)
      );
    END IF;

    PERFORM public.finish_scheduled_job(
      'kyc-document-cleanup', v_nominal_tick,
      'success'::public.app_job_status,
      v_purged_docs + v_purged_rows,
      NULL,
      jsonb_build_object(
        'docs_nulled', v_purged_docs,
        'rows_deleted', v_purged_rows
      )
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'kyc-document-cleanup', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;

  RETURN v_purged_docs + v_purged_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_expired_kyc_documents(timestamptz)
  TO service_role;


-- ============================================================
-- 13. JOB: cleanup_old_tickets
-- ============================================================
-- Hard-deletes support_tickets WHERE resolved_at < now() - 36 months.
-- ON DELETE CASCADE propagates to ticket_messages and ticket_attachments.

CREATE OR REPLACE FUNCTION public.cleanup_old_tickets(
  p_tick timestamptz
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_nominal_tick timestamptz;
  v_acquired     boolean;
  v_count        integer;
BEGIN
  v_nominal_tick := date_trunc('month', p_tick);

  v_acquired := public.begin_scheduled_job('ticket-retention', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  BEGIN
    DELETE FROM public.support_tickets
    WHERE resolved_at < p_tick - interval '36 months';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Also hard-delete abandoned open tickets (never resolved) older than 36 months.
    DELETE FROM public.support_tickets
    WHERE resolved_at IS NULL
      AND created_at < p_tick - interval '36 months';

    PERFORM public.finish_scheduled_job(
      'ticket-retention', v_nominal_tick,
      'success'::public.app_job_status, v_count
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'ticket-retention', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_tickets(timestamptz)
  TO service_role;


-- ============================================================
-- 14. JOB: cleanup_old_notifications
-- ============================================================
-- Two-step notification retirement:
--   Step 1: Soft-expire (mark is_read = true) unread notifications
--           older than 90 days so users see them once before deletion.
--   Step 2: Hard-delete ALL notifications older than 180 days.

CREATE OR REPLACE FUNCTION public.cleanup_old_notifications(
  p_tick timestamptz
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_nominal_tick timestamptz;
  v_acquired     boolean;
  v_soft         integer;
  v_hard         integer;
BEGIN
  v_nominal_tick := date_trunc('week', p_tick);

  v_acquired := public.begin_scheduled_job('notification-cleanup', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  BEGIN
    -- Step 1: soft-expire stale unread notifications
    UPDATE public.notifications
    SET    is_read  = true,
           read_at  = now()
    WHERE  is_read   = false
      AND  created_at < p_tick - interval '90 days';

    GET DIAGNOSTICS v_soft = ROW_COUNT;

    -- Step 2: hard-delete all notifications past 180-day window
    DELETE FROM public.notifications
    WHERE created_at < p_tick - interval '180 days';

    GET DIAGNOSTICS v_hard = ROW_COUNT;

    PERFORM public.finish_scheduled_job(
      'notification-cleanup', v_nominal_tick,
      'success'::public.app_job_status,
      v_soft + v_hard,
      NULL,
      jsonb_build_object('soft_expired', v_soft, 'hard_deleted', v_hard)
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'notification-cleanup', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;

  RETURN v_soft + v_hard;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_notifications(timestamptz)
  TO service_role;


-- ============================================================
-- 15. JOB: retry_pending_notifications
-- ============================================================
-- Increments delivery_attempts on notifications that need retry and
-- calls the Supabase Edge Function for dispatch when app.supabase_url
-- is configured.  If not configured, marks rows for application-layer
-- pickup (delivery_attempts > 0 with NULL delivered_*_at is the signal).
--
-- Runs every 10 minutes.  Max attempts: 5 (enforced by WHERE clause).

CREATE OR REPLACE FUNCTION public.retry_pending_notifications(
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
  v_count         integer;
  v_supabase_url  text;
  v_service_key   text;
BEGIN
  -- Nominal tick: nearest 10-minute boundary
  v_nominal_tick := date_trunc('hour', p_tick)
    + (EXTRACT(MINUTE FROM p_tick)::integer / 10) * interval '10 minutes';

  v_acquired := public.begin_scheduled_job('retry-notifications', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  BEGIN
    -- Mark notifications as needing retry by incrementing attempt counter.
    -- Only notifications older than 10 minutes with < 5 prior attempts.
    UPDATE public.notifications
    SET    delivery_attempts = delivery_attempts + 1
    WHERE (
      (channel_email = true AND delivered_email_at IS NULL)
      OR (channel_sms  = true AND delivered_sms_at  IS NULL)
    )
      AND delivery_attempts < 5
      AND created_at < p_tick - interval '10 minutes';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Attempt Edge Function dispatch if project URL is configured.
    -- app.supabase_url is set post-deployment via:
    --   ALTER DATABASE postgres SET app.supabase_url = 'https://xxx.supabase.co';
    v_supabase_url := current_setting('app.supabase_url', true);
    v_service_key  := current_setting('app.service_role_key', true);

    IF v_supabase_url IS NOT NULL
       AND v_supabase_url != ''
       AND v_service_key IS NOT NULL
       AND v_count > 0
    THEN
      PERFORM net.http_post(
        url     := v_supabase_url || '/functions/v1/retry-notifications',
        body    := jsonb_build_object('triggered_by', 'pg_cron', 'tick', p_tick)::text,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_service_key,
          'Content-Type',  'application/json'
        )
      );
    END IF;

    PERFORM public.finish_scheduled_job(
      'retry-notifications', v_nominal_tick,
      'success'::public.app_job_status, v_count
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'retry-notifications', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_pending_notifications(timestamptz)
  TO service_role;


-- ============================================================
-- 16. JOB: drop_expired_analytics_partitions
-- ============================================================
-- Drops analytics_events partitions older than 12 months.
-- Pre-drop check: verifies daily_metrics has a platform row for that
-- month (rollup confirmed) before dropping.  Skips with status='skipped'
-- if rollup is not confirmed — data is retained rather than silently lost.

CREATE OR REPLACE FUNCTION public.drop_expired_analytics_partitions(
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
  v_cutoff        date;
  v_dropped       integer := 0;
  v_skipped       integer := 0;
  r               record;
  v_partition_start date;
  v_partition_end   date;
  v_rollup_count  integer;
BEGIN
  v_nominal_tick := date_trunc('month', p_tick);

  v_acquired := public.begin_scheduled_job('analytics-retention', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  -- Retention: 12 months; cutoff is the start of the month 12 months ago.
  v_cutoff := date_trunc('month', p_tick - interval '12 months')::date;

  BEGIN
    FOR r IN
      SELECT table_name
      FROM   information_schema.tables
      WHERE  table_schema = 'public'
        AND  table_name   LIKE 'analytics\_events\_%'  -- LIKE escape
        AND  table_type   = 'BASE TABLE'
      ORDER  BY table_name
    LOOP
      -- Parse partition bounds from table name: analytics_events_YYYY_MM
      BEGIN
        v_partition_start := to_date(
          substring(r.table_name FROM 'analytics_events_(\d{4}_\d{2})'),
          'YYYY_MM'
        );
        v_partition_end := v_partition_start + interval '1 month';
      EXCEPTION WHEN OTHERS THEN
        CONTINUE;  -- skip tables that don't match the naming convention
      END;

      -- Only drop partitions entirely before the cutoff
      IF v_partition_end > v_cutoff THEN
        CONTINUE;
      END IF;

      -- Pre-drop check: verify rollup was materialized for this month
      SELECT COUNT(*) INTO v_rollup_count
      FROM   public.daily_metrics
      WHERE  metric_date   >= v_partition_start
        AND  metric_date    < v_partition_end
        AND  dimension_type = 'platform'::public.app_metric_dimension;

      IF v_rollup_count = 0 THEN
        v_skipped := v_skipped + 1;
        PERFORM public.log_audit_event(
          NULL, 'system',
          'moderation_queued'::public.app_audit_action,  -- closest available; not ideal
          'analytics_events', NULL,
          NULL, NULL, NULL, NULL,
          jsonb_build_object(
            'partition', r.table_name,
            'reason', 'rollup_not_confirmed — partition retained'
          )
        );
        CONTINUE;
      END IF;

      EXECUTE format('DROP TABLE IF EXISTS public.%I', r.table_name);
      v_dropped := v_dropped + 1;
    END LOOP;

    PERFORM public.finish_scheduled_job(
      'analytics-retention', v_nominal_tick,
      'success'::public.app_job_status,
      v_dropped,
      NULL,
      jsonb_build_object('dropped', v_dropped, 'skipped_no_rollup', v_skipped)
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'analytics-retention', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;

  RETURN v_dropped;
END;
$$;

GRANT EXECUTE ON FUNCTION public.drop_expired_analytics_partitions(timestamptz)
  TO service_role;


-- ============================================================
-- 17. JOB: cleanup_old_daily_metrics
-- ============================================================
-- Row-level deletion of daily_metrics older than 24 months.

CREATE OR REPLACE FUNCTION public.cleanup_old_daily_metrics(
  p_tick timestamptz
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_nominal_tick timestamptz;
  v_acquired     boolean;
  v_count        integer;
BEGIN
  v_nominal_tick := date_trunc('month', p_tick);

  v_acquired := public.begin_scheduled_job('daily-metrics-retention', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  BEGIN
    DELETE FROM public.daily_metrics
    WHERE metric_date < (p_tick - interval '24 months')::date;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    PERFORM public.finish_scheduled_job(
      'daily-metrics-retention', v_nominal_tick,
      'success'::public.app_job_status, v_count
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'daily-metrics-retention', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_daily_metrics(timestamptz)
  TO service_role;


-- ============================================================
-- 18. JOB: cleanup_scheduled_jobs
-- ============================================================
-- Deletes scheduled_jobs rows older than 90 days.

CREATE OR REPLACE FUNCTION public.cleanup_scheduled_jobs(
  p_tick timestamptz
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_nominal_tick timestamptz;
  v_acquired     boolean;
  v_count        integer;
BEGIN
  v_nominal_tick := date_trunc('week', p_tick);

  v_acquired := public.begin_scheduled_job('scheduled-jobs-cleanup', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  BEGIN
    DELETE FROM public.scheduled_jobs
    WHERE created_at < p_tick - interval '90 days';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- finish_scheduled_job will also match this row by job_name + scheduled_for
    -- before it ages out — which is fine since we only delete rows older than 90 days.
    PERFORM public.finish_scheduled_job(
      'scheduled-jobs-cleanup', v_nominal_tick,
      'success'::public.app_job_status, v_count
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'scheduled-jobs-cleanup', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_scheduled_jobs(timestamptz)
  TO service_role;


-- ============================================================
-- 19. JOB: partition_maintenance
-- ============================================================
-- Creates both audit_logs and analytics_events partitions for
-- month + 2 from the current date.  Runs on the 25th of each month.
-- Uses create_audit_partition() (Migration 0008) and
-- create_analytics_partition() (this migration).

CREATE OR REPLACE FUNCTION public.run_partition_maintenance(
  p_tick timestamptz
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_nominal_tick timestamptz;
  v_acquired     boolean;
  v_target       timestamptz;
  v_year         integer;
  v_month        integer;
BEGIN
  v_nominal_tick := date_trunc('month', p_tick);

  v_acquired := public.begin_scheduled_job('create-partitions', v_nominal_tick);
  IF NOT v_acquired THEN RETURN; END IF;

  BEGIN
    -- Target: 2 months ahead
    v_target := p_tick + interval '2 months';
    v_year   := EXTRACT(YEAR  FROM v_target)::integer;
    v_month  := EXTRACT(MONTH FROM v_target)::integer;

    PERFORM public.create_audit_partition(v_year, v_month);
    PERFORM public.create_analytics_partition(v_year, v_month);

    PERFORM public.finish_scheduled_job(
      'create-partitions', v_nominal_tick,
      'success'::public.app_job_status, 2,
      NULL,
      jsonb_build_object(
        'year', v_year, 'month', v_month,
        'partitions', ARRAY['audit_logs', 'analytics_events']
      )
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'create-partitions', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_partition_maintenance(timestamptz)
  TO service_role;


-- ============================================================
-- 20. pg_cron JOB REGISTRATIONS
-- ============================================================
-- All cron.unschedule calls run first so this block is safely
-- re-runnable (re-applying the migration updates the schedule
-- without leaving duplicate job entries).
--
-- IMPORTANT: pg_cron must be enabled before applying this migration:
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- Post-deployment: configure optional settings for Edge Function dispatch:
--   ALTER DATABASE postgres SET app.supabase_url = 'https://xxx.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key = 'eyJ...';

-- Remove any existing jobs (idempotent unschedule)
SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname IN (
  'expire-pending-bookings',
  'retry-notifications',
  'refresh-dashboard-metrics',
  'stuck-job-watchdog',
  'kyc-expiry',
  'analytics-rollup',
  'kyc-document-cleanup',
  'retry-failed-payouts',
  'process-payout-batch',
  'notification-cleanup',
  'scheduled-jobs-cleanup',
  'audit-log-retention',
  'analytics-retention',
  'ticket-retention',
  'create-partitions',
  'daily-metrics-retention'
);

-- ── Every 15 minutes ─────────────────────────────────────────

-- Expires pending bookings past their hold window (24 h).
-- Calls claim_availability() release path for each expired booking.
SELECT cron.schedule(
  'expire-pending-bookings',
  '*/15 * * * *',
  $$SELECT public.expire_pending_bookings(now())$$
);

-- Refreshes all dashboard_metrics keys from daily_metrics and live tables.
SELECT cron.schedule(
  'refresh-dashboard-metrics',
  '*/15 * * * *',
  $$SELECT public.refresh_dashboard_metrics(now())$$
);

-- ── Every 10 minutes ─────────────────────────────────────────

-- Marks undelivered notifications for retry; triggers Edge Function dispatch
-- when app.supabase_url is configured.
SELECT cron.schedule(
  'retry-notifications',
  '*/10 * * * *',
  $$SELECT public.retry_pending_notifications(now())$$
);

-- ── Every 30 minutes ─────────────────────────────────────────

-- Finds scheduled_jobs rows stuck in 'running' for > 1 hour and marks failed.
SELECT cron.schedule(
  'stuck-job-watchdog',
  '*/30 * * * *',
  $$SELECT public.detect_stuck_jobs(now())$$
);

-- ── Daily ─────────────────────────────────────────────────────

-- 01:00 UTC — Marks approved KYC records as expired when expires_at passes.
SELECT cron.schedule(
  'kyc-expiry',
  '0 1 * * *',
  $$SELECT public.expire_approved_kyc(now())$$
);

-- 02:00 UTC — Nightly three-pass rollup for yesterday's metrics.
--             Also calls refresh_dashboard_metrics() at end of run.
SELECT cron.schedule(
  'analytics-rollup',
  '0 2 * * *',
  $$SELECT public.run_analytics_rollup(CURRENT_DATE - 1, now())$$
);

-- 02:30 UTC — Nulls document fields past 24-month storage retention;
--             hard-deletes rows past 36-month row retention.
SELECT cron.schedule(
  'kyc-document-cleanup',
  '30 2 * * *',
  $$SELECT public.purge_expired_kyc_documents(now())$$
);

-- 03:00 UTC — Retries failed payouts (max 3 attempts per Revenue doc §2.4).
SELECT cron.schedule(
  'retry-failed-payouts',
  '0 3 * * *',
  $$SELECT public.retry_failed_payout(CURRENT_DATE)$$
);

-- 06:00 UTC — Daily payout batch disbursement to hosts.
SELECT cron.schedule(
  'process-payout-batch',
  '0 6 * * *',
  $$SELECT public.process_payout_batch(CURRENT_DATE)$$
);

-- ── Weekly ────────────────────────────────────────────────────

-- Sunday 03:00 UTC — Soft-expires unread notifications > 90 days;
--                    hard-deletes all notifications > 180 days.
SELECT cron.schedule(
  'notification-cleanup',
  '0 3 * * 0',
  $$SELECT public.cleanup_old_notifications(now())$$
);

-- Sunday 04:00 UTC — Deletes scheduled_jobs rows older than 90 days.
SELECT cron.schedule(
  'scheduled-jobs-cleanup',
  '0 4 * * 0',
  $$SELECT public.cleanup_scheduled_jobs(now())$$
);

-- ── Monthly (1st of month) ────────────────────────────────────

-- 03:00 UTC — Drops audit_logs partitions older than 24 months.
--             (create_audit_partition defined in Migration 0008)
SELECT cron.schedule(
  'audit-log-retention',
  '0 3 1 * *',
  $$SELECT public.drop_expired_audit_partitions(now())$$
);

-- 03:30 UTC — Drops analytics_events partitions older than 12 months.
--             Pre-drop check verifies daily_metrics rollup was confirmed.
SELECT cron.schedule(
  'analytics-retention',
  '30 3 1 * *',
  $$SELECT public.drop_expired_analytics_partitions(now())$$
);

-- 04:00 UTC — Hard-deletes support_tickets older than 36 months from resolved_at.
--             ON DELETE CASCADE removes ticket_messages and ticket_attachments.
SELECT cron.schedule(
  'ticket-retention',
  '0 4 1 * *',
  $$SELECT public.cleanup_old_tickets(now())$$
);

-- 05:00 UTC — Row-level deletion of daily_metrics older than 24 months.
SELECT cron.schedule(
  'daily-metrics-retention',
  '0 5 1 * *',
  $$SELECT public.cleanup_old_daily_metrics(now())$$
);

-- ── Monthly (25th of month) ───────────────────────────────────

-- 01:00 UTC — Creates audit_logs and analytics_events partitions for month+2.
--             Running on the 25th with +2 lookahead provides 34–37 days
--             of buffer before the partition is needed.
SELECT cron.schedule(
  'create-partitions',
  '0 1 25 * *',
  $$SELECT public.run_partition_maintenance(now())$$
);


-- =============================================================================
-- DOWN MIGRATION
-- =============================================================================
/*
  To roll back (execute in reverse dependency order):

  -- 1. Remove all pg_cron registrations
  SELECT cron.unschedule(jobid) FROM cron.job
  WHERE jobname IN (
    'expire-pending-bookings', 'retry-notifications', 'refresh-dashboard-metrics',
    'stuck-job-watchdog', 'kyc-expiry', 'analytics-rollup', 'kyc-document-cleanup',
    'retry-failed-payouts', 'process-payout-batch', 'notification-cleanup',
    'scheduled-jobs-cleanup', 'audit-log-retention', 'analytics-retention',
    'ticket-retention', 'create-partitions', 'daily-metrics-retention'
  );

  -- 2. Drop job functions
  DROP FUNCTION IF EXISTS public.run_partition_maintenance(timestamptz);
  DROP FUNCTION IF EXISTS public.cleanup_scheduled_jobs(timestamptz);
  DROP FUNCTION IF EXISTS public.cleanup_old_daily_metrics(timestamptz);
  DROP FUNCTION IF EXISTS public.drop_expired_analytics_partitions(timestamptz);
  DROP FUNCTION IF EXISTS public.cleanup_old_notifications(timestamptz);
  DROP FUNCTION IF EXISTS public.cleanup_old_tickets(timestamptz);
  DROP FUNCTION IF EXISTS public.purge_expired_kyc_documents(timestamptz);
  DROP FUNCTION IF EXISTS public.expire_approved_kyc(timestamptz);
  DROP FUNCTION IF EXISTS public.retry_pending_notifications(timestamptz);
  DROP FUNCTION IF EXISTS public.detect_stuck_jobs(timestamptz);
  DROP FUNCTION IF EXISTS public.refresh_dashboard_metrics(timestamptz);
  DROP FUNCTION IF EXISTS public.run_analytics_rollup(date, timestamptz);
  DROP FUNCTION IF EXISTS public.create_analytics_partition(integer, integer);
  DROP FUNCTION IF EXISTS public.finish_scheduled_job(text, timestamptz, public.app_job_status, integer, text, jsonb);
  DROP FUNCTION IF EXISTS public.begin_scheduled_job(text, timestamptz);

  -- 3. Drop tables (analytics_events DROP cascades to all partitions)
  DROP TABLE IF EXISTS public.dashboard_metrics;
  DROP TABLE IF EXISTS public.daily_metrics;
  DROP TABLE IF EXISTS public.analytics_events;   -- drops all partitions
  DROP TABLE IF EXISTS public.scheduled_jobs;

  -- 4. Drop enums
  DROP TYPE IF EXISTS public.app_job_status;
  DROP TYPE IF EXISTS public.app_metric_dimension;
  DROP TYPE IF EXISTS public.app_analytics_event_type;
*/
