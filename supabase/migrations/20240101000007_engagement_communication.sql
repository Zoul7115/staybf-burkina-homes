-- =============================================================================
-- Migration 0007 — Engagement & Communication
-- Scope : favorites, reviews, review_replies, threads, messages,
--         message_attachments, notifications, notification_preferences
--         + ALTER TABLE properties (avg_rating, review_count columns)
--         + Supabase Realtime publication setup
-- Depends on : 0001 (profiles, has_role, app_role, set_updated_at)
--              0003 (rooms, properties, host_profiles,
--                    is_host_of, is_host_of_room, app_room_status,
--                    app_property_status)
--              0005 (bookings, is_traveler_of_booking, app_booking_status)
-- Author: StayBF Engineering
-- =============================================================================
--
-- Security model summary
-- ----------------------
--   • FORCE ROW LEVEL SECURITY on every table.
--   • All cross-table ownership checks delegated to SECURITY DEFINER helpers
--     (is_thread_participant, can_review_booking) to prevent recursive RLS.
--   • messages is append-only for authenticated users: no DELETE grant;
--     an immutability trigger blocks edits to body / sender_id / thread_id.
--   • notifications INSERT is service_role-only at both the GRANT layer
--     (no INSERT granted to authenticated) and the RLS layer (no INSERT policy);
--     both gates must be independently breached to inject a notification.
--   • reviews INSERT is gated by a BEFORE INSERT trigger calling
--     can_review_booking(); the UNIQUE(booking_id, direction) constraint is
--     the DB-layer backstop against duplicate submissions.
--   • search_path = '' on every SECURITY DEFINER function.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — ENUMS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- app_review_direction
-- Identifies which party is the author of a review row.
-- Both directions may exist for a single booking; each is a separate row.
-- ---------------------------------------------------------------------------
CREATE TYPE public.app_review_direction AS ENUM (
  'traveler_to_host',   -- Traveler reviews the property / host.
  'host_to_traveler'    -- Host reviews the traveler (private aggregate).
);

-- ---------------------------------------------------------------------------
-- app_review_status
-- 8-state moderation machine per Revenue doc §3.10.
-- Transitions enforced by validate_review_transition() BEFORE UPDATE trigger.
-- ---------------------------------------------------------------------------
CREATE TYPE public.app_review_status AS ENUM (
  'submitted',      -- Author posted; awaiting auto-screen.
  'auto_screened',  -- Passed keyword / AI check; ready to publish.
  'published',      -- Visible to the public.
  'flagged',        -- User report or auto-flag; pending human review.
  'under_review',   -- Moderator picked up the flag.
  'removed',        -- Moderator determined policy violation.
  'appeal_open',    -- Author appealed within 14-day window.
  'appeal_closed'   -- Appeal denied; terminal state.
);

-- ---------------------------------------------------------------------------
-- app_notification_type
-- Extend with ALTER TYPE … ADD VALUE in future migrations as new events are
-- introduced — no table migration required.
-- ---------------------------------------------------------------------------
CREATE TYPE public.app_notification_type AS ENUM (
  'booking_requested',
  'booking_confirmed',
  'booking_cancelled_by_traveler',
  'booking_cancelled_by_host',
  'booking_cancelled_by_system',
  'booking_checked_in',
  'booking_completed',
  'payment_succeeded',
  'payment_failed',
  'payout_initiated',
  'payout_completed',
  'payout_failed',
  'review_submitted',
  'review_published',
  'review_flagged',
  'message_received',
  'kyc_approved',
  'kyc_rejected',
  'subscription_expiring',
  'subscription_expired',
  'support_ticket_updated',
  'host_penalty_applied',
  'account_suspended',
  'account_reinstated'
);

-- ---------------------------------------------------------------------------
-- app_notification_channel
-- One value per delivery channel.  Used as a column type in
-- notification_preferences.
-- ---------------------------------------------------------------------------
CREATE TYPE public.app_notification_channel AS ENUM (
  'in_app',
  'email',
  'sms',
  'push'
);


-- =============================================================================
-- SECTION 2 — ALTER TABLE properties
-- =============================================================================
-- Add denormalized rating columns maintained by the update_property_rating()
-- trigger defined later in this migration.  Added before the reviews table
-- because the trigger function references these columns.
-- =============================================================================

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS avg_rating   numeric(3,2)
    CONSTRAINT properties_avg_rating_range CHECK (
      avg_rating IS NULL OR (avg_rating >= 1.00 AND avg_rating <= 5.00)
    ),
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0
    CONSTRAINT properties_review_count_pos CHECK (review_count >= 0);

COMMENT ON COLUMN public.properties.avg_rating IS
  'Denormalized average overall_rating from published traveler→host reviews. '
  'NULL until the first review is published. Maintained by update_property_rating() trigger.';

COMMENT ON COLUMN public.properties.review_count IS
  'Count of published, non-removed traveler→host reviews for this property. '
  'Maintained by update_property_rating() trigger.';


-- =============================================================================
-- SECTION 3 — SECURITY-DEFINER HELPERS
-- =============================================================================
-- Defined before any table that references them in triggers or RLS policies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- is_thread_participant(uuid, uuid) → boolean
--
-- Used by messages and message_attachments RLS policies to resolve
-- thread membership without creating a recursive subquery on those tables.
-- Follows the same hardening pattern as has_role() and is_host_of_room().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_thread_participant(
  _user_id   uuid,
  _thread_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  STABLE
  PARALLEL SAFE
  SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT CASE
      WHEN _user_id IS NULL OR _thread_id IS NULL THEN false
      ELSE EXISTS (
        SELECT 1
        FROM public.threads t
        WHERE t.id          = _thread_id
          AND (t.traveler_id = _user_id OR t.host_id = _user_id)
      )
    END
  );
END;
$$;

COMMENT ON FUNCTION public.is_thread_participant(uuid, uuid) IS
  'Returns true when _user_id is the traveler or host of the given thread. '
  'SECURITY DEFINER + search_path='''' prevents recursive RLS on messages/attachments. '
  'Called by messages SELECT/INSERT/UPDATE and message_attachments SELECT/INSERT policies.';

GRANT EXECUTE ON FUNCTION public.is_thread_participant(uuid, uuid)
  TO authenticated;


-- ---------------------------------------------------------------------------
-- can_review_booking(uuid, uuid, app_review_direction) → boolean
--
-- Encapsulates all five review eligibility rules.  Called by the
-- check_review_eligibility BEFORE INSERT trigger on reviews.
-- Keeping logic here rather than inline in the trigger simplifies testing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_review_booking(
  _reviewer_id uuid,
  _booking_id  uuid,
  _direction   public.app_review_direction
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  STABLE
  SET search_path = ''
AS $$
DECLARE
  v_booking record;
BEGIN
  IF _reviewer_id IS NULL OR _booking_id IS NULL OR _direction IS NULL THEN
    RETURN false;
  END IF;

  SELECT b.status,
         b.check_out,
         b.traveler_id,
         b.room_id
  INTO   v_booking
  FROM   public.bookings b
  WHERE  b.id = _booking_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Rule 1: booking must be completed
  IF v_booking.status <> 'completed'::public.app_booking_status THEN
    RETURN false;
  END IF;

  -- Rule 2: minimum 24-hour delay after check_out
  IF v_booking.check_out + interval '1 day' > now() THEN
    RETURN false;
  END IF;

  -- Rule 3: 14-day review window must still be open
  IF v_booking.check_out + interval '14 days' < now() THEN
    RETURN false;
  END IF;

  -- Rule 4: reviewer identity must match the declared direction
  IF _direction = 'traveler_to_host'::public.app_review_direction THEN
    IF v_booking.traveler_id <> _reviewer_id THEN
      RETURN false;
    END IF;
  ELSE
    -- host_to_traveler: reviewer must be the host of the room
    IF NOT public.is_host_of_room(_reviewer_id, v_booking.room_id) THEN
      RETURN false;
    END IF;
  END IF;

  -- Rule 5: no prior submission for this (booking, direction)
  IF EXISTS (
    SELECT 1
    FROM public.reviews r
    WHERE r.booking_id = _booking_id
      AND r.direction  = _direction
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.can_review_booking(uuid, uuid, public.app_review_direction) IS
  'Returns true when all five eligibility rules pass: '
  '(1) booking completed; (2) check_out ≥ 24h ago; (3) within 14-day window; '
  '(4) reviewer identity matches direction; (5) no prior review for this booking+direction. '
  'Called by check_review_eligibility BEFORE INSERT trigger.';

GRANT EXECUTE ON FUNCTION public.can_review_booking(uuid, uuid, public.app_review_direction)
  TO authenticated;


-- =============================================================================
-- SECTION 4 — favorites
-- =============================================================================
-- Traveler wishlist.  Toggle model: INSERT to favorite, DELETE to unfavorite.
-- UNIQUE(user_id, property_id) is the conflict target for ON CONFLICT DO NOTHING
-- upserts in the toggleFavorite() server function.
-- Property may be favorited even if it later becomes paused/archived —
-- the card shows "unavailable" but the row is preserved (Blueprint §19).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.favorites (
  id          uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id     uuid        NOT NULL,
  property_id uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- One favorite per (user, property): also the ON CONFLICT target
  CONSTRAINT uq_favorites_user_property UNIQUE (user_id, property_id),

  FOREIGN KEY (user_id)     REFERENCES public.profiles    (id) ON DELETE CASCADE,
  FOREIGN KEY (property_id) REFERENCES public.properties  (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.favorites IS
  'Traveler wishlist. One row per (user, property). '
  'Toggle via toggleFavorite() server function using ON CONFLICT DO NOTHING. '
  'Rows persist even if property is later archived.';

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites FORCE ROW LEVEL SECURITY;

-- Owner full access (no admin policy needed — non-sensitive personal data)
CREATE POLICY "favorites: owner all"
  ON public.favorites
  FOR ALL
  TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Traveler inbox: my favorites ordered by most-recent
CREATE INDEX IF NOT EXISTS idx_favorites_user_id
  ON public.favorites (user_id, created_at DESC);

-- Popularity signal for analytics
CREATE INDEX IF NOT EXISTS idx_favorites_property_id
  ON public.favorites (property_id);

-- INSERT and DELETE; no UPDATE (insert/delete model)
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL                    ON public.favorites TO service_role;


-- =============================================================================
-- SECTION 5 — reviews
-- =============================================================================
-- Bidirectional post-stay reviews.  Two rows per completed booking (one per
-- direction).  Double-blind reveal is coordinated by maybe_reveal_reviews()
-- AFTER INSERT trigger.  Status transitions are enforced by
-- validate_review_transition() BEFORE UPDATE OF status trigger.
-- Edits to body are permitted while is_published = false AND within 48h;
-- enforced at the RLS UPDATE USING clause (not a separate trigger).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.reviews (
  id          uuid                     PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  booking_id  uuid                     NOT NULL,
  reviewer_id uuid                     NOT NULL,
  reviewee_id uuid                     NOT NULL,
  direction   public.app_review_direction NOT NULL,

  -- Overall score; sub-criteria are nullable (host→traveler has fewer criteria)
  overall_rating       smallint        NOT NULL,
  cleanliness_rating   smallint,
  accuracy_rating      smallint,
  location_rating      smallint,
  value_rating         smallint,
  communication_rating smallint,

  body        text                     NOT NULL,

  -- Double-blind reveal state.  Set by maybe_reveal_reviews() trigger.
  is_published  boolean                NOT NULL DEFAULT false,
  published_at  timestamptz,

  -- Moderation state machine
  status        public.app_review_status NOT NULL DEFAULT 'submitted',
  moderated_by  uuid,               -- profiles(id); set on moderation decision
  moderated_at  timestamptz,

  -- Appeal fields
  appeal_reason      text,          -- required when status → appeal_open
  appeal_decided_by  uuid,          -- profiles(id)
  appeal_decided_at  timestamptz,

  -- 48h edit window tracking
  edited_at  timestamptz,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- ── Constraints ──────────────────────────────────────────────────────────

  -- Primary anti-duplication: one review per (booking, direction)
  CONSTRAINT uq_reviews_booking_direction UNIQUE (booking_id, direction),

  -- Reviewer and reviewee must be different people
  CONSTRAINT reviews_reviewer_ne_reviewee CHECK (reviewer_id <> reviewee_id),

  -- Rating range guards
  CONSTRAINT reviews_overall_rating_range
    CHECK (overall_rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_cleanliness_rating_range
    CHECK (cleanliness_rating IS NULL OR cleanliness_rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_accuracy_rating_range
    CHECK (accuracy_rating IS NULL OR accuracy_rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_location_rating_range
    CHECK (location_rating IS NULL OR location_rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_value_rating_range
    CHECK (value_rating IS NULL OR value_rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_communication_rating_range
    CHECK (communication_rating IS NULL OR communication_rating BETWEEN 1 AND 5),

  -- Body length: minimum 10 prevents placeholder submissions; max 2000
  CONSTRAINT reviews_body_length
    CHECK (char_length(body) BETWEEN 10 AND 2000),

  -- Published state requires timestamp
  CONSTRAINT reviews_published_at_consistency
    CHECK (is_published = false OR published_at IS NOT NULL),

  -- Appeal requires a reason
  CONSTRAINT reviews_appeal_requires_reason
    CHECK (status <> 'appeal_open'::public.app_review_status OR appeal_reason IS NOT NULL),

  -- ── Foreign keys ─────────────────────────────────────────────────────────
  FOREIGN KEY (booking_id)       REFERENCES public.bookings  (id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id)      REFERENCES public.profiles  (id) ON DELETE SET NULL,
  FOREIGN KEY (reviewee_id)      REFERENCES public.profiles  (id) ON DELETE SET NULL,
  FOREIGN KEY (moderated_by)     REFERENCES public.profiles  (id) ON DELETE SET NULL,
  FOREIGN KEY (appeal_decided_by) REFERENCES public.profiles (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.reviews IS
  'Bidirectional post-stay reviews. Up to two rows per booking. '
  'Double-blind reveal: both rows hidden until both submitted or 14-day window closes. '
  'Moderation follows the 8-state machine in app_review_status.';

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews FORCE ROW LEVEL SECURITY;

-- Public: see published + approved reviews (property pages, host profiles)
CREATE POLICY "reviews: public read published"
  ON public.reviews
  FOR SELECT
  USING (
    is_published = true
    AND status = 'published'::public.app_review_status
  );

-- Reviewer can always see own review (allows pre-reveal read and edit)
CREATE POLICY "reviews: reviewer read own"
  ON public.reviews
  FOR SELECT
  TO authenticated
  USING (reviewer_id = auth.uid());

-- Reviewer can insert own review (trigger enforces eligibility)
CREATE POLICY "reviews: reviewer insert own"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (reviewer_id = auth.uid());

-- Reviewer can edit body within 48h while not yet published
CREATE POLICY "reviews: reviewer edit within window"
  ON public.reviews
  FOR UPDATE
  TO authenticated
  USING (
    reviewer_id = auth.uid()
    AND is_published = false
    AND created_at > now() - interval '48 hours'
  )
  WITH CHECK (
    reviewer_id = auth.uid()
    AND is_published = false
  );

-- Admin / super_admin full access (moderation, appeals)
CREATE POLICY "reviews: admin all"
  ON public.reviews
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- No DELETE for authenticated: removal is via status = 'removed'
GRANT SELECT, INSERT, UPDATE ON public.reviews TO authenticated;
GRANT ALL                    ON public.reviews TO service_role;

-- Primary lookup by booking (reveal trigger, admin view)
CREATE INDEX IF NOT EXISTS idx_reviews_booking_id
  ON public.reviews (booking_id);

-- "Reviews I've written" dashboard
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id
  ON public.reviews (reviewer_id);

-- "Reviews about me" dashboard
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id
  ON public.reviews (reviewee_id);

-- Property rating widget: published traveler→host reviews only
CREATE INDEX IF NOT EXISTS idx_reviews_published_traveler
  ON public.reviews (booking_id, overall_rating)
  WHERE is_published = true
    AND status    = 'published'
    AND direction = 'traveler_to_host';

-- Moderator queue: oldest pending work first
CREATE INDEX IF NOT EXISTS idx_reviews_moderation_queue
  ON public.reviews (status, created_at ASC)
  WHERE status IN ('submitted', 'flagged', 'under_review');

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- SECTION 5a — REVIEW TRIGGER FUNCTIONS
-- =============================================================================
-- Defined after reviews table (they reference public.reviews) but before
-- review_replies and the trigger attachment statements.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- check_review_eligibility() — BEFORE INSERT on reviews
-- Delegates to can_review_booking(); raises exception on failure.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_review_eligibility()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NOT public.can_review_booking(
    NEW.reviewer_id,
    NEW.booking_id,
    NEW.direction
  ) THEN
    RAISE EXCEPTION
      'Review eligibility check failed for booking % direction %',
      NEW.booking_id, NEW.direction
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reviews_check_eligibility
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.check_review_eligibility();


-- ---------------------------------------------------------------------------
-- maybe_reveal_reviews() — AFTER INSERT on reviews
-- Implements double-blind reveal: if both directions now exist for the same
-- booking (neither removed / appeal_closed), publishes both atomically.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.maybe_reveal_reviews()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  -- Check whether the complementary review has been submitted and is revealable
  IF EXISTS (
    SELECT 1
    FROM   public.reviews r
    WHERE  r.booking_id = NEW.booking_id
      AND  r.direction  <> NEW.direction
      AND  r.status NOT IN (
             'removed'::public.app_review_status,
             'appeal_closed'::public.app_review_status
           )
  ) THEN
    -- Reveal both rows atomically
    UPDATE public.reviews
    SET    is_published = true,
           published_at = now(),
           updated_at   = now()
    WHERE  booking_id = NEW.booking_id
      AND  status NOT IN (
             'removed'::public.app_review_status,
             'appeal_closed'::public.app_review_status
           )
      AND  is_published = false;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.maybe_reveal_reviews() IS
  'AFTER INSERT on reviews. Reveals both review rows atomically when both directions '
  'exist for the same booking and neither is removed/appeal_closed. '
  'The pg_cron reveal_expired_reviews job handles the one-sided reveal after 14 days.';

CREATE TRIGGER trg_reviews_maybe_reveal
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.maybe_reveal_reviews();


-- ---------------------------------------------------------------------------
-- validate_review_transition() — BEFORE UPDATE OF status on reviews
-- Enforces the 8-state machine from Revenue doc §3.10.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_review_transition()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'submitted'::public.app_review_status     AND NEW.status = 'auto_screened'::public.app_review_status)
    OR (OLD.status = 'auto_screened'::public.app_review_status AND NEW.status IN ('published'::public.app_review_status, 'flagged'::public.app_review_status))
    OR (OLD.status = 'published'::public.app_review_status  AND NEW.status = 'flagged'::public.app_review_status)
    OR (OLD.status = 'flagged'::public.app_review_status    AND NEW.status = 'under_review'::public.app_review_status)
    OR (OLD.status = 'under_review'::public.app_review_status AND NEW.status IN ('published'::public.app_review_status, 'removed'::public.app_review_status))
    OR (OLD.status = 'removed'::public.app_review_status    AND NEW.status = 'appeal_open'::public.app_review_status)
    OR (OLD.status = 'appeal_open'::public.app_review_status AND NEW.status IN ('published'::public.app_review_status, 'appeal_closed'::public.app_review_status))
  ) THEN
    RAISE EXCEPTION
      'Invalid review status transition: % → % (review_id: %)',
      OLD.status, NEW.status, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reviews_state_machine
  BEFORE UPDATE OF status ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_review_transition();


-- ---------------------------------------------------------------------------
-- update_property_rating() — AFTER INSERT OR UPDATE on reviews
-- Recomputes avg_rating and review_count on the parent property whenever a
-- traveler→host review is published or its status/is_published changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_property_rating()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_property_id uuid;
BEGIN
  -- Resolve property_id via booking → room → property
  SELECT rm.property_id
  INTO   v_property_id
  FROM   public.bookings b
  JOIN   public.rooms    rm ON rm.id = b.room_id
  WHERE  b.id = COALESCE(NEW.booking_id, OLD.booking_id)
  LIMIT  1;

  IF v_property_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Only traveler→host reviews affect the property rating
  IF COALESCE(NEW.direction, OLD.direction) <> 'traveler_to_host'::public.app_review_direction THEN
    RETURN NULL;
  END IF;

  UPDATE public.properties
  SET
    avg_rating   = (
      SELECT AVG(r.overall_rating)::numeric(3,2)
      FROM   public.reviews r
      JOIN   public.bookings b2  ON b2.id  = r.booking_id
      JOIN   public.rooms    rm2 ON rm2.id = b2.room_id
      WHERE  rm2.property_id = v_property_id
        AND  r.is_published  = true
        AND  r.status        = 'published'::public.app_review_status
        AND  r.direction     = 'traveler_to_host'::public.app_review_direction
    ),
    review_count = (
      SELECT COUNT(*)
      FROM   public.reviews r
      JOIN   public.bookings b2  ON b2.id  = r.booking_id
      JOIN   public.rooms    rm2 ON rm2.id = b2.room_id
      WHERE  rm2.property_id = v_property_id
        AND  r.is_published  = true
        AND  r.status        = 'published'::public.app_review_status
        AND  r.direction     = 'traveler_to_host'::public.app_review_direction
    ),
    updated_at   = now()
  WHERE id = v_property_id;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.update_property_rating() IS
  'AFTER INSERT OR UPDATE on reviews. Recomputes avg_rating and review_count on '
  'the parent property for traveler→host reviews that are published and not removed.';

CREATE TRIGGER trg_reviews_update_property_rating
  AFTER INSERT OR UPDATE OF status, is_published ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_property_rating();


-- =============================================================================
-- SECTION 6 — review_replies
-- =============================================================================
-- One public host reply per traveler→host review.
-- UNIQUE(review_id): one reply per review enforced at DB layer.
-- BEFORE INSERT trigger validates host ownership and review visibility.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.review_replies (
  id          uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  review_id   uuid        NOT NULL,
  author_id   uuid        NOT NULL,
  body        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- One reply per review
  CONSTRAINT uq_review_replies_review UNIQUE (review_id),

  CONSTRAINT review_replies_body_length
    CHECK (char_length(body) BETWEEN 1 AND 1000),

  FOREIGN KEY (review_id)  REFERENCES public.reviews  (id) ON DELETE CASCADE,
  FOREIGN KEY (author_id)  REFERENCES public.profiles (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.review_replies IS
  'Host public reply to a traveler→host review. One reply per review. '
  'Reply is visible when the parent review is published. '
  'Host ownership validated by check_review_reply_author() BEFORE INSERT trigger.';

ALTER TABLE public.review_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_replies FORCE ROW LEVEL SECURITY;

-- Public read when parent review is published
CREATE POLICY "review_replies: public read when parent published"
  ON public.review_replies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.reviews r
      WHERE r.id           = review_id
        AND r.is_published = true
        AND r.status       = 'published'::public.app_review_status
    )
  );

-- Author (host) can manage own reply
CREATE POLICY "review_replies: author all"
  ON public.review_replies
  FOR ALL
  TO authenticated
  USING     (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Admin full access
CREATE POLICY "review_replies: admin all"
  ON public.review_replies
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Host may INSERT, UPDATE, DELETE own reply
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_replies TO authenticated;
GRANT ALL                            ON public.review_replies TO service_role;

CREATE INDEX IF NOT EXISTS idx_review_replies_review_id
  ON public.review_replies (review_id);

CREATE INDEX IF NOT EXISTS idx_review_replies_author_id
  ON public.review_replies (author_id);

CREATE TRIGGER trg_review_replies_updated_at
  BEFORE UPDATE ON public.review_replies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------------------------
-- check_review_reply_author() — BEFORE INSERT on review_replies
-- Validates: (1) parent review direction = traveler_to_host,
--            (2) parent review is published,
--            (3) author is the host of the reviewed property.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_review_reply_author()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_direction   public.app_review_direction;
  v_published   boolean;
  v_room_id     uuid;
BEGIN
  SELECT r.direction,
         r.is_published,
         b.room_id
  INTO   v_direction, v_published, v_room_id
  FROM   public.reviews  r
  JOIN   public.bookings b ON b.id = r.booking_id
  WHERE  r.id = NEW.review_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_replies: parent review not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Only traveler→host reviews may receive a host reply
  IF v_direction <> 'traveler_to_host'::public.app_review_direction THEN
    RAISE EXCEPTION 'review_replies: replies only allowed on traveler→host reviews'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cannot reply to an unrevealed or removed review
  IF NOT v_published THEN
    RAISE EXCEPTION 'review_replies: cannot reply to an unpublished review'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Author must be the host of the room on the reviewed booking
  IF NOT public.is_host_of_room(NEW.author_id, v_room_id) THEN
    RAISE EXCEPTION 'review_replies: author is not the host of this property'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_review_replies_check_author
  BEFORE INSERT ON public.review_replies
  FOR EACH ROW EXECUTE FUNCTION public.check_review_reply_author();


-- =============================================================================
-- SECTION 7 — threads
-- =============================================================================
-- Conversation container between exactly one traveler and one host about one
-- room.  Pre-booking inquiry threads have booking_id = NULL; booking threads
-- carry the booking reference.  The UNIQUE constraint (with NULLS NOT DISTINCT)
-- enforces one inquiry thread and one thread per booking per (traveler, room).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.threads (
  id          uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  room_id     uuid        NOT NULL,
  traveler_id uuid        NOT NULL,
  host_id     uuid        NOT NULL,   -- denormalized; validated by trigger
  booking_id  uuid,                   -- NULL for pre-booking inquiries

  subject     text,                   -- auto-set on booking_id backfill

  -- Denormalized unread counters; maintained by update_thread_on_message()
  last_message_at          timestamptz,
  traveler_unread_count    integer     NOT NULL DEFAULT 0,
  host_unread_count        integer     NOT NULL DEFAULT 0,
  pre_booking_message_count integer    NOT NULL DEFAULT 0,

  is_archived_traveler     boolean     NOT NULL DEFAULT false,
  is_archived_host         boolean     NOT NULL DEFAULT false,
  is_frozen                boolean     NOT NULL DEFAULT false,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- ── Constraints ──────────────────────────────────────────────────────────

  CONSTRAINT threads_traveler_unread_pos CHECK (traveler_unread_count >= 0),
  CONSTRAINT threads_host_unread_pos     CHECK (host_unread_count     >= 0),
  CONSTRAINT threads_pre_booking_pos     CHECK (pre_booking_message_count >= 0),

  -- One inquiry thread per (traveler, room); one booking thread per booking.
  -- NULLS NOT DISTINCT means two NULL booking_id rows for the same
  -- (traveler_id, room_id) are treated as duplicates (Postgres 15+).
  CONSTRAINT uq_threads_participants
    UNIQUE NULLS NOT DISTINCT (traveler_id, room_id, booking_id),

  -- ── Foreign keys ─────────────────────────────────────────────────────────
  FOREIGN KEY (room_id)     REFERENCES public.rooms     (id) ON DELETE CASCADE,
  FOREIGN KEY (traveler_id) REFERENCES public.profiles  (id) ON DELETE SET NULL,
  FOREIGN KEY (host_id)     REFERENCES public.profiles  (id) ON DELETE SET NULL,
  FOREIGN KEY (booking_id)  REFERENCES public.bookings  (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.threads IS
  'Messaging container between one traveler and one host about one room. '
  'booking_id = NULL for pre-booking inquiry threads. '
  'is_frozen halts all new human messages (account suspension, post-archival). '
  'host_id is denormalized and validated by check_thread_host_ownership() trigger.';

ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads FORCE ROW LEVEL SECURITY;

-- Traveler or host can read their own threads
CREATE POLICY "threads: participant read"
  ON public.threads
  FOR SELECT
  TO authenticated
  USING (traveler_id = auth.uid() OR host_id = auth.uid());

-- Traveler may open new inquiry threads (trigger validates host_id)
CREATE POLICY "threads: traveler insert"
  ON public.threads
  FOR INSERT
  TO authenticated
  WITH CHECK (traveler_id = auth.uid());

-- Participants may update (archive flags, unread counts via server fn)
CREATE POLICY "threads: participant update"
  ON public.threads
  FOR UPDATE
  TO authenticated
  USING     (traveler_id = auth.uid() OR host_id = auth.uid())
  WITH CHECK (traveler_id = auth.uid() OR host_id = auth.uid());

-- Admin full access
CREATE POLICY "threads: admin all"
  ON public.threads
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- No DELETE for authenticated — archival / freeze are the lifecycle end states
GRANT SELECT, INSERT, UPDATE ON public.threads TO authenticated;
GRANT ALL                    ON public.threads TO service_role;

-- Traveler inbox: active, non-frozen threads sorted by latest activity
CREATE INDEX IF NOT EXISTS idx_threads_traveler_inbox
  ON public.threads (traveler_id, last_message_at DESC NULLS LAST)
  WHERE is_archived_traveler = false AND is_frozen = false;

-- Host inbox
CREATE INDEX IF NOT EXISTS idx_threads_host_inbox
  ON public.threads (host_id, last_message_at DESC NULLS LAST)
  WHERE is_archived_host = false AND is_frozen = false;

-- Booking confirmation backfill lookup
CREATE INDEX IF NOT EXISTS idx_threads_booking_id
  ON public.threads (booking_id)
  WHERE booking_id IS NOT NULL;

-- Admin audit: all conversations about a room
CREATE INDEX IF NOT EXISTS idx_threads_room_id
  ON public.threads (room_id);

CREATE TRIGGER trg_threads_updated_at
  BEFORE UPDATE ON public.threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------------------------
-- check_thread_host_ownership() — BEFORE INSERT on threads
-- Validates that the supplied host_id is the actual host of the room.
-- Prevents traveler from injecting a fabricated host_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_thread_host_ownership()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_host_of_room(NEW.host_id, NEW.room_id) THEN
    RAISE EXCEPTION
      'threads: host_id % is not the host of room %',
      NEW.host_id, NEW.room_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_threads_check_host_ownership
  BEFORE INSERT ON public.threads
  FOR EACH ROW EXECUTE FUNCTION public.check_thread_host_ownership();


-- =============================================================================
-- SECTION 8 — messages
-- =============================================================================
-- Append-only conversation records within a thread.
-- Immutability trigger blocks edits to body, sender_id, thread_id after insert.
-- Only is_read and read_at may be updated by authenticated users.
-- System messages (booking status events) are inserted by service_role;
-- they have sender_id = NULL and is_system_message = true.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id               uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  thread_id        uuid        NOT NULL,
  sender_id        uuid,                   -- NULL for system messages
  body             text,
  is_read          boolean     NOT NULL DEFAULT false,
  read_at          timestamptz,
  is_system_message boolean    NOT NULL DEFAULT false,
  metadata         jsonb,                  -- deep-link / event payload for system msgs

  -- No updated_at: only is_read/read_at change post-insert; tracked directly
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- ── Constraints ──────────────────────────────────────────────────────────

  -- Human messages require a body; system messages may have NULL body
  CONSTRAINT messages_body_required
    CHECK (is_system_message = true OR (body IS NOT NULL AND char_length(body) BETWEEN 1 AND 5000)),

  -- System messages must not have a human sender
  CONSTRAINT messages_system_no_sender
    CHECK (is_system_message = false OR sender_id IS NULL),

  -- Read timestamp implies read flag
  CONSTRAINT messages_read_at_consistency
    CHECK (is_read = false OR read_at IS NOT NULL),

  -- ── Foreign keys ─────────────────────────────────────────────────────────
  FOREIGN KEY (thread_id) REFERENCES public.threads  (id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES public.profiles (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.messages IS
  'Append-only message records within a thread. '
  'body, sender_id, thread_id are immutable after insert (enforced by trigger). '
  'Only is_read and read_at may be updated by authenticated users. '
  'System messages (is_system_message = true) are inserted by service_role only.';

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;

-- Thread participant can read all messages in their thread
CREATE POLICY "messages: participant read"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (public.is_thread_participant(auth.uid(), thread_id));

-- Sender may insert own non-system messages
CREATE POLICY "messages: sender insert"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_thread_participant(auth.uid(), thread_id)
    AND is_system_message = false
  );

-- Thread participants may update read flag only (immutability trigger enforces scope)
CREATE POLICY "messages: participant update read flag"
  ON public.messages
  FOR UPDATE
  TO authenticated
  USING     (public.is_thread_participant(auth.uid(), thread_id))
  WITH CHECK (public.is_thread_participant(auth.uid(), thread_id));

-- Admin full access
CREATE POLICY "messages: admin all"
  ON public.messages
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- No DELETE for authenticated; no UPDATE for anon
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL                    ON public.messages TO service_role;

-- Primary pagination index: newest messages in a thread
CREATE INDEX IF NOT EXISTS idx_messages_thread_created
  ON public.messages (thread_id, created_at DESC);

-- Unread-count badge and mark-read queries
CREATE INDEX IF NOT EXISTS idx_messages_unread_by_thread
  ON public.messages (thread_id, created_at ASC)
  WHERE is_read = false AND is_system_message = false;

-- Admin audit: messages sent by a specific user
CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON public.messages (sender_id, created_at DESC)
  WHERE sender_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- enforce_message_immutability() — BEFORE UPDATE on messages
-- Blocks any attempt to change body, sender_id, or thread_id after insert.
-- Only is_read and read_at are permitted to change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_message_immutability()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  -- body must not change
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    RAISE EXCEPTION
      'messages: body is immutable after insert (message_id: %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- sender_id must not change
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN
    RAISE EXCEPTION
      'messages: sender_id is immutable after insert (message_id: %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- thread_id must not change
  IF NEW.thread_id IS DISTINCT FROM OLD.thread_id THEN
    RAISE EXCEPTION
      'messages: thread_id is immutable after insert (message_id: %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_message_immutability() IS
  'BEFORE UPDATE on messages. Rejects any attempt to change body, sender_id, or '
  'thread_id. Only is_read and read_at are mutable after insert. '
  'Not SECURITY DEFINER: runs as calling role; service_role and admin are also blocked '
  'from changing these columns — immutability is unconditional.';

CREATE TRIGGER trg_messages_immutability
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_immutability();


-- ---------------------------------------------------------------------------
-- check_pre_booking_message_cap() — BEFORE INSERT on messages
-- Enforces the 10-message pre-booking limit (Blueprint §17 anti-spam rule)
-- and blocks inserts into frozen threads.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_pre_booking_message_cap()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_thread record;
BEGIN
  -- System messages bypass all caps (service_role inserts)
  IF NEW.is_system_message = true THEN
    RETURN NEW;
  END IF;

  SELECT is_frozen,
         booking_id,
         pre_booking_message_count
  INTO   v_thread
  FROM   public.threads
  WHERE  id = NEW.thread_id;

  -- Frozen threads reject all human messages
  IF v_thread.is_frozen THEN
    RAISE EXCEPTION
      'messages: thread % is frozen; no new messages allowed', NEW.thread_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Pre-booking cap: max 10 messages before a booking exists
  IF v_thread.booking_id IS NULL
     AND v_thread.pre_booking_message_count >= 10 THEN
    RAISE EXCEPTION
      'messages: pre-booking message limit reached for thread %. A booking is required to continue.',
      NEW.thread_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_pre_booking_cap
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.check_pre_booking_message_cap();


-- ---------------------------------------------------------------------------
-- update_thread_on_message() — AFTER INSERT on messages
-- Maintains thread metadata: last_message_at, unread counts,
-- pre_booking_message_count.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_thread_on_message()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  UPDATE public.threads
  SET
    last_message_at = NEW.created_at,
    updated_at      = now(),

    -- Increment the RECIPIENT's unread count, not the sender's.
    -- System messages increment neither counter.
    traveler_unread_count = CASE
      WHEN NEW.is_system_message = true THEN traveler_unread_count
      WHEN NEW.sender_id = host_id      THEN traveler_unread_count + 1
      ELSE traveler_unread_count
    END,
    host_unread_count = CASE
      WHEN NEW.is_system_message = true    THEN host_unread_count
      WHEN NEW.sender_id = traveler_id     THEN host_unread_count + 1
      ELSE host_unread_count
    END,

    -- Track pre-booking message count for anti-spam cap
    pre_booking_message_count = CASE
      WHEN booking_id IS NULL AND NEW.is_system_message = false
        THEN pre_booking_message_count + 1
      ELSE pre_booking_message_count
    END
  WHERE id = NEW.thread_id;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.update_thread_on_message() IS
  'AFTER INSERT on messages. Atomically updates last_message_at, recipient unread '
  'count, and pre_booking_message_count on the parent thread.';

CREATE TRIGGER trg_messages_update_thread
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_thread_on_message();


-- =============================================================================
-- SECTION 9 — message_attachments
-- =============================================================================
-- Metadata for files attached to messages.  Actual bytes live in the
-- message-attachments Supabase Storage bucket (private, signed URLs only).
-- Created atomically with the parent message inside sendMessage() server fn.
-- MIME type and size are validated server-side before upload URL is issued;
-- the CHECK constraints here are the DB-layer backstop.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.message_attachments (
  id               uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  message_id       uuid        NOT NULL,
  storage_path     text        NOT NULL,
  mime_type        text        NOT NULL,
  size_bytes       integer     NOT NULL,
  original_filename text,                 -- display label only; not used in path

  -- No updated_at: attachments are immutable after upload
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- ── Constraints ──────────────────────────────────────────────────────────

  CONSTRAINT message_attachments_mime_allowed CHECK (
    mime_type IN (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf'
    )
  ),

  -- 5 MB limit per Blueprint §17
  CONSTRAINT message_attachments_size_range
    CHECK (size_bytes > 0 AND size_bytes <= 5242880),

  -- Minimum path depth {thread_id}/{message_id}/{filename}: 2 slashes
  CONSTRAINT message_attachments_path_depth
    CHECK (storage_path LIKE '%/%/%'),

  -- ── Foreign keys ─────────────────────────────────────────────────────────
  FOREIGN KEY (message_id) REFERENCES public.messages (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.message_attachments IS
  'Metadata for files attached to messages. Actual bytes in message-attachments '
  'Storage bucket (private, signed URLs only, 5 MB limit). '
  'Path pattern: {thread_id}/{message_id}/{uuid}.{ext}. '
  'Virus scan: AFTER INSERT pg_net call to Edge Function; infected files are '
  'deleted from Storage and this table by the Edge Function via service_role.';

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments FORCE ROW LEVEL SECURITY;

-- Thread participant can read attachments on messages in their thread
CREATE POLICY "message_attachments: participant read"
  ON public.message_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.id = message_id
        AND public.is_thread_participant(auth.uid(), m.thread_id)
    )
  );

-- Only the message sender may attach files to their own message
CREATE POLICY "message_attachments: sender insert"
  ON public.message_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.id        = message_id
        AND m.sender_id = auth.uid()
    )
  );

-- Admin full access (virus scan cleanup, moderation)
CREATE POLICY "message_attachments: admin all"
  ON public.message_attachments
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- No UPDATE or DELETE for authenticated — immutable; deletions via service_role
GRANT SELECT, INSERT ON public.message_attachments TO authenticated;
GRANT ALL            ON public.message_attachments TO service_role;

-- Load all attachments for a batch of messages in a thread view
CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id
  ON public.message_attachments (message_id);


-- =============================================================================
-- SECTION 10 — notifications
-- =============================================================================
-- Unified notification store.  One row per (user, event).
-- The row IS the in-app delivery — delivered_in_app_at is set on INSERT.
-- channel_* booleans are resolved at insert time from notification_preferences;
-- delivered_*_at timestamps are written back by Edge Functions on success.
-- INSERT is service_role-only at both GRANT and RLS layers (two independent
-- gates must both be bypassed for an unauthenticated injection to succeed).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid                         PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id     uuid                         NOT NULL,
  type        public.app_notification_type NOT NULL,
  title       text                         NOT NULL,
  body        text                         NOT NULL,
  data        jsonb,                       -- deep-link payload; no PII

  -- Read state
  is_read     boolean     NOT NULL DEFAULT false,
  read_at     timestamptz,

  -- Channel routing: resolved at insert time from notification_preferences
  channel_in_app  boolean NOT NULL DEFAULT true,
  channel_email   boolean NOT NULL DEFAULT false,
  channel_sms     boolean NOT NULL DEFAULT false,
  channel_push    boolean NOT NULL DEFAULT false,

  -- Delivery receipts: set by Edge Functions on success
  delivered_in_app_at  timestamptz,
  delivered_email_at   timestamptz,
  delivered_sms_at     timestamptz,
  delivered_push_at    timestamptz,

  -- Retry tracking
  delivery_attempts    integer     NOT NULL DEFAULT 0,
  last_delivery_error  text,

  -- Critical notifications bypass quiet hours (22:00–07:00 local)
  quiet_hours_bypass   boolean     NOT NULL DEFAULT false,

  created_at  timestamptz NOT NULL DEFAULT now(),

  -- ── Constraints ──────────────────────────────────────────────────────────

  CONSTRAINT notifications_title_length   CHECK (char_length(title) <= 100),
  CONSTRAINT notifications_body_length    CHECK (char_length(body)  <= 500),
  CONSTRAINT notifications_read_at_consistency
    CHECK (is_read = false OR read_at IS NOT NULL),
  CONSTRAINT notifications_delivery_attempts_pos
    CHECK (delivery_attempts >= 0),

  -- ── Foreign keys ─────────────────────────────────────────────────────────
  FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.notifications IS
  'Unified notification feed. One row per (user, domain event). '
  'channel_in_app is always true; other channels set from notification_preferences at insert. '
  'INSERT is service_role-only — GRANT and RLS both block authenticated inserts. '
  'Realtime publication broadcasts INSERT events to the recipient client.';

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

-- Owner reads all own notifications (unread feed, full history)
CREATE POLICY "notifications: owner read"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Owner may mark own notifications as read (is_read, read_at columns only)
CREATE POLICY "notifications: owner update read flag"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admin read-all for support / audit (read-only — no UPDATE policy for admin)
CREATE POLICY "notifications: admin read all"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- NO INSERT POLICY for authenticated — all inserts are service_role only.
-- The GRANT below independently enforces this at the privilege layer.

-- SELECT and UPDATE only; INSERT intentionally excluded from authenticated GRANT
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL            ON public.notifications TO service_role;

-- Hot path: unread badge count and unread notification feed
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE is_read = false;

-- Full notification history feed (read and unread)
CREATE INDEX IF NOT EXISTS idx_notifications_user_all
  ON public.notifications (user_id, created_at DESC);

-- pg_cron email retry scan: delivered_email_at IS NULL means not yet delivered
CREATE INDEX IF NOT EXISTS idx_notifications_email_retry
  ON public.notifications (created_at ASC)
  WHERE channel_email = true
    AND delivered_email_at IS NULL
    AND delivery_attempts < 5;

-- pg_cron SMS retry scan
CREATE INDEX IF NOT EXISTS idx_notifications_sms_retry
  ON public.notifications (created_at ASC)
  WHERE channel_sms = true
    AND delivered_sms_at IS NULL
    AND delivery_attempts < 5;


-- ---------------------------------------------------------------------------
-- set_in_app_delivered_at() — AFTER INSERT on notifications
-- Records in-app delivery timestamp immediately on row creation.
-- The row existing IS the delivery for in-app — no separate delivery step.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_in_app_delivered_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  UPDATE public.notifications
  SET    delivered_in_app_at = now()
  WHERE  id = NEW.id
    AND  channel_in_app = true;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.set_in_app_delivered_at() IS
  'AFTER INSERT on notifications. Sets delivered_in_app_at = now() immediately. '
  'Row existence = in-app delivery. Supabase Realtime broadcasts the INSERT '
  'concurrently; if Realtime is delayed the notification is still in the feed.';

CREATE TRIGGER trg_notifications_set_in_app_delivered
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_in_app_delivered_at();


-- =============================================================================
-- SECTION 11 — notification_preferences
-- =============================================================================
-- Per-user, per-type, per-channel opt-out table.  Sparse by design:
-- rows are written only when the user deviates from the platform default.
-- The dispatchNotification() server function falls back to hardcoded defaults
-- when no row exists for a given (user_id, type, channel) triple.
-- UNIQUE(user_id, notification_type, channel) is the ON CONFLICT target for
-- the preference upsert in the notification settings server function.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id                uuid                         PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id           uuid                         NOT NULL,
  notification_type public.app_notification_type NOT NULL,
  channel           public.app_notification_channel NOT NULL,
  enabled           boolean                      NOT NULL DEFAULT true,

  -- No created_at: the table is upserted; updated_at is the relevant timestamp
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- One preference row per (user, type, channel)
  CONSTRAINT uq_notification_prefs_user_type_channel
    UNIQUE (user_id, notification_type, channel),

  FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.notification_preferences IS
  'Sparse per-user notification opt-out table. Rows exist only when the user '
  'deviates from the platform default. dispatchNotification() server function '
  'falls back to hardcoded defaults on cache miss. '
  'UNIQUE(user_id, notification_type, channel) is the ON CONFLICT DO UPDATE target.';

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences FORCE ROW LEVEL SECURITY;

-- Owner full access (read + write own preferences)
CREATE POLICY "notification_preferences: owner all"
  ON public.notification_preferences
  FOR ALL
  TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No admin RLS policy — preferences are personal; admins use service_role client
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL                            ON public.notification_preferences TO service_role;

-- The UNIQUE constraint creates the covering index; no additional index needed.

CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- SECTION 12 — SUPABASE REALTIME PUBLICATION SETUP
-- =============================================================================
-- messages  : clients subscribe per-thread (filter: thread_id = eq.<uuid>)
-- notifications: clients subscribe per-user  (filter: user_id  = eq.<uid>)
--
-- Supabase Realtime evaluates RLS SELECT policies for each broadcast event.
-- A client receives only events for rows that pass their policy USING clause,
-- making the subscription inherently tenant-isolated.
--
-- threads and notification_preferences are deliberately excluded:
--   • threads: metadata updates (unread counts) are derived client-side
--     from incoming message events; a separate thread subscription is
--     not necessary for MVP and would increase Realtime event volume.
--   • notification_preferences: no live-sync requirement.
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

COMMENT ON TABLE public.messages IS
  'Append-only message records within a thread. '
  'Published to supabase_realtime. Clients subscribe with filter '
  'thread_id=eq.<uuid>. RLS SELECT policy enforces participant-only delivery.';

COMMENT ON TABLE public.notifications IS
  'Unified notification feed. '
  'Published to supabase_realtime. Clients subscribe with filter '
  'user_id=eq.<auth.uid()>. RLS SELECT policy enforces owner-only delivery. '
  'INSERT events drive the bell badge; UPDATE events synchronize read state across tabs.';


-- =============================================================================
-- END OF UP MIGRATION
-- =============================================================================


/*
-- =============================================================================
-- DOWN MIGRATION
-- =============================================================================
-- Execute in reverse dependency order.  Run only to roll back a failed deploy.
-- WARNING: All engagement data (reviews, messages, notifications) will be lost.
--
-- Step 1: Remove Realtime publication entries
ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
ALTER PUBLICATION supabase_realtime DROP TABLE public.messages;

-- Step 2: Drop triggers (in table-dependency order)
DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON public.notification_preferences;
DROP TRIGGER IF EXISTS trg_notifications_set_in_app_delivered  ON public.notifications;
DROP TRIGGER IF EXISTS trg_messages_update_thread              ON public.messages;
DROP TRIGGER IF EXISTS trg_messages_pre_booking_cap            ON public.messages;
DROP TRIGGER IF EXISTS trg_messages_immutability               ON public.messages;
DROP TRIGGER IF EXISTS trg_threads_check_host_ownership        ON public.threads;
DROP TRIGGER IF EXISTS trg_threads_updated_at                  ON public.threads;
DROP TRIGGER IF EXISTS trg_review_replies_check_author         ON public.review_replies;
DROP TRIGGER IF EXISTS trg_review_replies_updated_at           ON public.review_replies;
DROP TRIGGER IF EXISTS trg_reviews_update_property_rating      ON public.reviews;
DROP TRIGGER IF EXISTS trg_reviews_state_machine               ON public.reviews;
DROP TRIGGER IF EXISTS trg_reviews_maybe_reveal                ON public.reviews;
DROP TRIGGER IF EXISTS trg_reviews_check_eligibility           ON public.reviews;
DROP TRIGGER IF EXISTS trg_reviews_updated_at                  ON public.reviews;

-- Step 3: Drop functions
DROP FUNCTION IF EXISTS public.set_in_app_delivered_at();
DROP FUNCTION IF EXISTS public.update_thread_on_message();
DROP FUNCTION IF EXISTS public.check_pre_booking_message_cap();
DROP FUNCTION IF EXISTS public.enforce_message_immutability();
DROP FUNCTION IF EXISTS public.check_thread_host_ownership();
DROP FUNCTION IF EXISTS public.update_property_rating();
DROP FUNCTION IF EXISTS public.validate_review_transition();
DROP FUNCTION IF EXISTS public.maybe_reveal_reviews();
DROP FUNCTION IF EXISTS public.check_review_eligibility();
DROP FUNCTION IF EXISTS public.check_review_reply_author();
DROP FUNCTION IF EXISTS public.can_review_booking(uuid, uuid, public.app_review_direction);
DROP FUNCTION IF EXISTS public.is_thread_participant(uuid, uuid);

-- Step 4: Drop tables (leaf tables first)
DROP TABLE IF EXISTS public.notification_preferences;
DROP TABLE IF EXISTS public.notifications;
DROP TABLE IF EXISTS public.message_attachments;
DROP TABLE IF EXISTS public.messages;
DROP TABLE IF EXISTS public.threads;
DROP TABLE IF EXISTS public.review_replies;
DROP TABLE IF EXISTS public.reviews;
DROP TABLE IF EXISTS public.favorites;

-- Step 5: Drop columns added to properties
ALTER TABLE public.properties DROP COLUMN IF EXISTS avg_rating;
ALTER TABLE public.properties DROP COLUMN IF EXISTS review_count;

-- Step 6: Drop enums
DROP TYPE IF EXISTS public.app_notification_channel;
DROP TYPE IF EXISTS public.app_notification_type;
DROP TYPE IF EXISTS public.app_review_status;
DROP TYPE IF EXISTS public.app_review_direction;

-- =============================================================================
-- END OF DOWN MIGRATION
-- =============================================================================
*/
