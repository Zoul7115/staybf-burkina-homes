-- =============================================================================
-- Migration 0003 — Catalog Domain
-- Scope : host_profiles, properties, property_images, rooms, room_images,
--         amenities_map (property_amenities)
-- Depends on : 0001 (profiles, user_roles, has_role, app_role enum)
--              0002 (cities, amenities, billing schema)
-- Author: StayBF
-- =============================================================================

-- ============================================================
-- 1. ENUMS
-- ============================================================

CREATE TYPE public.app_host_status AS ENUM (
  'draft',
  'pending_review',
  'verified',
  'rejected',
  'suspended'
);

CREATE TYPE public.app_property_status AS ENUM (
  'draft',
  'submitted',
  'under_review',
  'published',
  'rejected',
  'suspended',
  'archived'
);

CREATE TYPE public.app_room_status AS ENUM (
  'draft',
  'active',
  'paused',
  'archived'
);

CREATE TYPE public.app_property_type AS ENUM (
  'hotel',
  'residence',
  'villa',
  'auberge',
  'apartment',
  'guesthouse',
  'lodge'
);

CREATE TYPE public.app_room_type AS ENUM (
  'single',
  'double',
  'twin',
  'suite',
  'family',
  'studio',
  'apartment'
);

CREATE TYPE public.app_cancellation_policy AS ENUM (
  'flexible',
  'moderate',
  'strict',
  'non_refundable'
);

CREATE TYPE public.app_payout_method AS ENUM (
  'orange_money',
  'moov_money',
  'bank'
);


-- ============================================================
-- 2. SECURITY-DEFINER HELPER FUNCTIONS
-- ============================================================

-- Returns true if _user_id is the active host who owns _property_id.
-- Excludes soft-deleted properties and suspended/rejected host accounts
-- so that suspended hosts cannot write catalog data through any downstream policy.
CREATE OR REPLACE FUNCTION public.is_host_of(
  _user_id    uuid,
  _property_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  STABLE
  PARALLEL SAFE
  SET search_path = ''
AS $$
BEGIN
  -- plpgsql defers table resolution to call time, avoiding forward-reference
  -- errors when the function is defined before its referenced tables exist.
  RETURN (
    SELECT CASE
      WHEN _user_id IS NULL OR _property_id IS NULL THEN false
      ELSE EXISTS (
        SELECT 1
        FROM public.properties p
        JOIN public.host_profiles hp ON hp.id = p.host_id
        WHERE p.id           = _property_id
          AND hp.id          = _user_id
          AND p.deleted_at   IS NULL
          AND hp.status      NOT IN (
                'suspended'::public.app_host_status,
                'rejected'::public.app_host_status
              )
      )
    END
  );
END;
$$;

-- Returns true if _user_id is the active host who owns the property
-- that contains _room_id.
-- Inherits the same deleted_at and host-status guards as is_host_of.
CREATE OR REPLACE FUNCTION public.is_host_of_room(
  _user_id uuid,
  _room_id  uuid
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
      WHEN _user_id IS NULL OR _room_id IS NULL THEN false
      ELSE EXISTS (
        SELECT 1
        FROM public.rooms r
        JOIN public.properties p     ON p.id  = r.property_id
        JOIN public.host_profiles hp ON hp.id = p.host_id
        WHERE r.id         = _room_id
          AND hp.id        = _user_id
          AND p.deleted_at IS NULL
          AND hp.status    NOT IN (
                'suspended'::public.app_host_status,
                'rejected'::public.app_host_status
              )
      )
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_host_of(uuid, uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_host_of_room(uuid, uuid) TO authenticated;


-- ============================================================
-- 3. HOST PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.host_profiles (
  -- PK is identical to profiles.id (1:1 relationship)
  id                      uuid                      PRIMARY KEY,
  company_name            text,
  legal_form              text,
  tax_id                  text,
  bio                     text,
  superhost               boolean                   NOT NULL DEFAULT false,
  response_rate           numeric(5,2),
  response_time_minutes   integer,
  host_since              date,
  payout_method           public.app_payout_method,
  -- Stored as app-layer libsodium sealed-box ciphertext; never returned in DTOs
  payout_account          text,
  status                  public.app_host_status    NOT NULL DEFAULT 'draft',
  verified_at             timestamptz,
  created_at              timestamptz               NOT NULL DEFAULT now(),
  updated_at              timestamptz               NOT NULL DEFAULT now(),

  CONSTRAINT host_profiles_response_rate_range CHECK (
    response_rate IS NULL OR (response_rate >= 0 AND response_rate <= 100)
  ),
  CONSTRAINT host_profiles_response_time_pos CHECK (
    response_time_minutes IS NULL OR response_time_minutes >= 0
  ),
  CONSTRAINT host_profiles_verified_at_consistency CHECK (
    (status = 'verified' AND verified_at IS NOT NULL)
    OR status != 'verified'
  ),

  FOREIGN KEY (id) REFERENCES public.profiles (id) ON DELETE CASCADE
);

ALTER TABLE public.host_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_profiles FORCE ROW LEVEL SECURITY;

-- Host reads and updates own profile
CREATE POLICY "host_profiles: owner read"
  ON public.host_profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "host_profiles: owner update"
  ON public.host_profiles
  FOR UPDATE
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin / super_admin read all
CREATE POLICY "host_profiles: admin read-all"
  ON public.host_profiles
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Support read-only
CREATE POLICY "host_profiles: support read-all"
  ON public.host_profiles
  FOR SELECT
  USING (public.has_role(auth.uid(), 'support'::public.app_role));

-- Finance read (needed for payout processing context)
CREATE POLICY "host_profiles: finance read-all"
  ON public.host_profiles
  FOR SELECT
  USING (public.has_role(auth.uid(), 'finance'::public.app_role));

-- super_admin may write any row (status changes, KYC approval, suspension)
CREATE POLICY "host_profiles: super_admin write-any"
  ON public.host_profiles
  FOR ALL
  USING  (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- No INSERT policy for authenticated: INSERT is performed by the
-- become_host() SECURITY DEFINER server function running as owner.
-- No DELETE policy: deletion cascades from profiles only.

GRANT SELECT, UPDATE ON public.host_profiles TO authenticated;
GRANT ALL            ON public.host_profiles TO service_role;

CREATE INDEX IF NOT EXISTS idx_host_profiles_status
  ON public.host_profiles (status);

CREATE INDEX IF NOT EXISTS idx_host_profiles_superhost
  ON public.host_profiles (superhost)
  WHERE superhost = true;

CREATE TRIGGER trg_host_profiles_updated_at
  BEFORE UPDATE ON public.host_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 4. PROPERTIES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.properties (
  id                    uuid                          PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  host_id               uuid                          NOT NULL,
  city_id               uuid                          NOT NULL,
  slug                  text                          NOT NULL,
  name                  text                          NOT NULL,
  type                  public.app_property_type      NOT NULL,
  description_md        text,
  address               text,
  latitude              numeric(9,6),
  longitude             numeric(9,6),
  status                public.app_property_status    NOT NULL DEFAULT 'draft',
  instant_book          boolean                       NOT NULL DEFAULT false,
  cancellation_policy   public.app_cancellation_policy NOT NULL DEFAULT 'moderate',
  house_rules           jsonb,
  check_in_from         time,
  check_out_until       time,
  -- Denormalized fields — maintained by triggers
  rating_avg            numeric(3,2),
  rating_count          integer                       NOT NULL DEFAULT 0,
  min_price_fcfa        integer,
  -- Lifecycle timestamps
  published_at          timestamptz,
  deleted_at            timestamptz,
  created_at            timestamptz                   NOT NULL DEFAULT now(),
  updated_at            timestamptz                   NOT NULL DEFAULT now(),

  CONSTRAINT properties_slug_unique UNIQUE (slug),
  CONSTRAINT properties_rating_avg_range CHECK (
    rating_avg IS NULL OR (rating_avg >= 1.0 AND rating_avg <= 5.0)
  ),
  CONSTRAINT properties_rating_count_nonneg CHECK (rating_count >= 0),
  CONSTRAINT properties_min_price_pos CHECK (
    min_price_fcfa IS NULL OR min_price_fcfa > 0
  ),
  CONSTRAINT properties_published_at_consistency CHECK (
    (status = 'published' AND published_at IS NOT NULL)
    OR status != 'published'
  ),
  CONSTRAINT properties_lat_range CHECK (
    latitude IS NULL OR (latitude >= -90 AND latitude <= 90)
  ),
  CONSTRAINT properties_lng_range CHECK (
    longitude IS NULL OR (longitude >= -180 AND longitude <= 180)
  ),

  FOREIGN KEY (host_id) REFERENCES public.host_profiles (id) ON DELETE RESTRICT,
  FOREIGN KEY (city_id) REFERENCES public.cities (id)        ON DELETE RESTRICT
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties FORCE ROW LEVEL SECURITY;

-- Anyone (anon + authenticated) may read published, non-deleted properties
CREATE POLICY "properties: public read published"
  ON public.properties
  FOR SELECT
  USING (status = 'published' AND deleted_at IS NULL);

-- Host reads all own properties regardless of status (needed for dashboard)
CREATE POLICY "properties: host read own"
  ON public.properties
  FOR SELECT
  USING (host_id = auth.uid());

-- Host updates own non-deleted properties
-- Status column transitions are enforced by server functions via service_role;
-- the host cannot flip status directly through this policy.
CREATE POLICY "properties: host update own"
  ON public.properties
  FOR UPDATE
  USING  (host_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (host_id = auth.uid());

-- admin and super_admin have full access
CREATE POLICY "properties: admin all"
  ON public.properties
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Support read-only access to all properties
CREATE POLICY "properties: support read-all"
  ON public.properties
  FOR SELECT
  USING (public.has_role(auth.uid(), 'support'::public.app_role));

-- No INSERT policy for authenticated — INSERT via createProperty() server fn
-- which validates host quota against subscription plan max_properties.
-- No DELETE policy — soft delete only (deleted_at); hard delete by service_role.
-- No UPDATE grant to authenticated: system-managed columns (status, deleted_at,
-- published_at, rating_avg, rating_count, min_price_fcfa) must not be writable
-- by any client path. All host property edits go through updateProperty() server
-- function which uses service_role with explicit column targeting.

GRANT SELECT ON public.properties TO anon;
GRANT SELECT ON public.properties TO authenticated;
GRANT ALL    ON public.properties TO service_role;

-- Tenant scoping — hot path for host dashboard
CREATE INDEX IF NOT EXISTS idx_properties_host
  ON public.properties (host_id);

-- Primary search filter: status + city, excluding deleted
CREATE INDEX IF NOT EXISTS idx_properties_status_city
  ON public.properties (status, city_id)
  WHERE deleted_at IS NULL;

-- Price sort on search results
CREATE INDEX IF NOT EXISTS idx_properties_min_price
  ON public.properties (min_price_fcfa)
  WHERE status = 'published' AND deleted_at IS NULL;

-- Rating sort on search results
CREATE INDEX IF NOT EXISTS idx_properties_rating
  ON public.properties (rating_avg DESC NULLS LAST)
  WHERE status = 'published' AND deleted_at IS NULL;

-- Geo radius search via earthdistance (extension enabled in 0001)
CREATE INDEX IF NOT EXISTS idx_properties_geo
  ON public.properties USING gist (extensions.ll_to_earth(latitude, longitude))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND deleted_at IS NULL;

-- Trigram full-text name search (pg_trgm enabled in 0001)
CREATE INDEX IF NOT EXISTS idx_properties_name_trgm
  ON public.properties USING gin (name extensions.gin_trgm_ops);

CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 5. PROPERTY IMAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.property_images (
  id            uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  property_id   uuid        NOT NULL,
  -- Relative path inside the 'property-images' Storage bucket:
  -- {host_id}/{property_id}/{uuid}.jpg
  storage_path  text        NOT NULL,
  alt           text,
  position      integer     NOT NULL DEFAULT 0,
  is_cover      boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT property_images_position_nonneg CHECK (position >= 0),

  FOREIGN KEY (property_id) REFERENCES public.properties (id) ON DELETE CASCADE
);

ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_images FORCE ROW LEVEL SECURITY;

-- Property images are publicly readable (matches Storage bucket policy)
CREATE POLICY "property_images: public read"
  ON public.property_images
  FOR SELECT
  USING (true);

-- Host manages images for own properties
CREATE POLICY "property_images: host write own"
  ON public.property_images
  FOR ALL
  USING  (public.is_host_of(auth.uid(), property_id))
  WITH CHECK (public.is_host_of(auth.uid(), property_id));

-- Admin / super_admin full access
CREATE POLICY "property_images: admin all"
  ON public.property_images
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT                          ON public.property_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.property_images TO authenticated;
GRANT ALL                             ON public.property_images TO service_role;

-- Ordered gallery fetch
CREATE INDEX IF NOT EXISTS idx_property_images_property_position
  ON public.property_images (property_id, position);

-- Enforce at most one cover image per property at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_property_images_cover
  ON public.property_images (property_id)
  WHERE is_cover = true;


-- ============================================================
-- 6. ROOMS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rooms (
  id              uuid                  PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  property_id     uuid                  NOT NULL,
  name            text                  NOT NULL,
  type            public.app_room_type  NOT NULL DEFAULT 'double',
  max_guests      integer               NOT NULL,
  -- Array of bed objects: [{type: "double"|"single"|"bunk"|"sofa", count: int}]
  beds            jsonb                 NOT NULL DEFAULT '[]'::jsonb,
  base_price_fcfa integer               NOT NULL,
  currency        text                  NOT NULL DEFAULT 'XOF',
  status          public.app_room_status NOT NULL DEFAULT 'draft',
  instant_book    boolean               NOT NULL DEFAULT false,
  created_at      timestamptz           NOT NULL DEFAULT now(),
  updated_at      timestamptz           NOT NULL DEFAULT now(),

  CONSTRAINT rooms_max_guests_pos    CHECK (max_guests > 0),
  CONSTRAINT rooms_base_price_pos    CHECK (base_price_fcfa > 0),
  CONSTRAINT rooms_currency_xof      CHECK (currency = 'XOF'),

  FOREIGN KEY (property_id) REFERENCES public.properties (id) ON DELETE RESTRICT
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms FORCE ROW LEVEL SECURITY;

-- Active rooms are readable by everyone (anon + authenticated) only when the
-- parent property is published and not soft-deleted. This prevents rooms of
-- suspended, archived, or deleted properties from being reachable via direct
-- table queries. The subquery does not touch the rooms table itself so there
-- is no recursive RLS evaluation.
CREATE POLICY "rooms: public read active"
  ON public.rooms
  FOR SELECT
  USING (
    status = 'active'::public.app_room_status
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id         = property_id
        AND p.status     = 'published'::public.app_property_status
        AND p.deleted_at IS NULL
    )
  );

-- Host reads and manages all own rooms (including draft/paused/archived)
CREATE POLICY "rooms: host read own"
  ON public.rooms
  FOR SELECT
  USING (public.is_host_of(auth.uid(), property_id));

CREATE POLICY "rooms: host write own"
  ON public.rooms
  FOR ALL
  USING  (public.is_host_of(auth.uid(), property_id))
  WITH CHECK (public.is_host_of(auth.uid(), property_id));

-- Admin / super_admin full access
CREATE POLICY "rooms: admin all"
  ON public.rooms
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT             ON public.rooms TO anon;
GRANT SELECT, INSERT, UPDATE ON public.rooms TO authenticated;
GRANT ALL                ON public.rooms TO service_role;

-- Tenant scoping — hot path
CREATE INDEX IF NOT EXISTS idx_rooms_property
  ON public.rooms (property_id);

-- Active room listing per property
CREATE INDEX IF NOT EXISTS idx_rooms_property_status
  ON public.rooms (property_id, status)
  WHERE status != 'archived';

-- Used by update_property_min_price trigger
CREATE INDEX IF NOT EXISTS idx_rooms_property_price
  ON public.rooms (property_id, base_price_fcfa)
  WHERE status = 'active';

CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 7. ROOM IMAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.room_images (
  id            uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  room_id       uuid        NOT NULL,
  -- Relative path inside the 'room-images' Storage bucket:
  -- {host_id}/{property_id}/{room_id}/{uuid}.jpg
  storage_path  text        NOT NULL,
  alt           text,
  position      integer     NOT NULL DEFAULT 0,
  is_cover      boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT room_images_position_nonneg CHECK (position >= 0),

  FOREIGN KEY (room_id) REFERENCES public.rooms (id) ON DELETE CASCADE
);

ALTER TABLE public.room_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_images FORCE ROW LEVEL SECURITY;

CREATE POLICY "room_images: public read"
  ON public.room_images
  FOR SELECT
  USING (true);

-- Host manages images for own rooms
CREATE POLICY "room_images: host write own"
  ON public.room_images
  FOR ALL
  USING  (public.is_host_of_room(auth.uid(), room_id))
  WITH CHECK (public.is_host_of_room(auth.uid(), room_id));

-- Admin / super_admin full access
CREATE POLICY "room_images: admin all"
  ON public.room_images
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT                          ON public.room_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.room_images TO authenticated;
GRANT ALL                             ON public.room_images TO service_role;

-- Ordered gallery fetch
CREATE INDEX IF NOT EXISTS idx_room_images_room_position
  ON public.room_images (room_id, position);

-- Enforce at most one cover image per room at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_room_images_cover
  ON public.room_images (room_id)
  WHERE is_cover = true;


-- ============================================================
-- 8. AMENITIES MAP  (property_amenities)
-- ============================================================
-- N:N join between properties (or rooms) and the amenities catalog.
-- room_id IS NULL  → property-level amenity
-- room_id NOT NULL → room-level amenity

CREATE TABLE IF NOT EXISTS public.amenities_map (
  id            uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  property_id   uuid        NOT NULL,
  -- NULL = property-level; non-NULL = room-level amenity
  room_id       uuid,
  amenity_id    uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- Uniqueness handles both property-level (room_id IS NULL) and
  -- room-level entries correctly because Postgres UNIQUE treats
  -- each NULL as distinct; the explicit constraint below covers
  -- the non-null room case; a partial index covers the null case.
  CONSTRAINT amenities_map_unique_room_amenity
    UNIQUE NULLS NOT DISTINCT (property_id, room_id, amenity_id),

  FOREIGN KEY (property_id) REFERENCES public.properties (id) ON DELETE CASCADE,
  FOREIGN KEY (room_id)     REFERENCES public.rooms (id)      ON DELETE CASCADE,
  FOREIGN KEY (amenity_id)  REFERENCES public.amenities (id)  ON DELETE RESTRICT
);

ALTER TABLE public.amenities_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amenities_map FORCE ROW LEVEL SECURITY;

-- Amenity assignments are publicly readable
CREATE POLICY "amenities_map: public read"
  ON public.amenities_map
  FOR SELECT
  USING (true);

-- Host manages amenities for own properties
CREATE POLICY "amenities_map: host write own"
  ON public.amenities_map
  FOR ALL
  USING  (public.is_host_of(auth.uid(), property_id))
  WITH CHECK (public.is_host_of(auth.uid(), property_id));

-- Admin / super_admin full access
CREATE POLICY "amenities_map: admin all"
  ON public.amenities_map
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT                          ON public.amenities_map TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.amenities_map TO authenticated;
GRANT ALL                             ON public.amenities_map TO service_role;

-- Fetch all amenities for a property detail page
CREATE INDEX IF NOT EXISTS idx_amenities_map_property
  ON public.amenities_map (property_id);

-- Search filter: "find published properties with amenity X"
CREATE INDEX IF NOT EXISTS idx_amenities_map_amenity_property
  ON public.amenities_map (amenity_id, property_id);

-- Room-level amenity lookups
CREATE INDEX IF NOT EXISTS idx_amenities_map_room
  ON public.amenities_map (room_id)
  WHERE room_id IS NOT NULL;


-- ============================================================
-- 9. TRIGGER: VALIDATE amenities_map room_id ↔ property_id consistency
-- ============================================================
-- When room_id is non-null, the room must belong to the same property as
-- property_id on the same row. Without this check a host could associate a
-- room from a different property, corrupting amenity display and search filters.

CREATE OR REPLACE FUNCTION public.check_amenity_room_belongs_to_property()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NEW.room_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.rooms r
      WHERE r.id          = NEW.room_id
        AND r.property_id = NEW.property_id
    ) THEN
      RAISE EXCEPTION
        'amenities_map: room_id % does not belong to property_id %',
        NEW.room_id, NEW.property_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_amenities_map_room_property_check
  BEFORE INSERT OR UPDATE ON public.amenities_map
  FOR EACH ROW
  EXECUTE FUNCTION public.check_amenity_room_belongs_to_property();


-- ============================================================
-- 10. TRIGGER: UPDATE properties.min_price_fcfa
-- ============================================================
-- Fires after INSERT, UPDATE of base_price_fcfa/status, or DELETE on rooms.
-- Recomputes min_price_fcfa from all active rooms of that property.
-- Uses fully qualified names (no search_path assumption).
-- NOT SECURITY DEFINER — runs as table owner (postgres).

CREATE OR REPLACE FUNCTION public.update_property_min_price()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  _property_id uuid;
BEGIN
  -- On DELETE use OLD; on INSERT/UPDATE use NEW.
  IF TG_OP = 'DELETE' THEN
    _property_id := OLD.property_id;
  ELSE
    _property_id := NEW.property_id;
  END IF;

  UPDATE public.properties
  SET    min_price_fcfa = (
           SELECT MIN(r.base_price_fcfa)
           FROM   public.rooms r
           WHERE  r.property_id = _property_id
             AND  r.status      = 'active'::public.app_room_status
         )
  WHERE  id = _property_id;

  -- Trigger protocol: DELETE handlers must return OLD.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_property_min_price
  AFTER INSERT OR UPDATE OF base_price_fcfa, status OR DELETE
  ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_property_min_price();


-- =============================================================================
-- DOWN MIGRATION
-- =============================================================================
/*
  To roll back (execute in reverse dependency order):

  DROP TRIGGER IF EXISTS trg_update_property_min_price ON public.rooms;
  DROP FUNCTION IF EXISTS public.update_property_min_price();

  DROP TRIGGER IF EXISTS trg_amenities_map_room_property_check ON public.amenities_map;
  DROP FUNCTION IF EXISTS public.check_amenity_room_belongs_to_property();

  DROP TABLE IF EXISTS public.amenities_map;
  DROP TABLE IF EXISTS public.room_images;
  DROP TABLE IF EXISTS public.rooms;
  DROP TABLE IF EXISTS public.property_images;
  DROP TABLE IF EXISTS public.properties;
  DROP TABLE IF EXISTS public.host_profiles;

  DROP FUNCTION IF EXISTS public.is_host_of_room(uuid, uuid);
  DROP FUNCTION IF EXISTS public.is_host_of(uuid, uuid);

  DROP TYPE IF EXISTS public.app_payout_method;
  DROP TYPE IF EXISTS public.app_cancellation_policy;
  DROP TYPE IF EXISTS public.app_room_type;
  DROP TYPE IF EXISTS public.app_property_type;
  DROP TYPE IF EXISTS public.app_room_status;
  DROP TYPE IF EXISTS public.app_property_status;
  DROP TYPE IF EXISTS public.app_host_status;
*/
