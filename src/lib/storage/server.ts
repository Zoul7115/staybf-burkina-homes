// =============================================================================
// src/lib/storage/server.ts
// Server-side storage helpers — signed URL generation, upload metadata
// registration, download gate for private buckets.
//
// SERVER-ONLY (never imported into the browser bundle):
//   - Reads process.env directly
//   - Uses supabaseAdmin (service_role) for signing and admin operations
//   - All exports must be called from createServerFn handlers only
//
// Signed-URL TTL strategy:
//   property-images / room-images / avatars  → public CDN, no signing needed
//   message-attachments                      → 3 600 s  (1 hour)
//   ticket-attachments                       → 86 400 s (24 hours)
//   kyc-documents                            → 900 s    (15 min) + audit log
// =============================================================================

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Bucket configuration
// ---------------------------------------------------------------------------

export const BUCKETS = {
  PROPERTY_IMAGES:      "property-images",
  ROOM_IMAGES:          "room-images",
  AVATARS:              "avatars",
  MESSAGE_ATTACHMENTS:  "message-attachments",
  TICKET_ATTACHMENTS:   "ticket-attachments",
  KYC_DOCUMENTS:        "kyc-documents",
} as const;

export type BucketId = (typeof BUCKETS)[keyof typeof BUCKETS];

const SIGNED_URL_TTL: Partial<Record<BucketId, number>> = {
  [BUCKETS.MESSAGE_ATTACHMENTS]: 3_600,
  [BUCKETS.TICKET_ATTACHMENTS]:  86_400,
  [BUCKETS.KYC_DOCUMENTS]:       900,
};

const IMAGE_BUCKETS = new Set<BucketId>([
  BUCKETS.PROPERTY_IMAGES,
  BUCKETS.ROOM_IMAGES,
  BUCKETS.AVATARS,
]);

// ---------------------------------------------------------------------------
// Path builders
// ---------------------------------------------------------------------------
// All paths follow the convention: {owning_entity_id}/{uuid}.{ext}
// The first segment is always the UUID of the entity that owns the file.
// This is what the storage.objects RLS policies check.

export function buildStoragePath(
  ownerId: string,
  filename: string,
): string {
  const ext = filename.split(".").pop() ?? "bin";
  const uuid = crypto.randomUUID();
  return `${ownerId}/${uuid}.${ext}`;
}

// ---------------------------------------------------------------------------
// Public URL (CDN — no signing)
// ---------------------------------------------------------------------------

export function getPublicUrl(bucketId: BucketId, storagePath: string): string {
  const { data } = supabaseAdmin.storage
    .from(bucketId)
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// Signed URL (private buckets)
// ---------------------------------------------------------------------------

export type SignedUrlResult =
  | { url: string; expiresIn: number; error: null }
  | { url: null; expiresIn: null; error: string };

export async function createSignedDownloadUrl(
  bucketId: BucketId,
  storagePath: string,
): Promise<SignedUrlResult> {
  const ttl = SIGNED_URL_TTL[bucketId];
  if (ttl === undefined) {
    return {
      url: null,
      expiresIn: null,
      error: `Bucket '${bucketId}' does not use signed URLs — use getPublicUrl() instead.`,
    };
  }

  const { data, error } = await supabaseAdmin.storage
    .from(bucketId)
    .createSignedUrl(storagePath, ttl);

  if (error || !data?.signedUrl) {
    return { url: null, expiresIn: null, error: error?.message ?? "Unknown error" };
  }

  return { url: data.signedUrl, expiresIn: ttl, error: null };
}

// ---------------------------------------------------------------------------
// KYC signed URL — includes audit log via DB function
// ---------------------------------------------------------------------------

export type KycDownloadResult =
  | { url: string; expiresIn: 900; error: null }
  | { url: null; expiresIn: null; error: string };

export async function createKycSignedUrl(opts: {
  hostId:      string;
  storagePath: string;
  actorId:     string;
  actorRole:   string;
  accessToken: string;
  ipAddress?:  string;
  userAgent?:  string;
}): Promise<KycDownloadResult> {
  // 1. Verify the actor is authorised (host reading own docs, or admin/support)
  const serverClient = createServerSupabaseClient(opts.accessToken);
  const { data: obj, error: selectErr } = await serverClient.storage
    .from(BUCKETS.KYC_DOCUMENTS)
    .list(opts.hostId, { search: opts.storagePath.split("/").at(-1) });

  if (selectErr) {
    return { url: null, expiresIn: null, error: selectErr.message };
  }
  if (!obj?.length) {
    return { url: null, expiresIn: null, error: "Document not found or access denied." };
  }

  // 2. Generate the short-lived signed URL
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKETS.KYC_DOCUMENTS)
    .createSignedUrl(opts.storagePath, 900);

  if (error || !data?.signedUrl) {
    return { url: null, expiresIn: null, error: error?.message ?? "Signing failed" };
  }

  // 3. Record the access in audit_logs via SECURITY DEFINER function
  await supabaseAdmin.rpc("log_kyc_document_access", {
    p_host_id:      opts.hostId,
    p_storage_path: opts.storagePath,
    p_actor_id:     opts.actorId,
    p_actor_role:   opts.actorRole,
    p_ip_address:   opts.ipAddress ?? null,
    p_user_agent:   opts.userAgent ?? null,
  });

  return { url: data.signedUrl, expiresIn: 900, error: null };
}

// ---------------------------------------------------------------------------
// Signed upload URL (pre-signed PUT — lets the client upload directly to
// Storage without routing the binary through the server)
// ---------------------------------------------------------------------------

export type SignedUploadResult =
  | { signedUrl: string; token: string; path: string; error: null }
  | { signedUrl: null; token: null; path: null; error: string };

export async function createSignedUploadUrl(
  bucketId: BucketId,
  storagePath: string,
): Promise<SignedUploadResult> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucketId)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return { signedUrl: null, token: null, path: null, error: error?.message ?? "Signing failed" };
  }

  return {
    signedUrl: data.signedUrl,
    token:     data.token,
    path:      data.path,
    error:     null,
  };
}

// ---------------------------------------------------------------------------
// Post-upload registration
// ---------------------------------------------------------------------------
// Call this AFTER a successful upload to create the storage_object_meta row
// and queue the virus scan.  Provides the tracking ID for the client to poll.

export type RegisterResult =
  | { metaId: string; error: null }
  | { metaId: null; error: string };

export async function registerUpload(opts: {
  bucketId:    BucketId;
  storagePath: string;
  ownerId:     string;
  mimeType?:   string;
  sizeBytes?:  number;
}): Promise<RegisterResult> {
  const { data, error } = await supabaseAdmin.rpc("register_storage_object", {
    p_bucket_id:    opts.bucketId,
    p_storage_path: opts.storagePath,
    p_owner_id:     opts.ownerId,
    p_mime_type:    opts.mimeType ?? null,
    p_size_bytes:   opts.sizeBytes ?? null,
  });

  if (error) {
    return { metaId: null, error: error.message };
  }

  return { metaId: data as string, error: null };
}

// ---------------------------------------------------------------------------
// Scan status gate
// ---------------------------------------------------------------------------
// Returns the scan status of a file.  Callers should NOT serve a file to the
// end user if scan_status != 'clean' (or if the row doesn't exist yet).

export type ScanStatus = "pending" | "clean" | "infected" | "error" | "not_found";

export async function getScanStatus(
  bucketId: BucketId,
  storagePath: string,
): Promise<ScanStatus> {
  const { data, error } = await supabaseAdmin
    .from("storage_object_meta")
    .select("scan_status")
    .eq("bucket_id", bucketId)
    .eq("storage_path", storagePath)
    .maybeSingle();

  if (error || !data) return "not_found";
  return data.scan_status as ScanStatus;
}

// ---------------------------------------------------------------------------
// Delete helper — removes the storage.objects entry AND marks meta purged
// ---------------------------------------------------------------------------

export async function deleteStorageObject(
  bucketId: BucketId,
  storagePath: string,
): Promise<{ error: string | null }> {
  const { error: storageErr } = await supabaseAdmin.storage
    .from(bucketId)
    .remove([storagePath]);

  if (storageErr) {
    return { error: storageErr.message };
  }

  // Mark meta row as purged (best-effort; the cleanup job handles misses)
  await supabaseAdmin
    .from("storage_object_meta")
    .update({ purged_at: new Date().toISOString() })
    .eq("bucket_id", bucketId)
    .eq("storage_path", storagePath);

  return { error: null };
}

// ---------------------------------------------------------------------------
// Optimized URL resolver
// ---------------------------------------------------------------------------
// Returns the optimized_path URL if available, else falls back to original.
// For public buckets only.

export function resolveImageUrl(
  bucketId: BucketId,
  storagePath: string,
  optimizedPath: string | null,
): string {
  if (!IMAGE_BUCKETS.has(bucketId)) {
    throw new Error(`resolveImageUrl: '${bucketId}' is not a public image bucket`);
  }
  const path = optimizedPath ?? storagePath;
  return getPublicUrl(bucketId, path);
}
