-- =============================================================================
-- 0016 — Column-Level Security: prevent self-elevation via UPDATE
-- =============================================================================
-- Problem: The "profiles: users can update own row" and
-- "host_profiles: owner update" RLS policies allow authenticated users to
-- update ANY column they own, including privileged fields like
-- account_status, kyc_status, kyc_verified_at (profiles) and
-- status, superhost, verified_at, response_rate (host_profiles).
--
-- Solution: BEFORE UPDATE triggers that raise an exception when an
-- authenticated session (current_role = 'authenticated') attempts to modify
-- these columns. service_role (Edge Functions, admin ops) is exempt.
--
-- This is defense-in-depth on top of the existing RLS policies. Even if a
-- future policy change accidentally widens UPDATE access, the trigger blocks
-- sensitive column changes at the row level.
-- =============================================================================

-- ── profiles: block self-modification of privileged columns ──────────────────

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Allow service_role to bypass (admin operations, Edge Functions)
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block self-modification of privileged columns
  IF NEW.account_status    IS DISTINCT FROM OLD.account_status    THEN
    RAISE EXCEPTION 'account_status may not be modified directly';
  END IF;
  IF NEW.kyc_status        IS DISTINCT FROM OLD.kyc_status        THEN
    RAISE EXCEPTION 'kyc_status may not be modified directly';
  END IF;
  IF NEW.kyc_verified_at   IS DISTINCT FROM OLD.kyc_verified_at   THEN
    RAISE EXCEPTION 'kyc_verified_at may not be modified directly';
  END IF;
  IF NEW.suspended_at      IS DISTINCT FROM OLD.suspended_at      THEN
    RAISE EXCEPTION 'suspended_at may not be modified directly';
  END IF;
  IF NEW.suspended_reason  IS DISTINCT FROM OLD.suspended_reason  THEN
    RAISE EXCEPTION 'suspended_reason may not be modified directly';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_profile_privilege_escalation() IS
  'Blocks authenticated users from self-modifying privileged profile columns '
  '(account_status, kyc_status, kyc_verified_at, suspended_at, suspended_reason). '
  'service_role (Edge Functions / admin) is exempt. '
  'Fires BEFORE UPDATE so even super_admin updates via client JWT are blocked; '
  'admin updates must go through service_role (Edge Functions).';

DROP TRIGGER IF EXISTS trg_prevent_profile_escalation ON public.profiles;

CREATE TRIGGER trg_prevent_profile_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (current_setting('role', true) = 'authenticated')
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();


-- ── host_profiles: block self-modification of privileged columns ─────────────

CREATE OR REPLACE FUNCTION public.prevent_host_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.status       IS DISTINCT FROM OLD.status       THEN
    RAISE EXCEPTION 'host_profiles.status may not be modified directly';
  END IF;
  IF NEW.superhost    IS DISTINCT FROM OLD.superhost    THEN
    RAISE EXCEPTION 'host_profiles.superhost may not be modified directly';
  END IF;
  IF NEW.verified_at  IS DISTINCT FROM OLD.verified_at  THEN
    RAISE EXCEPTION 'host_profiles.verified_at may not be modified directly';
  END IF;
  IF NEW.response_rate IS DISTINCT FROM OLD.response_rate THEN
    RAISE EXCEPTION 'host_profiles.response_rate may not be modified directly';
  END IF;
  IF NEW.response_time_minutes IS DISTINCT FROM OLD.response_time_minutes THEN
    RAISE EXCEPTION 'host_profiles.response_time_minutes may not be modified directly';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_host_profile_privilege_escalation() IS
  'Blocks authenticated hosts from self-promoting their host_profiles.status '
  '(pending_review → verified), setting superhost, or modifying verified_at / response metrics. '
  'service_role is exempt. Mirrors the same pattern as prevent_profile_privilege_escalation.';

DROP TRIGGER IF EXISTS trg_prevent_host_profile_escalation ON public.host_profiles;

CREATE TRIGGER trg_prevent_host_profile_escalation
  BEFORE UPDATE ON public.host_profiles
  FOR EACH ROW
  WHEN (current_setting('role', true) = 'authenticated')
  EXECUTE FUNCTION public.prevent_host_profile_privilege_escalation();


-- ── booking_notes: enforce author_id = auth.uid() on INSERT ─────────────────
-- booking_notes has no INSERT RLS policy yet; restrict authors to the
-- current authenticated user (support/admin only, via existing ALL policies).

CREATE OR REPLACE FUNCTION public.enforce_booking_note_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.author_id IS NULL OR NEW.author_id != auth.uid() THEN
    RAISE EXCEPTION 'booking_notes.author_id must equal the current user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_note_author ON public.booking_notes;

CREATE TRIGGER trg_booking_note_author
  BEFORE INSERT ON public.booking_notes
  FOR EACH ROW
  WHEN (current_setting('role', true) = 'authenticated')
  EXECUTE FUNCTION public.enforce_booking_note_author();


-- ── wallet_ledger: no direct INSERT/UPDATE/DELETE by authenticated ───────────
-- Ledger entries may only be written by service_role (Edge Functions).
-- The authenticated role has no INSERT/UPDATE/DELETE grant on wallet_ledger.
-- Add an explicit REVOKE as defense-in-depth; service_role retains ALL.

REVOKE INSERT, UPDATE, DELETE ON public.wallet_ledger FROM authenticated;

COMMENT ON TABLE public.wallet_ledger IS
  'Double-entry ledger. Write access is exclusively via service_role (Edge Functions). '
  'Authenticated users may only SELECT rows they are authorised to see via RLS.';


-- ── wallet_ledger: add missing finance role SELECT policy ────────────────────
-- The finance role can read payments and payouts (added in 0006/0012) but the
-- wallet_ledger SELECT policy only covers host (own rows) and admin/super_admin.
-- Finance needs read access for reconciliation and reporting.

CREATE POLICY "wallet_ledger: finance read-all"
  ON public.wallet_ledger
  FOR SELECT
  TO authenticated
  USING ( public.has_role(auth.uid(), 'finance') );


-- ── reviews: restrict self-update to safe columns only ──────────────────────
-- The "reviews: reviewer update" policy allows any column change during the
-- 48h edit window, including reviewee_id and all rating columns.
-- A BEFORE UPDATE trigger enforces that only the allowed edit columns change.

CREATE OR REPLACE FUNCTION public.restrict_review_self_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Only allow changes to the reviewer-editable fields
  IF NEW.reviewee_id IS DISTINCT FROM OLD.reviewee_id THEN
    RAISE EXCEPTION 'reviews.reviewee_id is immutable after creation';
  END IF;
  IF NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id THEN
    RAISE EXCEPTION 'reviews.reviewer_id is immutable after creation';
  END IF;
  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id THEN
    RAISE EXCEPTION 'reviews.booking_id is immutable after creation';
  END IF;
  IF NEW.is_published IS DISTINCT FROM OLD.is_published AND
     current_setting('role', true) = 'authenticated' THEN
    RAISE EXCEPTION 'reviews.is_published may not be changed directly';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_review_self_edit ON public.reviews;

CREATE TRIGGER trg_restrict_review_self_edit
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW
  WHEN (current_setting('role', true) = 'authenticated')
  EXECUTE FUNCTION public.restrict_review_self_edit();


-- ── support_tickets: validate booking_id ownership on INSERT ────────────────

CREATE OR REPLACE FUNCTION public.validate_ticket_booking_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.bookings
      WHERE id = NEW.booking_id
        AND traveler_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'booking_id must belong to the current user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_ticket_booking_id ON public.support_tickets;

CREATE TRIGGER trg_validate_ticket_booking_id
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW
  WHEN (current_setting('role', true) = 'authenticated')
  EXECUTE FUNCTION public.validate_ticket_booking_id();
