-- =============================================================================
-- Migration  : 0010_storage_infrastructure.sql
-- Description: Storage Infrastructure — object metadata tracking, RLS policies
--              on storage.objects for all six buckets, upload/download helpers,
--              virus-scan and image-optimisation integration points, cleanup
--              pg_cron jobs, audit log integration for sensitive buckets.
--
-- Depends on : 0001 (profiles, has_role, app_role)
--              0003 (properties, rooms, is_host_of, is_host_of_room)
--              0007 (threads, message_attachments, is_thread_participant)
--              0008 (support_tickets, ticket_attachments, host_verifications,
--                    log_audit_event, app_audit_action, is_ticket_requester)
--              0009  (scheduled_jobs, begin_scheduled_job, finish_scheduled_job,
--                     app_job_status)
--              0009a (billing.subscriptions)
--
-- Buckets (provisioned by scripts/create-buckets.sh — NOT by this migration):
--   property-images    public   5 MB   image/*
--   room-images        public   5 MB   image/*
--   avatars            public   2 MB   image/*
--   message-attachments private 20 MB  image/*, application/pdf, video/*
--   ticket-attachments  private 20 MB  image/*, application/pdf
--   kyc-documents       private 10 MB  image/*, application/pdf
--
-- Path convention (first segment is always the owning entity UUID):
--   property-images    → {property_id}/{uuid}.{ext}
--   room-images        → {room_id}/{uuid}.{ext}
--   avatars            → {user_id}/{uuid}.{ext}
--   message-attachments → {thread_id}/{uuid}.{ext}
--   ticket-attachments  → {ticket_id}/{uuid}.{ext}
--   kyc-documents       → {host_id}/{uuid}.{ext}
--
-- Signed-URL TTLs (enforced in src/lib/storage/server.ts):
--   property-images / room-images / avatars  — public CDN, no signing required
--   message-attachments                      — 3 600 s  (1 h)
--   ticket-attachments                       — 86 400 s (24 h)
--   kyc-documents                            — 900 s    (15 min) + audit log
-- =============================================================================

-- =============================================================================
-- SECTION 1 — ENUMS
-- =============================================================================

CREATE TYPE public.app_storage_scan_status AS ENUM (
  'pending',   -- awaiting first scan
  'clean',     -- scanned, no threat found
  'infected',  -- threat detected; file must be deleted
  'error'      -- scan service unreachable or timed out; retry pending
);

CREATE TYPE public.app_storage_opt_status AS ENUM (
  'not_applicable', -- non-image bucket; optimisation skipped at registration
  'pending',        -- image uploaded, optimisation queued
  'optimized',      -- WebP/resized version generated at optimized_path
  'skipped',        -- file too small or already optimal (< 20 KB)
  'error'           -- optimisation service failed; original retained
);

-- New audit actions for storage events.
-- ADD VALUE IF NOT EXISTS is safe to re-run.
ALTER TYPE public.app_audit_action ADD VALUE IF NOT EXISTS 'file_uploaded';
ALTER TYPE public.app_audit_action ADD VALUE IF NOT EXISTS 'file_deleted';
ALTER TYPE public.app_audit_action ADD VALUE IF NOT EXISTS 'file_scan_infected';
ALTER TYPE public.app_audit_action ADD VALUE IF NOT EXISTS 'file_purged';
ALTER TYPE public.app_audit_action ADD VALUE IF NOT EXISTS 'kyc_document_accessed';


-- =============================================================================
-- SECTION 2 — storage_object_meta TABLE
-- =============================================================================
-- Central tracking table for every object uploaded to any managed bucket.
-- Purpose:
--   • Decouple async virus scan / image optimisation state from application
--     tables (property_images, message_attachments, etc.).
--   • Provide a reconciliation point for orphan detection (storage.objects
--     row deleted but application row still references the path).
--   • Feed the cleanup pg_cron jobs.
--
-- Lifecycle:
--   UPLOAD →  register_storage_object() creates a row (scan_status='pending')
--   SCAN   →  Edge Function calls complete_virus_scan()
--              clean     → scan_status='clean', opt_status set if image bucket
--              infected  → scan_status='infected'; cleanup job purges file
--   OPT    →  Edge Function calls complete_image_optimization()
--   DELETE →  Application deletes storage.objects; cleanup job marks orphaned

CREATE TABLE public.storage_object_meta (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id           text        NOT NULL
                        CHECK (bucket_id IN (
                          'property-images', 'room-images', 'avatars',
                          'message-attachments', 'ticket-attachments',
                          'kyc-documents'
                        )),
  storage_path        text        NOT NULL,
  owner_id            uuid        REFERENCES public.profiles(id)
                                    ON DELETE SET NULL,

  -- File metadata captured at upload time
  mime_type           text,
  size_bytes          bigint      CHECK (size_bytes > 0),

  -- Virus scan state
  scan_status         public.app_storage_scan_status
                                  NOT NULL DEFAULT 'pending',
  scanned_at          timestamptz,
  scan_provider       text,
  scan_threat         text,       -- threat name/signature if infected

  -- Image optimisation state (NULL for non-image buckets)
  opt_status          public.app_storage_opt_status
                                  NOT NULL DEFAULT 'not_applicable',
  optimized_at        timestamptz,
  optimized_path      text,       -- path of WebP/compressed copy within same bucket

  -- Orphan / purge tracking
  is_orphaned         boolean     NOT NULL DEFAULT false,
  orphaned_at         timestamptz,
  purged_at           timestamptz,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (bucket_id, storage_path)
);

-- updated_at trigger reuses the existing set_updated_at() from 0001
CREATE TRIGGER trg_storage_object_meta_updated_at
  BEFORE UPDATE ON public.storage_object_meta
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Lookup by path (most common access pattern: app validates scan before serving)
CREATE INDEX idx_storage_meta_bucket_path
  ON public.storage_object_meta (bucket_id, storage_path);

-- Orphan-detection query: find pending scans / unoptimised objects
CREATE INDEX idx_storage_meta_scan_pending
  ON public.storage_object_meta (scan_status, created_at)
  WHERE scan_status = 'pending';

CREATE INDEX idx_storage_meta_infected
  ON public.storage_object_meta (scan_status)
  WHERE scan_status = 'infected' AND purged_at IS NULL;

CREATE INDEX idx_storage_meta_opt_pending
  ON public.storage_object_meta (opt_status, created_at)
  WHERE opt_status = 'pending';

CREATE INDEX idx_storage_meta_orphaned
  ON public.storage_object_meta (is_orphaned, orphaned_at)
  WHERE is_orphaned = true;

CREATE INDEX idx_storage_meta_owner
  ON public.storage_object_meta (owner_id)
  WHERE owner_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS on storage_object_meta
-- ---------------------------------------------------------------------------
ALTER TABLE public.storage_object_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_object_meta FORCE ROW LEVEL SECURITY;

-- Owners can read their own objects' metadata (to check scan status)
CREATE POLICY "storage_meta: owner read"
  ON public.storage_object_meta FOR SELECT
  USING (owner_id = auth.uid());

-- Admin and support can read all metadata
CREATE POLICY "storage_meta: admin read"
  ON public.storage_object_meta FOR SELECT
  USING (public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'support'));

-- Only service_role writes (via SECURITY DEFINER functions below)
-- No INSERT/UPDATE/DELETE for authenticated — all mutations go through
-- register_storage_object(), complete_virus_scan(), complete_image_optimization()

-- ---------------------------------------------------------------------------
-- GRANTs on storage_object_meta
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.storage_object_meta TO authenticated;
GRANT ALL    ON public.storage_object_meta TO service_role;


-- =============================================================================
-- SECTION 3 — PATH HELPER
-- =============================================================================
-- Extracts the first path segment as a UUID for use in storage.objects RLS
-- policies.  Returns NULL if the segment is not a valid UUID, which causes
-- the policy USING clause to evaluate to false (access denied) rather than
-- raising an exception.

CREATE OR REPLACE FUNCTION public.storage_path_owner_id(storage_name text)
  RETURNS uuid
  LANGUAGE sql
  IMMUTABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT CASE
    WHEN split_part(storage_name, '/', 1)
           ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(storage_name, '/', 1)::uuid
    ELSE NULL::uuid
  END;
$$;

GRANT EXECUTE ON FUNCTION public.storage_path_owner_id(text)
  TO authenticated, anon;


-- =============================================================================
-- SECTION 4 — UPLOAD / SCAN / OPTIMISATION HELPER FUNCTIONS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- register_storage_object
-- ---------------------------------------------------------------------------
-- Called by the server-side upload handler immediately after a successful
-- storage.objects INSERT.  Creates a storage_object_meta row and emits an
-- audit log entry.
--
-- Image buckets (property-images, room-images, avatars) start with
-- opt_status='pending' so the optimisation Edge Function picks them up.
-- Non-image buckets start with opt_status='not_applicable'.

CREATE OR REPLACE FUNCTION public.register_storage_object(
  p_bucket_id     text,
  p_storage_path  text,
  p_owner_id      uuid,
  p_mime_type     text     DEFAULT NULL,
  p_size_bytes    bigint   DEFAULT NULL
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_id         uuid;
  v_opt_status public.app_storage_opt_status;
BEGIN
  -- Only image buckets get optimisation queued
  v_opt_status := CASE
    WHEN p_bucket_id IN ('property-images', 'room-images', 'avatars')
     AND p_mime_type LIKE 'image/%'
    THEN 'pending'::public.app_storage_opt_status
    ELSE 'not_applicable'::public.app_storage_opt_status
  END;

  INSERT INTO public.storage_object_meta (
    bucket_id, storage_path, owner_id,
    mime_type, size_bytes,
    scan_status, opt_status
  ) VALUES (
    p_bucket_id, p_storage_path, p_owner_id,
    p_mime_type, p_size_bytes,
    'pending'::public.app_storage_scan_status,
    v_opt_status
  )
  ON CONFLICT (bucket_id, storage_path)
    DO UPDATE SET
      owner_id    = EXCLUDED.owner_id,
      mime_type   = EXCLUDED.mime_type,
      size_bytes  = EXCLUDED.size_bytes,
      scan_status = 'pending'::public.app_storage_scan_status,
      opt_status  = EXCLUDED.opt_status,
      is_orphaned = false,
      orphaned_at = NULL,
      purged_at   = NULL,
      updated_at  = now()
  RETURNING id INTO v_id;

  PERFORM public.log_audit_event(
    p_owner_id,
    'authenticated',
    'file_uploaded'::public.app_audit_action,
    'storage_object',
    v_id,
    NULL,
    jsonb_build_object(
      'bucket_id',    p_bucket_id,
      'storage_path', p_storage_path,
      'mime_type',    p_mime_type,
      'size_bytes',   p_size_bytes
    )
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_storage_object(text, text, uuid, text, bigint)
  TO service_role;


-- ---------------------------------------------------------------------------
-- complete_virus_scan
-- ---------------------------------------------------------------------------
-- Called by the virus-scan Edge Function after it receives results from the
-- antivirus provider.  Updates scan_status and, if infected, marks the file
-- so the cleanup job can delete it from storage.
--
-- Integration contract (Edge Function → this function):
--   POST /functions/v1/virus-scan-webhook
--   Body: { bucket_id, storage_path, is_clean, threat_name?, provider }
--   The Edge Function calls this via service_role client.

CREATE OR REPLACE FUNCTION public.complete_virus_scan(
  p_bucket_id     text,
  p_storage_path  text,
  p_is_clean      boolean,
  p_threat_name   text     DEFAULT NULL,
  p_provider      text     DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_new_status public.app_storage_scan_status;
  v_row        public.storage_object_meta%ROWTYPE;
BEGIN
  v_new_status := CASE WHEN p_is_clean THEN 'clean' ELSE 'infected' END
                    ::public.app_storage_scan_status;

  UPDATE public.storage_object_meta
  SET    scan_status   = v_new_status,
         scanned_at    = now(),
         scan_provider = p_provider,
         scan_threat   = CASE WHEN NOT p_is_clean THEN p_threat_name ELSE NULL END,
         updated_at    = now()
  WHERE  bucket_id    = p_bucket_id
    AND  storage_path = p_storage_path
  RETURNING * INTO v_row;

  IF NOT FOUND THEN RETURN; END IF;

  IF NOT p_is_clean THEN
    PERFORM public.log_audit_event(
      v_row.owner_id,
      'system',
      'file_scan_infected'::public.app_audit_action,
      'storage_object',
      v_row.id,
      NULL,
      jsonb_build_object(
        'bucket_id',    p_bucket_id,
        'storage_path', p_storage_path,
        'threat',       p_threat_name,
        'provider',     p_provider
      )
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_virus_scan(text, text, boolean, text, text)
  TO service_role;


-- ---------------------------------------------------------------------------
-- complete_image_optimization
-- ---------------------------------------------------------------------------
-- Called by the image-optimisation Edge Function after it produces a
-- compressed/WebP version of an uploaded image.
--
-- Integration contract (Edge Function → this function):
--   POST /functions/v1/image-optimize-webhook
--   Body: { bucket_id, storage_path, optimized_path }

CREATE OR REPLACE FUNCTION public.complete_image_optimization(
  p_bucket_id      text,
  p_storage_path   text,
  p_optimized_path text  DEFAULT NULL,  -- NULL means skipped (file too small)
  p_success        boolean DEFAULT true
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_new_status public.app_storage_opt_status;
BEGIN
  v_new_status := CASE
    WHEN NOT p_success          THEN 'error'
    WHEN p_optimized_path IS NULL THEN 'skipped'
    ELSE 'optimized'
  END::public.app_storage_opt_status;

  UPDATE public.storage_object_meta
  SET    opt_status      = v_new_status,
         optimized_at    = CASE WHEN p_success THEN now() ELSE NULL END,
         optimized_path  = p_optimized_path,
         updated_at      = now()
  WHERE  bucket_id    = p_bucket_id
    AND  storage_path = p_storage_path;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_image_optimization(text, text, text, boolean)
  TO service_role;


-- ---------------------------------------------------------------------------
-- log_kyc_document_access
-- ---------------------------------------------------------------------------
-- Called by the server-side signed-URL generator before issuing a short-lived
-- URL for a kyc-documents object.  Creates an immutable audit trail of every
-- access to sensitive KYC files.
--
-- The caller (createServerFn handler in src/lib/storage/server.ts) is
-- responsible for ensuring the actor is authorised before calling this.

CREATE OR REPLACE FUNCTION public.log_kyc_document_access(
  p_host_id       uuid,
  p_storage_path  text,
  p_actor_id      uuid,
  p_actor_role    text,
  p_ip_address    inet    DEFAULT NULL,
  p_user_agent    text    DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  PERFORM public.log_audit_event(
    p_actor_id,
    p_actor_role,
    'kyc_document_accessed'::public.app_audit_action,
    'host_verifications',
    p_host_id,
    NULL,
    jsonb_build_object(
      'bucket_id',    'kyc-documents',
      'storage_path', p_storage_path
    ),
    p_ip_address,
    p_user_agent
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_kyc_document_access(uuid, text, uuid, text, inet, text)
  TO service_role;


-- =============================================================================
-- SECTION 5 — STORAGE RLS POLICIES (storage.objects)
-- =============================================================================
-- All policies follow the path convention: first path segment = owning entity UUID.
-- public.storage_path_owner_id(name) safely extracts this as a uuid (NULL if invalid).
--
-- Supabase Storage evaluates these policies when requests arrive via the
-- Storage REST API.  Signed URLs (generated server-side with service_role)
-- bypass RLS entirely — no SELECT policy is needed for signed URL downloads.
--
-- Policy naming convention: "{bucket}: {role/visibility} {operation}"

-- ─────────────────────────────────────────────────────────────────────────────
-- property-images  (public bucket — CDN delivery, no signed URLs)
-- Path: {property_id}/{uuid}.{ext}
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "property-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'property-images');

CREATE POLICY "property-images: host upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'property-images'
    AND auth.role() = 'authenticated'
    AND public.is_host_of(
          auth.uid(),
          public.storage_path_owner_id(name)
        )
  );

CREATE POLICY "property-images: host update own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'property-images'
    AND public.is_host_of(
          auth.uid(),
          public.storage_path_owner_id(name)
        )
  )
  WITH CHECK (
    bucket_id = 'property-images'
    AND public.is_host_of(
          auth.uid(),
          public.storage_path_owner_id(name)
        )
  );

CREATE POLICY "property-images: host delete own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'property-images'
    AND (
      public.is_host_of(auth.uid(), public.storage_path_owner_id(name))
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- room-images  (public bucket)
-- Path: {room_id}/{uuid}.{ext}
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "room-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'room-images');

CREATE POLICY "room-images: host upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'room-images'
    AND auth.role() = 'authenticated'
    AND public.is_host_of_room(
          auth.uid(),
          public.storage_path_owner_id(name)
        )
  );

CREATE POLICY "room-images: host update own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'room-images'
    AND public.is_host_of_room(
          auth.uid(),
          public.storage_path_owner_id(name)
        )
  )
  WITH CHECK (
    bucket_id = 'room-images'
    AND public.is_host_of_room(
          auth.uid(),
          public.storage_path_owner_id(name)
        )
  );

CREATE POLICY "room-images: host delete own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'room-images'
    AND (
      public.is_host_of_room(auth.uid(), public.storage_path_owner_id(name))
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- avatars  (public bucket)
-- Path: {user_id}/{uuid}.{ext}  — user_id must equal auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars: owner upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND public.storage_path_owner_id(name) = auth.uid()
  );

CREATE POLICY "avatars: owner update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND public.storage_path_owner_id(name) = auth.uid()
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.storage_path_owner_id(name) = auth.uid()
  );

CREATE POLICY "avatars: owner delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (
      public.storage_path_owner_id(name) = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- message-attachments  (private bucket — signed URLs, TTL 1 h)
-- Path: {thread_id}/{uuid}.{ext}
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "message-attachments: participant read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'message-attachments'
    AND (
      public.is_thread_participant(auth.uid(), public.storage_path_owner_id(name))
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'support')
    )
  );

CREATE POLICY "message-attachments: participant upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND auth.role() = 'authenticated'
    AND public.is_thread_participant(
          auth.uid(),
          public.storage_path_owner_id(name)
        )
  );

CREATE POLICY "message-attachments: admin delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'message-attachments'
    AND (
      -- sender can delete their own attachment; owner_id set at upload
      (owner_id IS NOT NULL AND owner_id::uuid = auth.uid())
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- ticket-attachments  (private bucket — signed URLs, TTL 24 h)
-- Path: {ticket_id}/{uuid}.{ext}
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "ticket-attachments: requester or support read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'ticket-attachments'
    AND (
      public.is_ticket_requester(auth.uid(), public.storage_path_owner_id(name))
      OR public.has_role(auth.uid(), 'support')
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "ticket-attachments: requester or support upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND auth.role() = 'authenticated'
    AND (
      public.is_ticket_requester(auth.uid(), public.storage_path_owner_id(name))
      OR public.has_role(auth.uid(), 'support')
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "ticket-attachments: admin delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'ticket-attachments'
    AND public.has_role(auth.uid(), 'admin')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- kyc-documents  (private bucket — signed URLs, TTL 15 min + audit log)
-- Path: {host_id}/{uuid}.{ext}  — host_id must equal auth.uid() for owner
-- READ is intentionally restrictive: prefer server-side log_kyc_document_access
-- + service_role signed URL over direct Storage API access.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "kyc-documents: owner or admin read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kyc-documents'
    AND (
      public.storage_path_owner_id(name) = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'support')
    )
  );

CREATE POLICY "kyc-documents: owner upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND auth.role() = 'authenticated'
    -- Host may only upload under their own user_id folder
    AND public.storage_path_owner_id(name) = auth.uid()
  );

CREATE POLICY "kyc-documents: admin delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'kyc-documents'
    AND public.has_role(auth.uid(), 'admin')
  );


-- =============================================================================
-- SECTION 6 — CLEANUP + RECONCILIATION pg_cron JOBS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- trigger_pending_scans
-- ---------------------------------------------------------------------------
-- Finds storage_object_meta rows where scan_status='pending' AND
-- created_at < now() - 5 min (allow time for Edge Function to fire first).
-- Calls the virus-scan Edge Function via net.http_post() for each row.
-- Runs every 15 minutes; idempotent.

CREATE OR REPLACE FUNCTION public.trigger_pending_scans(
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
  v_count         integer := 0;
  v_supabase_url  text;
  v_service_key   text;
  r               record;
BEGIN
  v_nominal_tick := date_trunc('hour', p_tick)
    + (EXTRACT(MINUTE FROM p_tick)::integer / 15) * interval '15 minutes';

  v_acquired := public.begin_scheduled_job('storage-scan-trigger', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  v_supabase_url := current_setting('app.supabase_url',      true);
  v_service_key  := current_setting('app.service_role_key',  true);

  BEGIN
    FOR r IN
      SELECT id, bucket_id, storage_path
      FROM   public.storage_object_meta
      WHERE  scan_status = 'pending'::public.app_storage_scan_status
        AND  created_at  < p_tick - interval '5 minutes'
        AND  purged_at   IS NULL
      ORDER  BY created_at
      LIMIT  50
    LOOP
      IF v_supabase_url IS NOT NULL
         AND v_supabase_url != ''
         AND v_service_key  IS NOT NULL
      THEN
        PERFORM net.http_post(
          url     := v_supabase_url || '/functions/v1/virus-scan',
          body    := jsonb_build_object(
                       'bucket_id',    r.bucket_id,
                       'storage_path', r.storage_path,
                       'meta_id',      r.id
                     ),
          headers := jsonb_build_object(
                       'Authorization', 'Bearer ' || v_service_key,
                       'Content-Type',  'application/json'
                     )
        );
      END IF;
      v_count := v_count + 1;
    END LOOP;

    PERFORM public.finish_scheduled_job(
      'storage-scan-trigger', v_nominal_tick,
      'success'::public.app_job_status, v_count
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'storage-scan-trigger', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_pending_scans(timestamptz)
  TO service_role;


-- ---------------------------------------------------------------------------
-- trigger_pending_optimizations
-- ---------------------------------------------------------------------------
-- Finds image rows where scan_status='clean' AND opt_status='pending'.
-- Calls the image-optimisation Edge Function for each row.
-- Runs every 15 minutes; idempotent.

CREATE OR REPLACE FUNCTION public.trigger_pending_optimizations(
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
  v_count         integer := 0;
  v_supabase_url  text;
  v_service_key   text;
  r               record;
BEGIN
  v_nominal_tick := date_trunc('hour', p_tick)
    + (EXTRACT(MINUTE FROM p_tick)::integer / 15) * interval '15 minutes';

  v_acquired := public.begin_scheduled_job('storage-opt-trigger', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  v_supabase_url := current_setting('app.supabase_url',      true);
  v_service_key  := current_setting('app.service_role_key',  true);

  BEGIN
    FOR r IN
      SELECT id, bucket_id, storage_path, mime_type, size_bytes
      FROM   public.storage_object_meta
      WHERE  scan_status = 'clean'::public.app_storage_scan_status
        AND  opt_status  = 'pending'::public.app_storage_opt_status
        AND  purged_at   IS NULL
      ORDER  BY created_at
      LIMIT  50
    LOOP
      IF v_supabase_url IS NOT NULL
         AND v_supabase_url != ''
         AND v_service_key  IS NOT NULL
      THEN
        PERFORM net.http_post(
          url     := v_supabase_url || '/functions/v1/image-optimize',
          body    := jsonb_build_object(
                       'bucket_id',    r.bucket_id,
                       'storage_path', r.storage_path,
                       'mime_type',    r.mime_type,
                       'size_bytes',   r.size_bytes,
                       'meta_id',      r.id
                     ),
          headers := jsonb_build_object(
                       'Authorization', 'Bearer ' || v_service_key,
                       'Content-Type',  'application/json'
                     )
        );
      END IF;
      v_count := v_count + 1;
    END LOOP;

    PERFORM public.finish_scheduled_job(
      'storage-opt-trigger', v_nominal_tick,
      'success'::public.app_job_status, v_count
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'storage-opt-trigger', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_pending_optimizations(timestamptz)
  TO service_role;


-- ---------------------------------------------------------------------------
-- purge_infected_storage
-- ---------------------------------------------------------------------------
-- Finds storage_object_meta rows where scan_status='infected' and purged_at
-- IS NULL.  Marks them as purged (actual deletion from storage.objects is
-- performed by the virus-scan Edge Function; this job is the safety net).
-- Runs daily at 04:00 UTC.

CREATE OR REPLACE FUNCTION public.purge_infected_storage(
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
  v_count         integer := 0;
  v_supabase_url  text;
  v_service_key   text;
  r               record;
BEGIN
  v_nominal_tick := date_trunc('day', p_tick);

  v_acquired := public.begin_scheduled_job('storage-purge-infected', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  v_supabase_url := current_setting('app.supabase_url',      true);
  v_service_key  := current_setting('app.service_role_key',  true);

  BEGIN
    FOR r IN
      SELECT id, bucket_id, storage_path, owner_id
      FROM   public.storage_object_meta
      WHERE  scan_status = 'infected'::public.app_storage_scan_status
        AND  purged_at   IS NULL
      ORDER  BY created_at
    LOOP
      -- Request Edge Function to delete from storage.objects and mark meta
      IF v_supabase_url IS NOT NULL
         AND v_supabase_url != ''
         AND v_service_key  IS NOT NULL
      THEN
        PERFORM net.http_post(
          url     := v_supabase_url || '/functions/v1/storage-purge',
          body    := jsonb_build_object(
                       'bucket_id',    r.bucket_id,
                       'storage_path', r.storage_path,
                       'meta_id',      r.id,
                       'reason',       'infected'
                     ),
          headers := jsonb_build_object(
                       'Authorization', 'Bearer ' || v_service_key,
                       'Content-Type',  'application/json'
                     )
        );
      ELSE
        -- No Edge Function configured: mark purged directly (file may still
        -- exist in storage until manually cleaned)
        UPDATE public.storage_object_meta
        SET    purged_at   = now(),
               updated_at  = now()
        WHERE  id = r.id;

        PERFORM public.log_audit_event(
          r.owner_id,
          'system',
          'file_purged'::public.app_audit_action,
          'storage_object',
          r.id,
          NULL,
          jsonb_build_object(
            'bucket_id',    r.bucket_id,
            'storage_path', r.storage_path,
            'reason',       'infected — Edge Function not configured'
          )
        );
      END IF;

      v_count := v_count + 1;
    END LOOP;

    PERFORM public.finish_scheduled_job(
      'storage-purge-infected', v_nominal_tick,
      'success'::public.app_job_status, v_count
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'storage-purge-infected', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_infected_storage(timestamptz)
  TO service_role;


-- ---------------------------------------------------------------------------
-- cleanup_orphaned_storage_meta
-- ---------------------------------------------------------------------------
-- Hard-deletes storage_object_meta rows that are:
--   (a) marked orphaned more than 7 days ago, OR
--   (b) purged more than 30 days ago.
-- Runs weekly on Sunday at 05:00 UTC.

CREATE OR REPLACE FUNCTION public.cleanup_orphaned_storage_meta(
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
BEGIN
  v_nominal_tick := date_trunc('week', p_tick);

  v_acquired := public.begin_scheduled_job('storage-meta-cleanup', v_nominal_tick);
  IF NOT v_acquired THEN RETURN 0; END IF;

  BEGIN
    DELETE FROM public.storage_object_meta
    WHERE (
      (is_orphaned = true  AND orphaned_at < p_tick - interval '7 days')
      OR
      (purged_at IS NOT NULL AND purged_at  < p_tick - interval '30 days')
    );

    GET DIAGNOSTICS v_count = ROW_COUNT;

    PERFORM public.finish_scheduled_job(
      'storage-meta-cleanup', v_nominal_tick,
      'success'::public.app_job_status, v_count
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.finish_scheduled_job(
      'storage-meta-cleanup', v_nominal_tick,
      'failed'::public.app_job_status, NULL, SQLERRM
    );
    RAISE;
  END;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_storage_meta(timestamptz)
  TO service_role;


-- =============================================================================
-- SECTION 7 — pg_cron JOB REGISTRATIONS
-- =============================================================================

SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname IN (
  'storage-scan-trigger',
  'storage-opt-trigger',
  'storage-purge-infected',
  'storage-meta-cleanup'
);

-- Every 15 minutes: retry unscanned objects
SELECT cron.schedule(
  'storage-scan-trigger',
  '*/15 * * * *',
  $$SELECT public.trigger_pending_scans(now())$$
);

-- Every 15 minutes: trigger image optimisation for clean uploads
SELECT cron.schedule(
  'storage-opt-trigger',
  '*/15 * * * *',
  $$SELECT public.trigger_pending_optimizations(now())$$
);

-- Daily 04:00 UTC: purge infected files (safety-net if Edge Function missed it)
SELECT cron.schedule(
  'storage-purge-infected',
  '0 4 * * *',
  $$SELECT public.purge_infected_storage(now())$$
);

-- Weekly Sunday 05:00 UTC: hard-delete stale orphan / purged meta rows
SELECT cron.schedule(
  'storage-meta-cleanup',
  '0 5 * * 0',
  $$SELECT public.cleanup_orphaned_storage_meta(now())$$
);


-- =============================================================================
-- DOWN MIGRATION (reference only — do not execute in production)
-- =============================================================================
--
-- SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN (
--   'storage-scan-trigger', 'storage-opt-trigger',
--   'storage-purge-infected', 'storage-meta-cleanup'
-- );
-- DROP FUNCTION IF EXISTS public.cleanup_orphaned_storage_meta(timestamptz);
-- DROP FUNCTION IF EXISTS public.purge_infected_storage(timestamptz);
-- DROP FUNCTION IF EXISTS public.trigger_pending_optimizations(timestamptz);
-- DROP FUNCTION IF EXISTS public.trigger_pending_scans(timestamptz);
-- DROP FUNCTION IF EXISTS public.log_kyc_document_access(uuid,text,uuid,text,inet,text);
-- DROP FUNCTION IF EXISTS public.complete_image_optimization(text,text,text,boolean);
-- DROP FUNCTION IF EXISTS public.complete_virus_scan(text,text,boolean,text,text);
-- DROP FUNCTION IF EXISTS public.register_storage_object(text,text,uuid,text,bigint);
-- DROP FUNCTION IF EXISTS public.storage_path_owner_id(text);
-- DROP TABLE  IF EXISTS public.storage_object_meta;
-- DROP TYPE   IF EXISTS public.app_storage_opt_status;
-- DROP TYPE   IF EXISTS public.app_storage_scan_status;
-- (app_audit_action enum values cannot be removed once added)
