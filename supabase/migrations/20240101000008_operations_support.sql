-- =============================================================================
-- Migration 0008 — Operations & Support
-- Scope : support_tickets, ticket_messages, ticket_attachments,
--         moderation_queue, review_reports, host_verifications,
--         audit_logs (partitioned), admin_actions
-- Depends on : 0001 (profiles, has_role, app_role, app_kyc_status,
--                    set_updated_at)
--              0003 (rooms, properties, host_profiles, is_host_of_room)
--              0005 (bookings, is_traveler_of_booking)
--              0007 (reviews)
-- Author: StayBF
-- =============================================================================


-- ============================================================
-- 1. ENUMS
-- ============================================================

-- Extend existing KYC status with operational lifecycle states.
-- ADD VALUE IF NOT EXISTS is idempotent: on fresh databases the values are
-- already present (defined in 0001); on existing databases where 0001 ran
-- before this fix they are added here.  The restriction that prevents using
-- a newly-added enum value in DDL within the same transaction is avoided by
-- casting to ::text in the CHECK constraint and the partial index below.
ALTER TYPE public.app_kyc_status ADD VALUE IF NOT EXISTS 'under_review';
ALTER TYPE public.app_kyc_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.app_kyc_status ADD VALUE IF NOT EXISTS 'expired';

-- Support ticket state machine (7 states; Revenue doc §3.9)
CREATE TYPE public.app_ticket_status AS ENUM (
  'open',
  'in_progress',
  'waiting_on_traveler',
  'waiting_on_host',
  'escalated',
  'resolved',
  'closed'
);

-- SLA tiers: P1=2 h, P2=8 h, P3=24 h (Business Logic Blueprint §23)
CREATE TYPE public.app_ticket_priority AS ENUM (
  'p1',
  'p2',
  'p3'
);

CREATE TYPE public.app_ticket_category AS ENUM (
  'booking_issue',
  'payment_issue',
  'account_issue',
  'property_issue',
  'safety',
  'other'
);

-- Moderation lifecycle (shared by moderation_queue and review_reports)
CREATE TYPE public.app_moderation_status AS ENUM (
  'pending',
  'under_review',
  'approved',       -- content cleared; no action taken
  'rejected',       -- content actioned / removed
  'escalated',
  'dismissed',      -- report filed in error; no action needed
  'auto_approved'   -- passed automated checks without human review
);

-- Polymorphic content type for the moderation queue (no FK by design)
CREATE TYPE public.app_moderation_content_type AS ENUM (
  'review',
  'property',
  'room',
  'profile',
  'message'
);

-- KYC identity document types
CREATE TYPE public.app_kyc_document_type AS ENUM (
  'national_id',
  'passport',
  'residence_permit',
  'business_license'
);

-- Structured admin action vocabulary for admin_actions
CREATE TYPE public.app_admin_action_type AS ENUM (
  'kyc_approve',
  'kyc_reject',
  'booking_cancel',
  'account_suspend',
  'account_reinstate',
  'room_unpublish',
  'property_unpublish',
  'review_remove',
  'refund_issue',
  'payout_manual',
  'ticket_escalate',
  'ticket_close',
  'content_flag_dismiss',
  'account_erase'
);

-- Comprehensive audit event vocabulary covering all domains
CREATE TYPE public.app_audit_action AS ENUM (
  -- user / identity lifecycle
  'user_created',          'user_updated',          'user_suspended',
  'user_reinstated',       'user_deleted',          'user_erased',
  -- KYC
  'kyc_submitted',         'kyc_approved',          'kyc_rejected',
  'kyc_expired',           'kyc_document_purged',   'kyc_record_purged',
  -- catalog
  'property_created',      'property_updated',      'property_published',
  'property_unpublished',  'property_deleted',
  'room_created',          'room_updated',          'room_published',
  'room_unpublished',
  -- booking
  'booking_created',       'booking_confirmed',     'booking_cancelled',
  'booking_completed',     'booking_expired',       'booking_disputed',
  -- payments
  'payment_initiated',     'payment_captured',      'payment_failed',
  'payment_refunded',
  -- payouts
  'payout_initiated',      'payout_completed',      'payout_failed',
  'payout_manual_override',
  -- reviews
  'review_created',        'review_approved',       'review_rejected',
  'review_removed',
  -- support
  'ticket_created',        'ticket_assigned',       'ticket_escalated',
  'ticket_resolved',       'ticket_closed',
  -- moderation
  'moderation_queued',     'moderation_resolved',
  -- admin
  'admin_action_executed',
  -- erasure
  'account_erased',
  -- analytics / automation partition lifecycle (used in migration 0009)
  'audit_log_partition_dropped',
  'analytics_partition_dropped',
  'analytics_partition_skipped',
  -- storage lifecycle (used in migration 0010)
  'file_uploaded',
  'file_deleted',
  'file_scan_infected',
  'file_purged',
  'kyc_document_accessed'
);

-- Reasons a user may report a review
CREATE TYPE public.app_review_report_reason AS ENUM (
  'inappropriate_content',
  'false_information',
  'spam',
  'harassment',
  'conflict_of_interest',
  'other'
);


-- ============================================================
-- 2. SEQUENCES
-- ============================================================

-- Generates human-readable ticket numbers: TKT-000001, TKT-000002, …
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq
  START 1 INCREMENT 1 NO CYCLE;


-- ============================================================
-- 3. SUPPORT_TICKETS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                uuid                        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  -- Human-readable identifier surfaced in all user-facing communications.
  ticket_number     text                        NOT NULL UNIQUE
                      DEFAULT 'TKT-' || lpad(nextval('public.ticket_number_seq')::text, 6, '0'),
  -- Nullable for GDPR account-deletion: profile deleted → SET NULL; record
  -- persists for 36-month retention window.
  requester_id      uuid,
  -- Admin who currently owns this ticket; SET NULL on profile deletion.
  assigned_to       uuid,
  -- Optional context references; SET NULL if parent record is deleted.
  booking_id        uuid,
  property_id       uuid,
  status            public.app_ticket_status    NOT NULL DEFAULT 'open',
  priority          public.app_ticket_priority  NOT NULL DEFAULT 'p3',
  category          public.app_ticket_category  NOT NULL,
  subject           text                        NOT NULL,
  -- Set by server function on first admin reply.
  first_response_at timestamptz,
  -- Set by set_ticket_sla() BEFORE INSERT trigger based on priority.
  sla_due_at        timestamptz                 NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  closed_at         timestamptz,
  created_at        timestamptz                 NOT NULL DEFAULT now(),
  updated_at        timestamptz                 NOT NULL DEFAULT now(),

  CONSTRAINT support_tickets_subject_len CHECK (
    char_length(subject) BETWEEN 5 AND 200
  ),
  CONSTRAINT support_tickets_resolved_after_created CHECK (
    resolved_at IS NULL OR resolved_at >= created_at
  ),
  CONSTRAINT support_tickets_closed_after_resolved CHECK (
    closed_at IS NULL
    OR (resolved_at IS NOT NULL AND closed_at >= resolved_at)
  ),
  CONSTRAINT support_tickets_sla_not_before_created CHECK (
    sla_due_at >= created_at
  ),

  FOREIGN KEY (requester_id) REFERENCES public.profiles   (id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to)  REFERENCES public.profiles   (id) ON DELETE SET NULL,
  FOREIGN KEY (booking_id)   REFERENCES public.bookings   (id) ON DELETE SET NULL,
  FOREIGN KEY (property_id)  REFERENCES public.properties (id) ON DELETE SET NULL
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets FORCE ROW LEVEL SECURITY;

-- Requester reads own tickets
CREATE POLICY "support_tickets: requester read own"
  ON public.support_tickets
  FOR SELECT
  USING (requester_id = auth.uid());

-- Requester opens tickets on their own behalf
CREATE POLICY "support_tickets: requester insert"
  ON public.support_tickets
  FOR INSERT
  WITH CHECK (requester_id = auth.uid());

-- Admin / super_admin full access
CREATE POLICY "support_tickets: admin all"
  ON public.support_tickets
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Authenticated: INSERT (open ticket) + SELECT (read own via RLS).
-- UPDATE is reserved for admin and server functions; omitted here.
GRANT SELECT, INSERT             ON public.support_tickets TO authenticated;
GRANT ALL                        ON public.support_tickets TO service_role;
-- Sequence access required for the DEFAULT ticket_number expression.
GRANT USAGE                      ON SEQUENCE public.ticket_number_seq TO authenticated;
GRANT USAGE, SELECT              ON SEQUENCE public.ticket_number_seq TO service_role;

-- Admin dashboard: open tickets sorted by SLA breach
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority
  ON public.support_tickets (status, priority, sla_due_at);

-- Requester inbox: all tickets for a user
CREATE INDEX IF NOT EXISTS idx_support_tickets_requester
  ON public.support_tickets (requester_id, created_at DESC)
  WHERE requester_id IS NOT NULL;

-- Admin assignment queue
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned
  ON public.support_tickets (assigned_to, status)
  WHERE assigned_to IS NOT NULL;

-- Booking-linked ticket lookup
CREATE INDEX IF NOT EXISTS idx_support_tickets_booking
  ON public.support_tickets (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 4. HELPER: is_ticket_requester
-- ============================================================
-- Used by RLS policies on ticket_messages and ticket_attachments.
-- SECURITY DEFINER prevents recursive RLS on support_tickets.

CREATE OR REPLACE FUNCTION public.is_ticket_requester(
  _user_id   uuid,
  _ticket_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.support_tickets
    WHERE  id           = _ticket_id
      AND  requester_id = _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_ticket_requester(uuid, uuid)
  TO authenticated;


-- ============================================================
-- 5. TICKET_MESSAGES
-- ============================================================
-- Append-only: no UPDATE or DELETE granted to authenticated.
-- is_internal = true messages are admin-only notes, hidden from the requester.

CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id          uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  ticket_id   uuid        NOT NULL,
  -- Nullable: SET NULL when sender's profile is deleted.
  sender_id   uuid,
  body        text        NOT NULL,
  is_internal boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ticket_messages_body_len CHECK (
    char_length(body) BETWEEN 1 AND 10000
  ),

  FOREIGN KEY (ticket_id) REFERENCES public.support_tickets (id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES public.profiles        (id) ON DELETE SET NULL
);

ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages FORCE ROW LEVEL SECURITY;

-- Requester reads non-internal messages on own tickets only
CREATE POLICY "ticket_messages: requester read"
  ON public.ticket_messages
  FOR SELECT
  USING (
    is_internal = false
    AND public.is_ticket_requester(auth.uid(), ticket_id)
  );

-- Requester appends messages to own tickets (never internal)
CREATE POLICY "ticket_messages: requester insert"
  ON public.ticket_messages
  FOR INSERT
  WITH CHECK (
    sender_id   = auth.uid()
    AND is_internal = false
    AND public.is_ticket_requester(auth.uid(), ticket_id)
  );

-- Admin full access (including internal notes)
CREATE POLICY "ticket_messages: admin all"
  ON public.ticket_messages
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Append-only at the GRANT layer: no UPDATE or DELETE for authenticated.
GRANT SELECT, INSERT ON public.ticket_messages TO authenticated;
GRANT ALL            ON public.ticket_messages TO service_role;

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket
  ON public.ticket_messages (ticket_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender
  ON public.ticket_messages (sender_id)
  WHERE sender_id IS NOT NULL;


-- ============================================================
-- 6. TICKET_ATTACHMENTS
-- ============================================================
-- Metadata for files in the 'support-attachments' private Storage bucket.
-- Path convention: {ticket_id}/{message_id}/{uuid}.{ext}
-- No INSERT for authenticated: upload flow is server-function-gated.
-- Immutable after insert (no updated_at, no UPDATE grant).

CREATE TABLE IF NOT EXISTS public.ticket_attachments (
  id          uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  ticket_id   uuid        NOT NULL,
  message_id  uuid        NOT NULL,
  -- Nullable: SET NULL when uploader's profile is deleted.
  uploader_id uuid,
  file_path   text        NOT NULL,
  file_name   text        NOT NULL,
  mime_type   text        NOT NULL,
  size_bytes  integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ticket_attachments_size CHECK (
    size_bytes > 0 AND size_bytes <= 10485760  -- 10 MB
  ),
  CONSTRAINT ticket_attachments_mime CHECK (
    mime_type IN (
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
    )
  ),
  CONSTRAINT ticket_attachments_filename_len CHECK (
    char_length(file_name) BETWEEN 1 AND 255
  ),
  CONSTRAINT ticket_attachments_path_len CHECK (
    char_length(file_path) BETWEEN 1 AND 1000
  ),

  FOREIGN KEY (ticket_id)   REFERENCES public.support_tickets (id) ON DELETE CASCADE,
  FOREIGN KEY (message_id)  REFERENCES public.ticket_messages (id) ON DELETE CASCADE,
  FOREIGN KEY (uploader_id) REFERENCES public.profiles        (id) ON DELETE SET NULL
);

ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments FORCE ROW LEVEL SECURITY;

-- Requester reads attachments on non-internal messages for own tickets
CREATE POLICY "ticket_attachments: requester read"
  ON public.ticket_attachments
  FOR SELECT
  USING (
    public.is_ticket_requester(auth.uid(), ticket_id)
    AND NOT EXISTS (
      SELECT 1
      FROM   public.ticket_messages tm
      WHERE  tm.id          = message_id
        AND  tm.is_internal = true
    )
  );

-- Admin full access
CREATE POLICY "ticket_attachments: admin all"
  ON public.ticket_attachments
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- No INSERT for authenticated: server function generates signed upload URL,
-- verifies Storage object exists, then INSERTs via service_role.
GRANT SELECT ON public.ticket_attachments TO authenticated;
GRANT ALL    ON public.ticket_attachments TO service_role;

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket
  ON public.ticket_attachments (ticket_id);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_message
  ON public.ticket_attachments (message_id);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_uploader
  ON public.ticket_attachments (uploader_id)
  WHERE uploader_id IS NOT NULL;


-- ============================================================
-- 7. MODERATION_QUEUE
-- ============================================================
-- Polymorphic content moderation queue.  content_id carries no FK
-- constraint because the target may be a review, property, room,
-- profile, or message — cross-table references cannot use FK.
-- Ownership of content_id is validated at the application layer.

CREATE TABLE IF NOT EXISTS public.moderation_queue (
  id               uuid                               PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  content_type     public.app_moderation_content_type NOT NULL,
  content_id       uuid                               NOT NULL,
  -- Who triggered the moderation entry (NULL for system-generated entries).
  reported_by      uuid,
  assigned_to      uuid,
  status           public.app_moderation_status       NOT NULL DEFAULT 'pending',
  priority         public.app_ticket_priority         NOT NULL DEFAULT 'p3',
  reason           text,
  resolution_notes text,
  resolved_by      uuid,
  resolved_at      timestamptz,
  created_at       timestamptz                        NOT NULL DEFAULT now(),
  updated_at       timestamptz                        NOT NULL DEFAULT now(),

  -- Resolution must include notes and a resolver identity
  CONSTRAINT moderation_queue_resolution_notes CHECK (
    status NOT IN (
      'approved'::public.app_moderation_status,
      'rejected'::public.app_moderation_status,
      'dismissed'::public.app_moderation_status
    )
    OR resolution_notes IS NOT NULL
  ),
  CONSTRAINT moderation_queue_resolved_has_resolver CHECK (
    resolved_at IS NULL OR resolved_by IS NOT NULL
  ),

  FOREIGN KEY (reported_by) REFERENCES public.profiles (id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES public.profiles (id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by) REFERENCES public.profiles (id) ON DELETE SET NULL
);

ALTER TABLE public.moderation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_queue FORCE ROW LEVEL SECURITY;

-- Admin / super_admin full access; no access for regular authenticated users
CREATE POLICY "moderation_queue: admin all"
  ON public.moderation_queue
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- GRANT covers admin role (which has authenticated); RLS restricts non-admins.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.moderation_queue TO authenticated;
GRANT ALL                             ON public.moderation_queue TO service_role;

-- Admin dashboard: pending items by priority and age
CREATE INDEX IF NOT EXISTS idx_moderation_queue_status_priority
  ON public.moderation_queue (status, priority, created_at)
  WHERE status IN ('pending', 'under_review', 'escalated');

-- Content lookup: "find all queue entries for review X"
CREATE INDEX IF NOT EXISTS idx_moderation_queue_content
  ON public.moderation_queue (content_type, content_id);

-- Assignment queue
CREATE INDEX IF NOT EXISTS idx_moderation_queue_assigned
  ON public.moderation_queue (assigned_to, status)
  WHERE assigned_to IS NOT NULL;

CREATE TRIGGER trg_moderation_queue_updated_at
  BEFORE UPDATE ON public.moderation_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 8. REVIEW_REPORTS
-- ============================================================
-- Users report policy-violating reviews.  On INSERT the
-- auto_enqueue_review_report() trigger creates a moderation_queue entry
-- for the review if one is not already active.

CREATE TABLE IF NOT EXISTS public.review_reports (
  id          uuid                            PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  review_id   uuid                            NOT NULL,
  -- Nullable: SET NULL when reporter's profile is deleted.
  reporter_id uuid,
  reason      public.app_review_report_reason NOT NULL,
  details     text,
  status      public.app_moderation_status    NOT NULL DEFAULT 'pending',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at  timestamptz                     NOT NULL DEFAULT now(),
  updated_at  timestamptz                     NOT NULL DEFAULT now(),

  CONSTRAINT review_reports_details_len CHECK (
    details IS NULL OR char_length(details) <= 2000
  ),
  CONSTRAINT review_reports_resolved_has_resolver CHECK (
    resolved_at IS NULL OR resolved_by IS NOT NULL
  ),

  -- One active report per (reviewer, review) pair prevents duplicate spam.
  CONSTRAINT uq_review_report_per_reporter
    UNIQUE (review_id, reporter_id),

  FOREIGN KEY (review_id)   REFERENCES public.reviews  (id) ON DELETE CASCADE,
  FOREIGN KEY (reporter_id) REFERENCES public.profiles (id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by) REFERENCES public.profiles (id) ON DELETE SET NULL
);

ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_reports FORCE ROW LEVEL SECURITY;

-- Reporter reads own reports
CREATE POLICY "review_reports: reporter read own"
  ON public.review_reports
  FOR SELECT
  USING (reporter_id = auth.uid());

-- Authenticated users submit reports on their own behalf
CREATE POLICY "review_reports: reporter insert"
  ON public.review_reports
  FOR INSERT
  WITH CHECK (reporter_id = auth.uid());

-- Admin full access (resolution path)
CREATE POLICY "review_reports: admin all"
  ON public.review_reports
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Reporters may not update their own submitted reports.
GRANT SELECT, INSERT ON public.review_reports TO authenticated;
GRANT ALL            ON public.review_reports TO service_role;

CREATE INDEX IF NOT EXISTS idx_review_reports_review
  ON public.review_reports (review_id, status);

CREATE INDEX IF NOT EXISTS idx_review_reports_reporter
  ON public.review_reports (reporter_id)
  WHERE reporter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_review_reports_pending
  ON public.review_reports (created_at)
  WHERE status = 'pending';

CREATE TRIGGER trg_review_reports_updated_at
  BEFORE UPDATE ON public.review_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 9. HOST_VERIFICATIONS
-- ============================================================
-- One row per KYC submission attempt.  Resubmission after rejection
-- or expiry creates a new row; the previous row is kept as audit trail.
--
-- Sensitive fields:
--   document_number_enc — libsodium sealed-box encrypted at application
--                         layer before INSERT; same pattern as
--                         host_profiles.payout_account.
--   document_path       — Storage path in the 'kyc-documents' private
--                         bucket. Convention:
--                         kyc/{host_id}/{id}/{document_type}-{uuid}.{ext}
--
-- Retention (see §4 of design document):
--   Storage object deleted after 24 months from reviewed_at.
--   Row retained 36 months from reviewed_at (for KYC/AML compliance).
--   pg_cron job in Migration 0009 handles both.

CREATE TABLE IF NOT EXISTS public.host_verifications (
  id                  uuid                         PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  -- Nullable to allow profile deletion while retaining the KYC record
  -- for regulatory compliance.  ON DELETE RESTRICT would block GDPR erasure.
  host_id             uuid,
  document_type       public.app_kyc_document_type NOT NULL,
  -- Encrypted at application layer; NULL until document is uploaded.
  -- Nulled by GDPR erasure flow.
  document_number_enc text,
  -- Storage path; NULL until upload confirmed.  Nulled by retention purge.
  document_path       text,
  status              public.app_kyc_status        NOT NULL DEFAULT 'pending',
  -- Set when an admin claims the submission (pending → under_review).
  reviewer_id         uuid,
  -- Set by validate_kyc_transition() on approval or rejection.
  reviewed_at         timestamptz,
  -- Required when status = 'rejected' (enforced by validate_kyc_transition).
  rejection_reason    text,
  -- Set by validate_kyc_transition() on approval: now() + 2 years.
  expires_at          timestamptz,
  created_at          timestamptz                  NOT NULL DEFAULT now(),
  updated_at          timestamptz                  NOT NULL DEFAULT now(),

  CONSTRAINT host_verifications_rejection_needs_reason CHECK (
    status != 'rejected'::public.app_kyc_status
    OR (rejection_reason IS NOT NULL AND char_length(rejection_reason) >= 5)
  ),
  CONSTRAINT host_verifications_approved_has_expiry CHECK (
    -- Cast to text to avoid "new enum value used in same transaction" error
    -- when this migration adds 'approved' via ALTER TYPE ADD VALUE above.
    status::text != 'approved'
    OR expires_at IS NOT NULL
  ),
  -- While pending, no reviewer should be assigned yet.
  CONSTRAINT host_verifications_pending_no_reviewer CHECK (
    status != 'pending'::public.app_kyc_status
    OR (reviewer_id IS NULL AND reviewed_at IS NULL)
  ),

  FOREIGN KEY (host_id)     REFERENCES public.profiles (id) ON DELETE SET NULL,
  FOREIGN KEY (reviewer_id) REFERENCES public.profiles (id) ON DELETE SET NULL
);

-- uq_host_verifications_active is intentionally created in migration 0009.
-- Reason: index predicates require IMMUTABLE functions; the enum values
-- 'under_review' and 'approved' are added via ALTER TYPE ADD VALUE above in
-- this same transaction, so they cannot be used as typed enum literals in an
-- index predicate here (PostgreSQL raises "unsafe use of new enum value").
-- The ::text workaround is also forbidden (enum→text cast is not IMMUTABLE).
-- Migration 0009 runs in a new transaction after this one commits, at which
-- point the enum values are fully committed and usable in index predicates.

ALTER TABLE public.host_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_verifications FORCE ROW LEVEL SECURITY;

-- Host reads own submissions (all statuses, including historical rejected rows)
CREATE POLICY "host_verifications: host read own"
  ON public.host_verifications
  FOR SELECT
  USING (host_id = auth.uid());

-- No INSERT or UPDATE for authenticated: all writes are server-function-gated
-- (service_role).  INSERT creates the row after confirming Storage upload.
-- Status transitions go through validate_kyc_transition() trigger.

-- Admin full access
CREATE POLICY "host_verifications: admin all"
  ON public.host_verifications
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT ON public.host_verifications TO authenticated;
GRANT ALL    ON public.host_verifications TO service_role;

-- Host dashboard: submission history sorted by recency
CREATE INDEX IF NOT EXISTS idx_host_verifications_host
  ON public.host_verifications (host_id, created_at DESC)
  WHERE host_id IS NOT NULL;

-- idx_host_verifications_review_queue and idx_host_verifications_expiry are
-- created in migration 0009 for the same reason as uq_host_verifications_active:
-- their WHERE predicates use 'under_review' and 'approved' from app_kyc_status,
-- which are added via ALTER TYPE ADD VALUE above in this same transaction.
-- Index predicates require IMMUTABLE functions; typed enum literals added in the
-- same transaction are not yet committed and cause "unsafe use of new enum value".

-- Retention purge job: approved/rejected docs past 24-month storage window
CREATE INDEX IF NOT EXISTS idx_host_verifications_retention
  ON public.host_verifications (reviewed_at)
  WHERE reviewed_at IS NOT NULL AND document_path IS NOT NULL;

CREATE TRIGGER trg_host_verifications_updated_at
  BEFORE UPDATE ON public.host_verifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 10. AUDIT_LOGS (partitioned)
-- ============================================================
-- Append-only, monthly range partitions.  Retention: 24 months rolling.
-- Partition drop (not row DELETE) is the sole deletion mechanism.
--
-- No FK constraints on actor_id or target_id because:
--   1. Partitioned tables make FK maintenance expensive.
--   2. Both the actor and the target may be deleted; the audit record
--      must survive for the full 24-month window regardless.
--   3. actor_role is a denormalized snapshot — the role is captured at
--      the moment of the action and is correct even if the role changes.
--
-- Composite primary key (id, occurred_at) is required by Postgres for
-- partitioned tables; the range key must be part of the PK.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           uuid                    NOT NULL DEFAULT extensions.gen_random_uuid(),
  occurred_at  timestamptz             NOT NULL DEFAULT now(),
  actor_id     uuid,
  actor_role   text,
  action       public.app_audit_action NOT NULL,
  target_type  text                    NOT NULL,
  target_id    uuid,
  before_state jsonb,
  after_state  jsonb,
  ip_address   inet,
  user_agent   text,
  metadata     jsonb,

  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

-- Admins may query the audit trail; no other role may SELECT.
-- INSERT / UPDATE / DELETE exclusively via log_audit_event() SECURITY DEFINER
-- function (which executes as the function owner and bypasses GRANT checks).
CREATE POLICY "audit_logs: admin read"
  ON public.audit_logs
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL    ON public.audit_logs TO service_role;

-- Indexes on the parent propagate to each partition as LOCAL indexes.

-- "All actions by actor X in the last N days"
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON public.audit_logs (actor_id, occurred_at)
  WHERE actor_id IS NOT NULL;

-- "Full history of booking / property / profile Y"
CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON public.audit_logs (target_type, target_id, occurred_at)
  WHERE target_id IS NOT NULL;

-- "All kyc_approved events this month"
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs (action, occurred_at);

-- -------------------------------------------------------
-- 10a. Initial partitions
-- -------------------------------------------------------
-- Partitions created for today (2026-06-02) through Q1 2027.
-- pg_cron in Migration 0009 creates future partitions automatically
-- via create_audit_partition() one month ahead.

CREATE TABLE IF NOT EXISTS public.audit_logs_2026_06
  PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE IF NOT EXISTS public.audit_logs_2026_07
  PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE IF NOT EXISTS public.audit_logs_2026_08
  PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE IF NOT EXISTS public.audit_logs_2026_09
  PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE IF NOT EXISTS public.audit_logs_2026_10
  PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE IF NOT EXISTS public.audit_logs_2026_11
  PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE IF NOT EXISTS public.audit_logs_2026_12
  PARTITION OF public.audit_logs
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS public.audit_logs_2027_01
  PARTITION OF public.audit_logs
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE IF NOT EXISTS public.audit_logs_2027_02
  PARTITION OF public.audit_logs
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE IF NOT EXISTS public.audit_logs_2027_03
  PARTITION OF public.audit_logs
  FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');


-- ============================================================
-- 11. ADMIN_ACTIONS
-- ============================================================
-- Human-readable record of every consequential admin decision.
-- Pairs with audit_logs: admin_actions captures intent and rationale;
-- audit_logs captures before/after state.
-- Each admin_action row corresponds to one or more audit_log entries;
-- those entries carry {"admin_action_id": "..."} in metadata.
--
-- Immutability: only notified_at and resolved_at may be updated after
-- insert (enforced by enforce_admin_action_immutability() trigger).

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id           uuid                         PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  admin_id     uuid                         NOT NULL,
  action_type  public.app_admin_action_type NOT NULL,
  target_type  text                         NOT NULL,
  target_id    uuid,
  reason       text                         NOT NULL,
  -- Internal notes not surfaced to the affected user
  notes        text,
  -- Set by server function after notification is dispatched to affected user
  notified_at  timestamptz,
  -- Set when the action is fully resolved (e.g. appeal concluded)
  resolved_at  timestamptz,
  created_at   timestamptz                  NOT NULL DEFAULT now(),

  CONSTRAINT admin_actions_reason_min_len CHECK (
    char_length(reason) >= 10
  ),
  CONSTRAINT admin_actions_target_type_len CHECK (
    char_length(target_type) BETWEEN 1 AND 100
  ),

  FOREIGN KEY (admin_id) REFERENCES public.profiles (id) ON DELETE RESTRICT
);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_actions FORCE ROW LEVEL SECURITY;

-- Admin / super_admin: read, create, and update resolution fields
CREATE POLICY "admin_actions: admin all"
  ON public.admin_actions
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- No access for regular authenticated users.  The target of an admin
-- action is notified via the notifications table, not by reading this table.
-- UPDATE allowed for admins to set notified_at and resolved_at;
-- immutability trigger prevents all other field changes.
GRANT SELECT, INSERT, UPDATE ON public.admin_actions TO authenticated;
GRANT ALL                    ON public.admin_actions TO service_role;

-- Admin history for a specific admin user
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin
  ON public.admin_actions (admin_id, created_at DESC);

-- "All admin actions targeting booking / profile / property Y"
CREATE INDEX IF NOT EXISTS idx_admin_actions_target
  ON public.admin_actions (target_type, target_id);

-- "All account_suspend actions this month"
CREATE INDEX IF NOT EXISTS idx_admin_actions_type
  ON public.admin_actions (action_type, created_at DESC);

-- Actions pending notification dispatch
CREATE INDEX IF NOT EXISTS idx_admin_actions_pending_notify
  ON public.admin_actions (created_at)
  WHERE notified_at IS NULL;


-- ============================================================
-- 12. HELPER FUNCTIONS
-- ============================================================

-- -------------------------------------------------------
-- 12a. log_audit_event
-- -------------------------------------------------------
-- Inserts a row into audit_logs.  SECURITY DEFINER so that server
-- functions running with an authenticated JWT can write to audit_logs
-- without requiring a direct INSERT grant (which would allow arbitrary
-- client-side audit log injection).  Called exclusively from server
-- functions; never invoked from browser-side client code.

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_actor_id    uuid,
  p_actor_role  text,
  p_action      public.app_audit_action,
  p_target_type text,
  p_target_id   uuid          DEFAULT NULL,
  p_before      jsonb         DEFAULT NULL,
  p_after       jsonb         DEFAULT NULL,
  p_ip_address  inet          DEFAULT NULL,
  p_user_agent  text          DEFAULT NULL,
  p_metadata    jsonb         DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    actor_id,    actor_role,  action,       target_type,  target_id,
    before_state, after_state, ip_address,  user_agent,   metadata
  ) VALUES (
    p_actor_id,  p_actor_role, p_action,    p_target_type, p_target_id,
    p_before,    p_after,      p_ip_address, p_user_agent,  p_metadata
  );
END;
$$;

-- EXECUTE granted to service_role only.  Authenticated users invoke this
-- indirectly via server functions; no direct client access is intended.
GRANT EXECUTE ON FUNCTION public.log_audit_event(
  uuid, text, public.app_audit_action, text,
  uuid, jsonb, jsonb, inet, text, jsonb
) TO service_role;


-- -------------------------------------------------------
-- 12b. create_audit_partition
-- -------------------------------------------------------
-- Creates the audit_logs partition for the given year and month.
-- Called monthly by the pg_cron job registered in Migration 0009
-- to ensure the next month's partition exists before data arrives.

CREATE OR REPLACE FUNCTION public.create_audit_partition(
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
  v_sql        text;
BEGIN
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'create_audit_partition: month must be between 1 and 12 (got %)',
      p_month USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_start_date := make_date(p_year, p_month, 1);
  v_end_date   := v_start_date + interval '1 month';
  v_table_name := format(
    'audit_logs_%s_%s',
    p_year,
    lpad(p_month::text, 2, '0')
  );

  v_sql := format(
    $sql$
      CREATE TABLE IF NOT EXISTS public.%I
        PARTITION OF public.audit_logs
        FOR VALUES FROM (%L) TO (%L)
    $sql$,
    v_table_name,
    v_start_date,
    v_end_date
  );

  EXECUTE v_sql;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_audit_partition(integer, integer)
  TO service_role;


-- -------------------------------------------------------
-- 12c. set_ticket_sla  (trigger function)
-- -------------------------------------------------------
-- Fires BEFORE INSERT OR UPDATE OF priority on support_tickets.
-- Sets sla_due_at based on the current priority value.
-- On priority change, SLA is recalculated from the original created_at
-- so that reprioritisation cannot be used to extend the SLA clock.

CREATE OR REPLACE FUNCTION public.set_ticket_sla()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  NEW.sla_due_at := CASE NEW.priority
    WHEN 'p1'::public.app_ticket_priority THEN NEW.created_at + interval '2 hours'
    WHEN 'p2'::public.app_ticket_priority THEN NEW.created_at + interval '8 hours'
    WHEN 'p3'::public.app_ticket_priority THEN NEW.created_at + interval '24 hours'
    ELSE                                       NEW.created_at + interval '24 hours'
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_ticket_sla
  BEFORE INSERT OR UPDATE OF priority ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ticket_sla();


-- -------------------------------------------------------
-- 12d. validate_ticket_transition  (trigger function)
-- -------------------------------------------------------
-- Enforces the support ticket state machine (Revenue doc §3.9).
--
-- Allowed transitions:
--   open                → in_progress | escalated
--   in_progress         → waiting_on_traveler | waiting_on_host
--                          | escalated | resolved
--   waiting_on_traveler → in_progress | closed
--   waiting_on_host     → in_progress | closed
--   escalated           → in_progress | resolved
--   resolved            → closed | in_progress  (reopen within window)
--   closed              → (terminal)
--
-- Side effects:
--   resolved_at set when entering 'resolved'; cleared on reopen.
--   closed_at set when entering 'closed'.

CREATE OR REPLACE FUNCTION public.validate_ticket_transition()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  -- No-op when status is unchanged
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Terminal state guard
  IF OLD.status = 'closed'::public.app_ticket_status THEN
    RAISE EXCEPTION
      'support_tickets: closed is a terminal state and cannot be changed (ticket_id: %)',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;

  -- Validate edge
  IF NOT (
    (OLD.status = 'open'::public.app_ticket_status
      AND NEW.status IN (
        'in_progress'::public.app_ticket_status,
        'escalated'::public.app_ticket_status
      ))
    OR
    (OLD.status = 'in_progress'::public.app_ticket_status
      AND NEW.status IN (
        'waiting_on_traveler'::public.app_ticket_status,
        'waiting_on_host'::public.app_ticket_status,
        'escalated'::public.app_ticket_status,
        'resolved'::public.app_ticket_status
      ))
    OR
    (OLD.status = 'waiting_on_traveler'::public.app_ticket_status
      AND NEW.status IN (
        'in_progress'::public.app_ticket_status,
        'closed'::public.app_ticket_status
      ))
    OR
    (OLD.status = 'waiting_on_host'::public.app_ticket_status
      AND NEW.status IN (
        'in_progress'::public.app_ticket_status,
        'closed'::public.app_ticket_status
      ))
    OR
    (OLD.status = 'escalated'::public.app_ticket_status
      AND NEW.status IN (
        'in_progress'::public.app_ticket_status,
        'resolved'::public.app_ticket_status
      ))
    OR
    (OLD.status = 'resolved'::public.app_ticket_status
      AND NEW.status IN (
        'closed'::public.app_ticket_status,
        'in_progress'::public.app_ticket_status
      ))
  ) THEN
    RAISE EXCEPTION
      'support_tickets: invalid status transition % → % (ticket_id: %)',
      OLD.status, NEW.status, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Side effects on transition

  IF NEW.status = 'resolved'::public.app_ticket_status
     AND OLD.status != 'resolved'::public.app_ticket_status
  THEN
    NEW.resolved_at := now();
  END IF;

  -- Reopen clears resolved_at so the constraint resolved_after_created
  -- stays valid on the next resolution.
  IF OLD.status = 'resolved'::public.app_ticket_status
     AND NEW.status = 'in_progress'::public.app_ticket_status
  THEN
    NEW.resolved_at := NULL;
  END IF;

  IF NEW.status = 'closed'::public.app_ticket_status THEN
    NEW.closed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_ticket_transition
  BEFORE UPDATE OF status ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.validate_ticket_transition();


-- -------------------------------------------------------
-- 12e. validate_kyc_transition  (trigger function)
-- -------------------------------------------------------
-- Enforces the KYC state machine (Revenue doc §3.7).
--
-- Allowed transitions:
--   pending      → under_review
--   under_review → approved | rejected
--   approved     → expired    (pg_cron nightly job; service_role only)
--   rejected     → (terminal; resubmission creates a new row)
--   expired      → (terminal)
--
-- Side effects:
--   reviewed_at set on approval and rejection.
--   expires_at  set on approval: now() + 2 years.

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

  -- Terminal states
  IF OLD.status IN (
    'rejected'::public.app_kyc_status,
    'expired'::public.app_kyc_status
  ) THEN
    RAISE EXCEPTION
      'host_verifications: % is a terminal state; resubmit by creating a new row (verification_id: %)',
      OLD.status, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Validate edge
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

  -- Rejection requires a reason (belt-and-suspenders; CHECK constraint also covers this)
  IF NEW.status = 'rejected'::public.app_kyc_status THEN
    IF NEW.rejection_reason IS NULL OR char_length(NEW.rejection_reason) < 5 THEN
      RAISE EXCEPTION
        'host_verifications: rejection_reason (min 5 chars) required when rejecting (verification_id: %)',
        OLD.id USING ERRCODE = 'check_violation';
    END IF;
    NEW.reviewed_at := now();
  END IF;

  IF NEW.status = 'approved'::public.app_kyc_status THEN
    NEW.reviewed_at := now();
    NEW.expires_at  := now() + interval '2 years';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_kyc_transition
  BEFORE UPDATE OF status ON public.host_verifications
  FOR EACH ROW EXECUTE FUNCTION public.validate_kyc_transition();


-- -------------------------------------------------------
-- 12f. enforce_host_verification_field_immutability  (trigger function)
-- -------------------------------------------------------
-- Document identity fields are immutable after first set.
-- Exceptions (allowed via service_role for GDPR purge):
--   document_number_enc: may be set to NULL (erasure)
--   document_path:       may be set to NULL (storage retention purge)

CREATE OR REPLACE FUNCTION public.enforce_host_verification_field_immutability()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NEW.host_id IS DISTINCT FROM OLD.host_id THEN
    RAISE EXCEPTION
      'host_verifications: host_id is immutable (verification_id: %)',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.document_type IS DISTINCT FROM OLD.document_type THEN
    RAISE EXCEPTION
      'host_verifications: document_type is immutable (verification_id: %)',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;

  -- Allow: NULL → value (first upload), value → NULL (GDPR erasure).
  -- Block: value → different non-null value (tampering).
  IF OLD.document_number_enc IS NOT NULL
     AND NEW.document_number_enc IS DISTINCT FROM OLD.document_number_enc
     AND NEW.document_number_enc IS NOT NULL
  THEN
    RAISE EXCEPTION
      'host_verifications: document_number_enc cannot be changed once set (verification_id: %)',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;

  -- Same NULL-transition logic for document_path.
  IF OLD.document_path IS NOT NULL
     AND NEW.document_path IS DISTINCT FROM OLD.document_path
     AND NEW.document_path IS NOT NULL
  THEN
    RAISE EXCEPTION
      'host_verifications: document_path cannot be changed once set (verification_id: %)',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_host_verifications_field_immutability
  BEFORE UPDATE ON public.host_verifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_host_verification_field_immutability();


-- -------------------------------------------------------
-- 12g. enforce_admin_action_immutability  (trigger function)
-- -------------------------------------------------------
-- All fields are immutable after insert except notified_at and resolved_at.

CREATE OR REPLACE FUNCTION public.enforce_admin_action_immutability()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NEW.admin_id IS DISTINCT FROM OLD.admin_id THEN
    RAISE EXCEPTION 'admin_actions: admin_id is immutable (action_id: %)',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.action_type IS DISTINCT FROM OLD.action_type THEN
    RAISE EXCEPTION 'admin_actions: action_type is immutable (action_id: %)',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.target_type IS DISTINCT FROM OLD.target_type THEN
    RAISE EXCEPTION 'admin_actions: target_type is immutable (action_id: %)',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.target_id IS DISTINCT FROM OLD.target_id THEN
    RAISE EXCEPTION 'admin_actions: target_id is immutable (action_id: %)',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reason IS DISTINCT FROM OLD.reason THEN
    RAISE EXCEPTION 'admin_actions: reason is immutable (action_id: %)',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN
    RAISE EXCEPTION 'admin_actions: notes is immutable (action_id: %)',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'admin_actions: created_at is immutable (action_id: %)',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;
  -- notified_at and resolved_at are the only mutable fields.
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_admin_actions_immutability
  BEFORE UPDATE ON public.admin_actions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_action_immutability();


-- -------------------------------------------------------
-- 12h. auto_enqueue_review_report  (trigger function)
-- -------------------------------------------------------
-- After a review_report INSERT, atomically creates a pending
-- moderation_queue entry for the review if one does not already exist
-- in an active state.  Prevents duplicate queue entries for the same
-- review while allowing multiple reporters.

CREATE OR REPLACE FUNCTION public.auto_enqueue_review_report()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.moderation_queue (
    content_type,
    content_id,
    reported_by,
    reason
  )
  SELECT
    'review'::public.app_moderation_content_type,
    NEW.review_id,
    NEW.reporter_id,
    NEW.reason::text
  WHERE NOT EXISTS (
    SELECT 1
    FROM   public.moderation_queue
    WHERE  content_type = 'review'::public.app_moderation_content_type
      AND  content_id   = NEW.review_id
      AND  status IN (
        'pending'::public.app_moderation_status,
        'under_review'::public.app_moderation_status,
        'escalated'::public.app_moderation_status
      )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_enqueue_review_report
  AFTER INSERT ON public.review_reports
  FOR EACH ROW EXECUTE FUNCTION public.auto_enqueue_review_report();


-- =============================================================================
-- DOWN MIGRATION
-- =============================================================================
/*
  To roll back (execute in reverse dependency order):

  DROP TRIGGER IF EXISTS trg_auto_enqueue_review_report          ON public.review_reports;
  DROP TRIGGER IF EXISTS trg_admin_actions_immutability          ON public.admin_actions;
  DROP TRIGGER IF EXISTS trg_host_verifications_field_immutability ON public.host_verifications;
  DROP TRIGGER IF EXISTS trg_validate_kyc_transition             ON public.host_verifications;
  DROP TRIGGER IF EXISTS trg_host_verifications_updated_at       ON public.host_verifications;
  DROP TRIGGER IF EXISTS trg_validate_ticket_transition          ON public.support_tickets;
  DROP TRIGGER IF EXISTS trg_set_ticket_sla                      ON public.support_tickets;
  DROP TRIGGER IF EXISTS trg_support_tickets_updated_at          ON public.support_tickets;
  DROP TRIGGER IF EXISTS trg_review_reports_updated_at           ON public.review_reports;
  DROP TRIGGER IF EXISTS trg_moderation_queue_updated_at         ON public.moderation_queue;

  DROP FUNCTION IF EXISTS public.auto_enqueue_review_report();
  DROP FUNCTION IF EXISTS public.enforce_admin_action_immutability();
  DROP FUNCTION IF EXISTS public.enforce_host_verification_field_immutability();
  DROP FUNCTION IF EXISTS public.validate_kyc_transition();
  DROP FUNCTION IF EXISTS public.validate_ticket_transition();
  DROP FUNCTION IF EXISTS public.set_ticket_sla();
  DROP FUNCTION IF EXISTS public.create_audit_partition(integer, integer);
  DROP FUNCTION IF EXISTS public.log_audit_event(
    uuid, text, public.app_audit_action, text,
    uuid, jsonb, jsonb, inet, text, jsonb
  );
  DROP FUNCTION IF EXISTS public.is_ticket_requester(uuid, uuid);

  DROP TABLE IF EXISTS public.admin_actions;
  DROP TABLE IF EXISTS public.audit_logs;          -- cascades to all partitions
  DROP TABLE IF EXISTS public.host_verifications;
  DROP TABLE IF EXISTS public.review_reports;
  DROP TABLE IF EXISTS public.moderation_queue;
  DROP TABLE IF EXISTS public.ticket_attachments;
  DROP TABLE IF EXISTS public.ticket_messages;
  DROP TABLE IF EXISTS public.support_tickets;

  DROP SEQUENCE IF EXISTS public.ticket_number_seq;

  DROP TYPE IF EXISTS public.app_review_report_reason;
  DROP TYPE IF EXISTS public.app_audit_action;
  DROP TYPE IF EXISTS public.app_admin_action_type;
  DROP TYPE IF EXISTS public.app_kyc_document_type;
  DROP TYPE IF EXISTS public.app_moderation_content_type;
  DROP TYPE IF EXISTS public.app_moderation_status;
  DROP TYPE IF EXISTS public.app_ticket_category;
  DROP TYPE IF EXISTS public.app_ticket_priority;
  DROP TYPE IF EXISTS public.app_ticket_status;

  -- Note: the 'expired' value added to app_kyc_status cannot be removed
  -- via ALTER TYPE DROP VALUE (Postgres does not support this).
  -- Reverting app_kyc_status requires recreating the type and all
  -- dependent columns — only feasible in a fresh environment.
*/
