// =============================================================================
// src/lib/supabase/types.ts
// Auto-generated Supabase TypeScript types.
//
// DO NOT edit manually — this file is generated from the live database schema.
//
// To regenerate after applying new migrations:
//   bun run db:types
//
// Requires:
//   • Supabase CLI installed: brew install supabase/tap/supabase
//   • Linked to remote project: supabase link --project-ref <ref>
//   • Or with explicit ref:
//       supabase gen types typescript --project-ref <ref> > src/lib/supabase/types.ts
// =============================================================================

// Hand-maintained partial schema covering tables/functions used in the server
// layer until `bun run db:types` can be run against a live project.
// Tables: profiles, storage_object_meta
// Functions: register_storage_object, log_kyc_document_access

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ---------------------------------------------------------------------------
// Enums (from migrations 0001 and 0010)
// ---------------------------------------------------------------------------

export type AppRole =
  | "traveler"
  | "host"
  | "host_staff"
  | "admin"
  | "super_admin"
  | "support"
  | "finance";

export type AppAccountStatus =
  | "pending_email_verification"
  | "active"
  | "suspended"
  | "deactivated"
  | "deleted";

export type AppKycStatus = "none" | "pending" | "verified" | "rejected";

export type AppStorageScanStatus = "pending" | "clean" | "infected" | "error";

export type AppStorageOptStatus = "not_applicable" | "pending" | "complete" | "error";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface ProfileRow {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  locale: string;
  country: string;
  date_of_birth: string | null;
  kyc_status: AppKycStatus;
  account_status: AppAccountStatus;
  created_at: string;
  updated_at: string;
}

export interface StorageObjectMetaRow {
  id: string;
  bucket_id: string;
  storage_path: string;
  owner_id: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  scan_status: AppStorageScanStatus;
  scanned_at: string | null;
  scan_provider: string | null;
  scan_threat: string | null;
  opt_status: AppStorageOptStatus;
  optimized_at: string | null;
  optimized_path: string | null;
  is_orphaned: boolean;
  orphaned_at: string | null;
  purged_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Database type consumed by createClient<Database>(...)
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      storage_object_meta: {
        Row: StorageObjectMetaRow;
        Insert: Omit<StorageObjectMetaRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<StorageObjectMetaRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      register_storage_object: {
        Args: {
          p_bucket_id: string;
          p_storage_path: string;
          p_owner_id: string;
          p_mime_type?: string | null;
          p_size_bytes?: number | null;
        };
        Returns: string; // uuid
      };
      log_kyc_document_access: {
        Args: {
          p_host_id: string;
          p_storage_path: string;
          p_actor_id: string;
          p_actor_role: string;
          p_ip_address?: string | null;
          p_user_agent?: string | null;
        };
        Returns: void;
      };
    };
    Enums: {
      app_role: AppRole;
      app_account_status: AppAccountStatus;
      app_kyc_status: AppKycStatus;
      app_storage_scan_status: AppStorageScanStatus;
      app_storage_opt_status: AppStorageOptStatus;
    };
  };
  billing: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
