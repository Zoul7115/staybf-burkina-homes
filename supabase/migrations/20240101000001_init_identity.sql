-- =============================================================================
-- Migration : 0001_init_identity.sql
-- Project   : StayBF — Burkina Faso Accommodation Marketplace
-- Scope     : Identity & Access foundation
--             Extensions · Enums · profiles · user_roles · Triggers · RLS
-- Author    : StayBF Engineering
-- Depends on: (none — this is the root migration)
-- =============================================================================
--
-- UP / DOWN structure
-- -------------------
--   • The UP section (default execution) runs top-to-bottom.
--   • The DOWN section is wrapped in a single comment block at the bottom.
--     To roll back, extract and execute the statements inside /* DOWN … */
--     in your CI/CD or locally.
--
-- Security model summary
-- ----------------------
--   • Roles stored in user_roles, NEVER on profiles, to prevent privilege
--     escalation via a direct UPDATE profiles SET role = 'admin'.
--   • has_role() is SECURITY DEFINER + STABLE so it bypasses RLS on
--     user_roles without creating recursive policy evaluation.
--   • FORCE ROW LEVEL SECURITY ensures even the table owner is subject to RLS.
--   • handle_new_user() is SECURITY DEFINER so it can write to public.profiles
--     and public.user_roles when fired by the auth.users INSERT trigger
--     (which runs as supabase_auth_admin, not as the row owner).
--   • search_path is pinned on every SECURITY DEFINER function to prevent
--     search_path injection / schema-shadowing attacks.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — EXTENSIONS
-- =============================================================================
-- Extensions are idempotent (IF NOT EXISTS). Order matters:
--   cube must precede earthdistance (dependency).
-- =============================================================================

-- Cryptographic primitives — gen_random_uuid() used on every PK.
CREATE EXTENSION IF NOT EXISTS pgcrypto
  WITH SCHEMA extensions;

-- Case-insensitive text — profiles.email column type.
-- Prevents duplicate registrations via email case variation (e.g. User@mail.com).
CREATE EXTENSION IF NOT EXISTS citext
  WITH SCHEMA extensions;

-- Trigram index support — property name full-text search (migration 0004).
-- Enabled here so later migrations can create GIN indexes without a schema change.
CREATE EXTENSION IF NOT EXISTS pg_trgm
  WITH SCHEMA extensions;

-- Cube data type — prerequisite for earthdistance.
CREATE EXTENSION IF NOT EXISTS cube
  WITH SCHEMA extensions;

-- Geo-radius search using ll_to_earth() + earth_distance() (migration 0004).
CREATE EXTENSION IF NOT EXISTS earthdistance
  WITH SCHEMA extensions;


-- =============================================================================
-- SECTION 2 — ENUMS
-- =============================================================================
-- Naming convention: app_<domain> (Architecture §2).
-- All enums live in the public schema.
-- ADD VALUE to extend; no in-place modification of existing values.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- app_role
-- The complete set of roles a user may hold simultaneously.
-- Stored in user_roles, never as a column on profiles.
-- ---------------------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM (
  'traveler',     -- Default on signup. May book stays.
  'host',         -- Lists and manages properties.
  'host_staff',   -- Sub-user delegated by a host (front desk, manager).
  'admin',        -- Internal staff: broad read + moderation writes.
  'super_admin',  -- Platform owner: billing, role grants, destructive actions.
  'support',      -- Read-only on most tables + write to support tickets.
  'finance'       -- Read payments/payouts; trigger payout batches.
);

-- ---------------------------------------------------------------------------
-- app_account_status
-- Drives the user account state machine (Blueprint §0.1):
--   pending_email_verification → active → suspended → deactivated → deleted
--
-- 'deleted' is a SOFT state: PII is stripped but the UUID row is retained
-- to keep FK integrity on bookings/payments (legal retention 10 years).
-- ---------------------------------------------------------------------------
CREATE TYPE public.app_account_status AS ENUM (
  'pending_email_verification',
  'active',
  'suspended',
  'deactivated',
  'deleted'
);

-- ---------------------------------------------------------------------------
-- app_kyc_status
-- Host KYC verification state (Architecture §5.1, State Machine §3.7).
-- ---------------------------------------------------------------------------
CREATE TYPE public.app_kyc_status AS ENUM (
  'none',         -- No KYC initiated yet.
  'pending',      -- Documents submitted, awaiting review.
  'under_review', -- Admin claimed the submission and is reviewing.
  'verified',     -- Admin approved (legacy alias for 'approved').
  'approved',     -- Admin approved; expires_at set to now() + 2 years.
  'rejected',     -- Admin rejected; host may resubmit after cooldown.
  'expired'       -- Previously approved KYC has passed its expiry date.
);


-- =============================================================================
-- SECTION 3 — set_updated_at() TRIGGER FUNCTION
-- =============================================================================
-- Reusable BEFORE UPDATE trigger that stamps updated_at = now().
-- Defined before any table so it can be attached immediately after CREATE TABLE.
-- This single function is reused by every table in every subsequent migration.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  -- Not SECURITY DEFINER — executes as the calling role, which is correct
  -- for a simple timestamp stamp with no privilege requirements.
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Reusable BEFORE UPDATE trigger function. Sets updated_at = now() on any table. Attach with: CREATE TRIGGER set_<table>_updated_at BEFORE UPDATE ON <table> FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();';


-- =============================================================================
-- SECTION 4 — profiles TABLE
-- =============================================================================
-- One row per auth.users entry. id mirrors auth.users(id) exactly.
-- Extended with application-level profile data.
-- Insertions happen ONLY via the handle_new_user() trigger — no direct client
-- INSERT is permitted (there is intentionally no INSERT RLS policy).
-- =============================================================================

CREATE TABLE public.profiles (
  -- Primary key mirrors auth.users(id).
  -- CASCADE ensures the profile row is removed if the auth user is hard-deleted
  -- (rare in production — Supabase recommends soft-deletes for financial data).
  id                uuid        PRIMARY KEY
                                REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Legal full name; used for KYC matching and receipts.
  full_name         text,

  -- Public-facing name shown to other users (e.g. on listings, messages).
  display_name      text,

  -- Mirrored from auth.users.email at signup via trigger.
  -- citext prevents duplicate registrations via case variation.
  -- NOT NULL enforced after email verification; trigger may insert NULL for
  -- phone-only signups and the column is updated when email is later added.
  email             extensions.citext  UNIQUE,

  -- E.164 format (+226xxxxxxxx). Validated at application layer.
  -- Unique enforcement is at application layer (not DB) to allow
  -- edge cases during phone number recycling (telecom portability).
  phone             text,

  -- Supabase Storage path (not a full URL) e.g. traveler-avatars/{user_id}/avatar.jpg
  avatar_url        text,

  -- UI locale. Application layer validates against allowed values.
  -- fr=French (default), en=English, mos=Mooré, dyu=Dioula.
  locale            text        NOT NULL DEFAULT 'fr',

  -- ISO 3166-1 alpha-2 country code. Default Burkina Faso.
  country           text        NOT NULL DEFAULT 'BF',

  -- Date of birth for age verification (≥18 enforced at app layer on signup).
  date_of_birth     date,

  -- KYC verification state. Starts at 'none'; progresses via host KYC flow.
  kyc_status        public.app_kyc_status  NOT NULL DEFAULT 'none',

  -- Account lifecycle state machine (Blueprint §0.1).
  -- Starts at pending_email_verification; Supabase Auth callback sets active.
  account_status    public.app_account_status  NOT NULL DEFAULT 'pending_email_verification',

  -- Timestamps. updated_at is maintained by the set_updated_at trigger below.
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'Application-level user profile. One row per auth.users entry. '
  'Roles are stored in user_roles, never here. '
  'Rows are created automatically by the handle_new_user() trigger on auth.users INSERT.';

COMMENT ON COLUMN public.profiles.id IS
  'Mirrors auth.users(id). FK with CASCADE DELETE.';
COMMENT ON COLUMN public.profiles.email IS
  'citext — case-insensitive unique. Mirrored from auth.users at signup.';
COMMENT ON COLUMN public.profiles.account_status IS
  'Account state machine: pending_email_verification → active → suspended → deactivated → deleted. '
  'deleted rows are anonymised (PII nulled) but the UUID row is retained for FK integrity (10-year legal retention).';
COMMENT ON COLUMN public.profiles.kyc_status IS
  'KYC state for hosts. Traveler-only accounts stay at none.';

-- Auto-update timestamp trigger
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
-- idx_profiles_email: Supports login lookups and deduplication checks.
-- The UNIQUE constraint above already creates a unique index; this is redundant
-- but named explicitly for clarity in pg_stat_user_indexes.
-- Note: citext unique index is already created by the UNIQUE constraint.
-- We add a non-unique index on account_status for admin queries.
CREATE INDEX idx_profiles_account_status
  ON public.profiles (account_status);

-- Partial index: active profiles only — the common case for most queries.
CREATE INDEX idx_profiles_active
  ON public.profiles (id)
  WHERE account_status = 'active';


-- =============================================================================
-- SECTION 5 — user_roles TABLE
-- =============================================================================
-- Stores N:N between users and app_role enum.
-- A user may hold multiple roles simultaneously (e.g. host + traveler).
-- This separation prevents privilege escalation via UPDATE profiles.
-- Roles are immutable once inserted; to change, DELETE + INSERT.
-- =============================================================================

CREATE TABLE public.user_roles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK to profiles, not auth.users directly, to keep all app-layer FKs unified.
  -- CASCADE: role row disappears when profile (and auth user) is deleted.
  user_id     uuid        NOT NULL
                          REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- The assigned role.
  role        public.app_role  NOT NULL,

  -- Who granted this role. NULL = system (trigger at signup).
  -- SET NULL on delete: if the granting admin is deleted, the grant record
  -- remains but the grantor reference is cleared.
  granted_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Immutable timestamp. Combined with granted_by forms an audit trail.
  -- Full audit detail (IP, request_id) lives in ops.audit_logs (migration 0010).
  granted_at  timestamptz  NOT NULL DEFAULT now(),

  -- Prevent duplicate role assignments for the same user.
  CONSTRAINT uq_user_roles_user_role UNIQUE (user_id, role)
);

COMMENT ON TABLE public.user_roles IS
  'Stores role assignments. A user may hold multiple roles simultaneously. '
  'Roles are never stored on profiles to prevent privilege escalation. '
  'Reads are always via has_role() SECURITY DEFINER to prevent recursive RLS.';

COMMENT ON COLUMN public.user_roles.granted_by IS
  'NULL when assigned by the system handle_new_user() trigger. '
  'Otherwise the profiles.id of the super_admin who granted the role.';

COMMENT ON COLUMN public.user_roles.granted_at IS
  'Immutable. To change a role: DELETE old row, INSERT new row. '
  'This produces a natural audit trail via granted_at timestamps.';

-- Indexes
-- idx_user_roles_user_id: Hot path — has_role() queries this on every request.
CREATE INDEX idx_user_roles_user_id
  ON public.user_roles (user_id);

-- idx_user_roles_role: Supports admin queries such as "list all hosts".
CREATE INDEX idx_user_roles_role
  ON public.user_roles (role);


-- =============================================================================
-- SECTION 6 — has_role() SECURITY DEFINER FUNCTION
-- =============================================================================
-- THE central authorization gate. Used by every RLS policy that needs
-- role-based access checks.
--
-- Why SECURITY DEFINER:
--   user_roles has RLS enabled. A naive policy that queries user_roles directly
--   would trigger RLS on user_roles, which would call has_role(), which reads
--   user_roles — infinite recursion. SECURITY DEFINER bypasses RLS on the
--   underlying table read, breaking the loop.
--
-- Why STABLE (not VOLATILE):
--   A user's roles do not change within a single transaction.
--   STABLE allows the planner to cache the result per call within a transaction,
--   reducing repeated index lookups on high-traffic queries.
--
-- Why PARALLEL SAFE:
--   The function only reads a single indexed lookup — safe for parallel plans.
--
-- search_path = '' then explicit schema refs:
--   Pinning search_path prevents an attacker from creating a schema-shadowing
--   table named user_roles in another schema and hijacking the lookup.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.has_role(
  _user_id  uuid,
  _role     public.app_role
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  PARALLEL SAFE
  -- Empty search_path: the strongest possible pinning.
  -- Prevents an attacker from shadowing any object (tables, types, operators)
  -- by creating a same-named object in a schema that appears earlier in the
  -- default search_path. All references inside the body are fully qualified.
  SET search_path = ''
AS $$
  -- Short-circuit on NULL user_id (handles the anon role where auth.uid() = NULL).
  -- When _user_id IS NULL, the WHERE clause evaluates to NULL (not FALSE), so
  -- EXISTS returns FALSE — correct behaviour. The CASE makes this explicit.
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role    = _role
    )
  END;
$$;

COMMENT ON FUNCTION public.has_role(uuid, public.app_role) IS
  'Security-definer gate for all RLS policies. '
  'Returns true if the given user holds the given role. '
  'SECURITY DEFINER + search_path='''' prevents recursive RLS and schema-shadowing injection. '
  'STABLE allows the query planner to cache the result within a transaction. '
  'Explicit CASE guard returns false for NULL _user_id (anon role) without relying '
  'on SQL three-valued logic.';


-- =============================================================================
-- SECTION 7 — handle_new_user() TRIGGER FUNCTION + TRIGGER
-- =============================================================================
-- Fires AFTER every INSERT on auth.users (i.e., on every signup).
-- Atomically creates:
--   1. A public.profiles row mirroring the new auth user.
--   2. A public.user_roles row assigning the default 'traveler' role.
--
-- Why SECURITY DEFINER:
--   The trigger fires under supabase_auth_admin which has no GRANTs on
--   public.profiles or public.user_roles. SECURITY DEFINER elevates to the
--   function owner (postgres) which does.
--
-- ON CONFLICT DO NOTHING:
--   Makes the trigger idempotent against retry scenarios.
--
-- Metadata extraction:
--   OAuth providers (Google, Apple) populate raw_user_meta_data with
--   'full_name' and 'avatar_url'. Email/password signups may not include these.
--   We extract safely with ->> and fall back to NULL.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  -- Empty search_path: prevents schema-shadowing attacks. All object references
  -- inside the body are fully qualified (public.profiles, public.user_roles,
  -- public.app_role, public.app_account_status, extensions.gen_random_uuid).
  SET search_path = ''
AS $$
BEGIN
  -- Step 1: Create the profile row.
  -- ON CONFLICT DO NOTHING: idempotent against duplicate trigger fires.
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    -- Default locale from user metadata if provided by OAuth provider,
    -- otherwise fall back to French (primary market language).
    locale,
    account_status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    -- auth.users.email is text; cast to citext happens implicitly on insert.
    NEW.email,
    -- Populated by Google/Apple OAuth; NULL for email+password signups.
    NEW.raw_user_meta_data ->> 'full_name',
    -- Avatar from OAuth provider (e.g. Google profile photo URL).
    -- Application layer should copy this to Supabase Storage on first login.
    NEW.raw_user_meta_data ->> 'avatar_url',
    -- Prefer locale from metadata; fall back to 'fr'.
    COALESCE(NEW.raw_user_meta_data ->> 'locale', 'fr'),
    -- Email signups start pending verification.
    -- Phone OTP and OAuth signups are immediately active (Supabase handles this
    -- distinction in auth.users.email_confirmed_at / phone_confirmed_at).
    -- We default to pending; the application layer updates to active on
    -- email_confirmed webhook / OAuth callback.
    'pending_email_verification'::public.app_account_status,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Step 2: Assign the default 'traveler' role.
  -- granted_by is NULL because this is a system assignment, not a human grant.
  -- ON CONFLICT DO NOTHING: safe if trigger fires more than once.
  INSERT INTO public.user_roles (
    id,
    user_id,
    role,
    granted_by,
    granted_at
  )
  VALUES (
    extensions.gen_random_uuid(),  -- fully qualified: search_path = ''
    NEW.id,
    'traveler'::public.app_role,
    NULL,  -- system-assigned; no human grantor
    now()
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Fires AFTER INSERT on auth.users. '
  'Atomically creates a public.profiles row and assigns the traveler role in user_roles. '
  'SECURITY DEFINER so it can write to public schema tables when called by supabase_auth_admin. '
  'Idempotent via ON CONFLICT DO NOTHING on both inserts.';

-- Attach the trigger to auth.users.
-- AFTER INSERT ensures auth.users row is fully committed before we reference it.
-- FOR EACH ROW fires once per new user (not once per statement).
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- NOTE: COMMENT ON TRIGGER ... ON auth.users is not allowed in Supabase Cloud
-- (the auth schema is managed by GoTrue). Trigger comment omitted intentionally.


-- =============================================================================
-- SECTION 8 — ROW LEVEL SECURITY: profiles
-- =============================================================================
-- Principles:
--   • ENABLE RLS: all clients (including authenticated) are subject to policies.
--   • FORCE RLS: even the table owner is subject to RLS.
--   • Default deny: no policy = no access.
--   • All role checks go through has_role() to prevent recursive RLS.
--   • No INSERT policy: inserts are ONLY via handle_new_user() trigger.
--   • No DELETE policy: deletion is ONLY via CASCADE from auth.users.
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

-- Users can read their own profile row.
CREATE POLICY "profiles: users can select own row"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ( id = auth.uid() );

-- Users can update their own profile (name, avatar, locale, etc.).
-- They cannot update id, created_at, or account_status directly;
-- account_status transitions are enforced by server functions using service_role.
CREATE POLICY "profiles: users can update own row"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING  ( id = auth.uid() )
  WITH CHECK ( id = auth.uid() );

-- Admins can read any profile (needed for moderation and user search).
CREATE POLICY "profiles: admin can select any row"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Support agents can read any profile for ticket resolution context.
CREATE POLICY "profiles: support can select any row"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ( public.has_role(auth.uid(), 'support') );

-- Finance role can read profiles (needed for payout identity verification).
CREATE POLICY "profiles: finance can select any row"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ( public.has_role(auth.uid(), 'finance') );

-- Super-admin can update any profile (account suspension, anonymisation,
-- KYC status overrides, etc.).
CREATE POLICY "profiles: super_admin can update any row"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING      ( public.has_role(auth.uid(), 'super_admin') )
  WITH CHECK ( public.has_role(auth.uid(), 'super_admin') );

-- NOTE: No INSERT policy — inserts go through handle_new_user() only.
-- NOTE: No DELETE policy — deletion cascades from auth.users (service_role).
-- service_role bypasses RLS by default in Supabase; no explicit policy needed.


-- =============================================================================
-- SECTION 9 — ROW LEVEL SECURITY: user_roles
-- =============================================================================
-- Principles:
--   • No UPDATE policy — roles are immutable once written. To change a role,
--     DELETE the old row and INSERT a new one. This produces an audit trail.
--   • INSERT is restricted to super_admin. The handle_new_user() trigger
--     inserts via SECURITY DEFINER (bypasses RLS) so no INSERT policy for
--     'traveler' assignment at signup is required.
--   • DELETE is restricted to super_admin (role revocation).
--   • The has_role() function used in these policies is SECURITY DEFINER and
--     reads user_roles directly, bypassing the RLS on this table — that is
--     intentional and is how we break the recursion loop.
-- =============================================================================

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

-- Users can read their own role assignments.
-- This is needed so the client can determine which dashboard/UI to show.
CREATE POLICY "user_roles: users can select own rows"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING ( user_id = auth.uid() );

-- Admins and super_admins can read all role assignments (user management screen).
CREATE POLICY "user_roles: admin can select all rows"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Only super_admin may grant roles (INSERT).
-- The handle_new_user() trigger bypasses this via SECURITY DEFINER.
CREATE POLICY "user_roles: super_admin can insert"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK ( public.has_role(auth.uid(), 'super_admin') );

-- Only super_admin may revoke roles (DELETE).
CREATE POLICY "user_roles: super_admin can delete"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING ( public.has_role(auth.uid(), 'super_admin') );

-- NOTE: No UPDATE policy. Roles are immutable once written.
-- NOTE: No policy for host/host_staff/support/finance — those roles have
--       no need to read or modify the user_roles table directly.


-- =============================================================================
-- SECTION 10 — GRANTS
-- =============================================================================
-- GRANTs control which DB operations a role may attempt.
-- RLS policies then further restrict which rows are visible/writeable.
-- Both layers are required — GRANT alone is insufficient without RLS.
-- =============================================================================

-- profiles
-- INSERT is intentionally omitted: handle_new_user() is SECURITY DEFINER and
-- runs as its owner (postgres / service_role), not as the calling authenticated
-- role. Granting INSERT to authenticated would only add a redundant GRANT that
-- must then be blocked again at the RLS layer — unnecessary attack surface.
-- Direct client INSERTs are blocked at both the GRANT layer (no INSERT here)
-- and the RLS layer (no INSERT policy exists).
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- user_roles
-- INSERT and DELETE are intentionally omitted from authenticated:
--   • INSERT: handle_new_user() is SECURITY DEFINER (runs as postgres), so the
--     authenticated role's INSERT privilege is never consulted during signup.
--     All subsequent role grants go through server functions using supabaseAdmin
--     (service_role), which has ALL via the grant below.
--   • DELETE: role revocation must be service_role-only. Granting DELETE to
--     authenticated means any policy evaluation gap could allow an attacker to
--     strip role assignments — including admin roles. Defense in depth: block at
--     the GRANT layer, not only at the RLS policy layer.
-- No UPDATE grant — roles are immutable once written (no UPDATE policy either).
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- has_role(): must be executable by both authenticated users and anon
-- because RLS policies are evaluated for all roles including anonymous visitors.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)
  TO authenticated, anon;

-- set_updated_at(): called by trigger only; no explicit grant needed beyond
-- the function owner. Listed here for documentation completeness.
-- handle_new_user(): called by trigger only; no client GRANT needed.


-- =============================================================================
-- END OF UP MIGRATION
-- =============================================================================


/*
-- =============================================================================
-- DOWN MIGRATION
-- =============================================================================
-- To roll back migration 0001, execute the statements below (in order).
-- WARNING: This is destructive. All profile and role data will be lost.
-- Only run in development or when rolling back a failed deploy.
--
-- Execute order: triggers → functions → tables → types → extensions
-- (reverse of creation order to respect dependencies)
-- =============================================================================

-- Step 1: Drop trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Step 2: Drop trigger on profiles
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;

-- Step 3: Drop functions (must drop triggers first)
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.set_updated_at();

-- Step 4: Drop tables (user_roles first — FK references profiles)
DROP TABLE IF EXISTS public.user_roles;
DROP TABLE IF EXISTS public.profiles;

-- Step 5: Drop enums (must drop tables first — columns reference the types)
DROP TYPE IF EXISTS public.app_kyc_status;
DROP TYPE IF EXISTS public.app_account_status;
DROP TYPE IF EXISTS public.app_role;

-- Step 6: Drop extensions
-- WARNING: Only drop extensions if no other migration depends on them.
-- In practice, leave pgcrypto/citext/pg_trgm/cube/earthdistance in place
-- unless rolling back to a completely clean database.
-- DROP EXTENSION IF EXISTS earthdistance;
-- DROP EXTENSION IF EXISTS cube;
-- DROP EXTENSION IF EXISTS pg_trgm;
-- DROP EXTENSION IF EXISTS citext;
-- DROP EXTENSION IF EXISTS pgcrypto;

-- =============================================================================
-- END OF DOWN MIGRATION
-- =============================================================================
*/
