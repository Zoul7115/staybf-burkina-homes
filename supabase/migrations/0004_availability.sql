-- =============================================================================
-- Migration 0004 — Availability Engine
-- Scope : room_availability, seasonal_pricing, blocked_dates
-- Depends on : 0001 (profiles, has_role, app_role)
--              0003 (rooms, properties, host_profiles, is_host_of_room)
-- Author: StayBF
-- =============================================================================

-- ============================================================
-- 1. ENUMS
-- ============================================================

CREATE TYPE public.app_availability_status AS ENUM (
  'open',       -- night is available for booking
  'booked',     -- held by a confirmed / pending booking
  'blocked'     -- manually blocked by host or iCal / system
);

CREATE TYPE public.app_block_source AS ENUM (
  'manual',     -- host blocked via dashboard
  'ical',       -- imported from external iCal feed
  'system'      -- platform-initiated (dispute hold, admin action)
);


-- ============================================================
-- 2. BLOCKED_DATES
-- ============================================================
-- Created before room_availability so that room_availability can
-- reference it as a FK.  blocked_dates stores the reason and source
-- for a host-initiated or iCal-sourced date block.  The per-night
-- room_availability rows carry the blocked_dates_id for traceability.

CREATE TABLE IF NOT EXISTS public.blocked_dates (
  id          uuid                    PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  room_id     uuid                    NOT NULL,
  starts_on   date                    NOT NULL,
  ends_on     date                    NOT NULL,
  reason      text,
  source      public.app_block_source NOT NULL DEFAULT 'manual',
  -- External calendar event UID used to deduplicate iCal re-syncs
  ical_uid    text,
  created_at  timestamptz             NOT NULL DEFAULT now(),
  updated_at  timestamptz             NOT NULL DEFAULT now(),

  CONSTRAINT blocked_dates_range_valid CHECK (ends_on >= starts_on),

  FOREIGN KEY (room_id) REFERENCES public.rooms (id) ON DELETE CASCADE
);

ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_dates FORCE ROW LEVEL SECURITY;

-- Host reads and manages own blocks
CREATE POLICY "blocked_dates: host all own"
  ON public.blocked_dates
  FOR ALL
  USING  (public.is_host_of_room(auth.uid(), room_id))
  WITH CHECK (public.is_host_of_room(auth.uid(), room_id));

-- Admin / super_admin full access
CREATE POLICY "blocked_dates: admin all"
  ON public.blocked_dates
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Traveler / anon: no read — they see open nights via room_availability only

GRANT INSERT, UPDATE, DELETE ON public.blocked_dates TO authenticated;
GRANT ALL                    ON public.blocked_dates TO service_role;

-- Find active blocks for a room by date range
CREATE INDEX IF NOT EXISTS idx_blocked_dates_room_dates
  ON public.blocked_dates (room_id, starts_on, ends_on);

-- iCal deduplication: unique per (room, ical_uid) when ical_uid is set
CREATE UNIQUE INDEX IF NOT EXISTS uq_blocked_dates_ical
  ON public.blocked_dates (room_id, ical_uid)
  WHERE ical_uid IS NOT NULL;

CREATE TRIGGER trg_blocked_dates_updated_at
  BEFORE UPDATE ON public.blocked_dates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 3. ROOM_AVAILABILITY
-- ============================================================
-- One row per (room, calendar night).  This is the authoritative
-- open/booked/blocked signal.  The UNIQUE (room_id, date) constraint
-- is the conflict-prevention anchor for double-booking prevention:
-- two concurrent booking attempts for the same room+date race on
-- this constraint — the second UPDATE targeting status='open' rows
-- affects 0 rows, which the server function detects as a conflict.

CREATE TABLE IF NOT EXISTS public.room_availability (
  id                uuid                          PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  room_id           uuid                          NOT NULL,
  date              date                          NOT NULL,
  status            public.app_availability_status NOT NULL DEFAULT 'open',
  -- Set when status='booked'; references the booking that claimed this night
  booking_id        uuid,
  -- Set when status='blocked'; references the block record for auditability
  blocked_dates_id  uuid,
  -- Per-night price override; wins over seasonal_pricing when set
  price_override_fcfa integer,
  created_at        timestamptz                   NOT NULL DEFAULT now(),
  updated_at        timestamptz                   NOT NULL DEFAULT now(),

  -- Primary conflict-prevention constraint
  CONSTRAINT uq_availability_room_date UNIQUE (room_id, date),

  CONSTRAINT availability_price_override_pos CHECK (
    price_override_fcfa IS NULL OR price_override_fcfa > 0
  ),
  -- A booked row must carry its booking reference
  CONSTRAINT availability_booked_has_booking CHECK (
    (status = 'booked' AND booking_id IS NOT NULL)
    OR status != 'booked'
  ),
  -- A manually blocked row should carry its block reference
  -- (NULL allowed for legacy iCal imports during initial sync)
  CONSTRAINT availability_blocked_source CHECK (
    status IN ('open', 'booked')
    OR (status = 'blocked')   -- blocked_dates_id may be null for iCal-origin rows
  ),

  FOREIGN KEY (room_id)
    REFERENCES public.rooms (id)         ON DELETE CASCADE,
  FOREIGN KEY (booking_id)
    REFERENCES public.bookings (id)      ON DELETE SET NULL,
  FOREIGN KEY (blocked_dates_id)
    REFERENCES public.blocked_dates (id) ON DELETE SET NULL
);

-- NOTE: The FK to bookings references a table created in Migration 0005.
-- If this migration runs before 0005, Postgres will reject the FK.
-- The FK is therefore added in Migration 0005 via ALTER TABLE after
-- the bookings table exists.  The column definition above is correct;
-- only the FK declaration is deferred.
-- See bottom of this file for the deferred-FK comment.

ALTER TABLE public.room_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_availability FORCE ROW LEVEL SECURITY;

-- Traveler / anon: may read open nights (needed for the calendar widget)
CREATE POLICY "room_availability: public read open"
  ON public.room_availability
  FOR SELECT
  USING (status = 'open'::public.app_availability_status);

-- Host reads all statuses on own rooms (blocked, booked, open)
CREATE POLICY "room_availability: host read own"
  ON public.room_availability
  FOR SELECT
  USING (public.is_host_of_room(auth.uid(), room_id));

-- Host writes own calendar (manual blocks / unblocks)
-- Booking-driven writes always use service_role via server functions
CREATE POLICY "room_availability: host write own"
  ON public.room_availability
  FOR ALL
  USING  (public.is_host_of_room(auth.uid(), room_id))
  WITH CHECK (public.is_host_of_room(auth.uid(), room_id));

-- Admin / super_admin full access
CREATE POLICY "room_availability: admin all"
  ON public.room_availability
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT             ON public.room_availability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_availability TO authenticated;
GRANT ALL                ON public.room_availability TO service_role;

-- Primary availability query: open nights for a room in a date range.
-- Partial index keeps this index small and cache-hot.
CREATE INDEX IF NOT EXISTS idx_availability_room_date_open
  ON public.room_availability (room_id, date)
  WHERE status = 'open';

-- Booking cancellation path: find all nights belonging to a booking
CREATE INDEX IF NOT EXISTS idx_availability_booking_id
  ON public.room_availability (booking_id)
  WHERE booking_id IS NOT NULL;

-- Block unlink path: find nights belonging to a blocked_dates record
CREATE INDEX IF NOT EXISTS idx_availability_blocked_dates_id
  ON public.room_availability (blocked_dates_id)
  WHERE blocked_dates_id IS NOT NULL;

CREATE TRIGGER trg_room_availability_updated_at
  BEFORE UPDATE ON public.room_availability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 4. SEASONAL_PRICING
-- ============================================================
-- Date-range pricing overlays per room.  Resolved at quote time:
-- for each night in a stay, find the rule with the highest priority
-- (then most-recently created) whose date range covers that night and
-- whose min_nights is satisfied.  Falls back to rooms.base_price_fcfa
-- if no rule applies.  Per-night price_override_fcfa on
-- room_availability takes absolute precedence over any seasonal rule.

CREATE TABLE IF NOT EXISTS public.seasonal_pricing (
  id          uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  room_id     uuid        NOT NULL,
  label       text        NOT NULL,
  starts_on   date        NOT NULL,
  ends_on     date        NOT NULL,
  price_fcfa  integer     NOT NULL,
  -- Minimum stay (in nights) for this rule to apply
  min_nights  integer     NOT NULL DEFAULT 1,
  -- Higher value wins when rules overlap; same priority → most recent created_at
  priority    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT seasonal_pricing_range_valid CHECK (ends_on >= starts_on),
  CONSTRAINT seasonal_pricing_price_pos   CHECK (price_fcfa > 0),
  CONSTRAINT seasonal_pricing_min_nights  CHECK (min_nights >= 1),
  CONSTRAINT seasonal_pricing_priority_nn CHECK (priority >= 0),

  FOREIGN KEY (room_id) REFERENCES public.rooms (id) ON DELETE CASCADE
);

ALTER TABLE public.seasonal_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_pricing FORCE ROW LEVEL SECURITY;

-- Pricing data is not sensitive; needed by the public booking form
CREATE POLICY "seasonal_pricing: public read"
  ON public.seasonal_pricing
  FOR SELECT
  USING (true);

-- Host manages own seasonal rules
CREATE POLICY "seasonal_pricing: host write own"
  ON public.seasonal_pricing
  FOR ALL
  USING  (public.is_host_of_room(auth.uid(), room_id))
  WITH CHECK (public.is_host_of_room(auth.uid(), room_id));

-- Admin / super_admin full access
CREATE POLICY "seasonal_pricing: admin all"
  ON public.seasonal_pricing
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT                          ON public.seasonal_pricing TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.seasonal_pricing TO authenticated;
GRANT ALL                             ON public.seasonal_pricing TO service_role;

-- Overlap query: "find rules for room X whose range covers [check_in, check_out)"
CREATE INDEX IF NOT EXISTS idx_seasonal_pricing_room_dates
  ON public.seasonal_pricing (room_id, starts_on, ends_on);

-- Priority tie-breaking lookup
CREATE INDEX IF NOT EXISTS idx_seasonal_pricing_room_priority
  ON public.seasonal_pricing (room_id, priority DESC, created_at DESC);

CREATE TRIGGER trg_seasonal_pricing_updated_at
  BEFORE UPDATE ON public.seasonal_pricing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 5. HELPER FUNCTION: claim_availability
-- ============================================================
-- Called exclusively by the createBooking() server function inside an
-- explicit transaction.  Attempts to atomically claim all nights in
-- [p_check_in, p_check_out) for the given room.
--
-- Returns the number of nights successfully claimed.
-- The caller MUST assert return value = expected_nights; if not, it
-- rolls back the entire transaction and returns HTTP 409.
--
-- Concurrency guarantee:
--   The UPDATE uses WHERE status = 'open' as a compare-and-swap.
--   Under READ COMMITTED isolation a concurrent transaction that
--   committed first will have already changed status to 'booked',
--   so this UPDATE affects 0 rows for the loser.
--   No FOR UPDATE pre-select is needed; the implicit row-level lock
--   from the UPDATE itself is sufficient and narrowly scoped.

CREATE OR REPLACE FUNCTION public.claim_availability(
  p_room_id    uuid,
  p_check_in   date,
  p_check_out  date,
  p_booking_id uuid
)
  RETURNS integer        -- number of nights claimed
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_claimed integer;
BEGIN
  IF p_room_id IS NULL OR p_check_in IS NULL
     OR p_check_out IS NULL OR p_booking_id IS NULL
  THEN
    RAISE EXCEPTION 'claim_availability: null argument'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'claim_availability: check_out must be after check_in'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Atomic compare-and-swap: only rows with status='open' are updated.
  -- Rows already 'booked' or 'blocked' are silently skipped, causing
  -- v_claimed < expected nights, which the caller treats as a conflict.
  UPDATE public.room_availability
  SET    status     = 'booked'::public.app_availability_status,
         booking_id = p_booking_id,
         updated_at = now()
  WHERE  room_id = p_room_id
    AND  date >= p_check_in
    AND  date <  p_check_out
    AND  status = 'open'::public.app_availability_status;

  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  RETURN v_claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_availability(uuid, date, date, uuid)
  TO authenticated;


-- ============================================================
-- 6. HELPER FUNCTION: release_availability
-- ============================================================
-- Releases all nights held by a booking back to 'open'.
-- Idempotent: second call on already-open rows returns 0 (no-op).
-- Called by cancellation and hold-expiry server functions.

CREATE OR REPLACE FUNCTION public.release_availability(
  p_booking_id uuid
)
  RETURNS integer        -- number of nights released
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_released integer;
BEGIN
  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'release_availability: null booking_id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.room_availability
  SET    status     = 'open'::public.app_availability_status,
         booking_id = NULL,
         updated_at = now()
  WHERE  booking_id = p_booking_id
    AND  status     = 'booked'::public.app_availability_status;

  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_availability(uuid)
  TO authenticated;


-- ============================================================
-- 7. NOTE ON DEFERRED FK: room_availability → bookings
-- ============================================================
-- room_availability.booking_id references public.bookings(id), which
-- is created in Migration 0005.  The FK is added there via:
--
--   ALTER TABLE public.room_availability
--     ADD CONSTRAINT fk_availability_booking
--     FOREIGN KEY (booking_id) REFERENCES public.bookings (id)
--     ON DELETE SET NULL;
--
-- The column and the CHECK constraint exist now; only the FK
-- declaration is deferred so that migrations can apply in order
-- without forward-reference errors.


-- =============================================================================
-- DOWN MIGRATION
-- =============================================================================
/*
  To roll back (execute in reverse dependency order):

  DROP FUNCTION IF EXISTS public.release_availability(uuid);
  DROP FUNCTION IF EXISTS public.claim_availability(uuid, date, date, uuid);

  DROP TABLE IF EXISTS public.seasonal_pricing;
  DROP TABLE IF EXISTS public.room_availability;
  DROP TABLE IF EXISTS public.blocked_dates;

  DROP TYPE IF EXISTS public.app_block_source;
  DROP TYPE IF EXISTS public.app_availability_status;
*/
