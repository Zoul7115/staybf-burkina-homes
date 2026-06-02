// =============================================================================
// src/lib/supabase/admin.ts
// Supabase admin client — service_role key, bypasses ALL Row Level Security.
//
// ⚠️  SERVER-ONLY. NEVER import this file in route components or any module
//     that runs in the browser. ESLint enforces this via no-restricted-imports.
//
// Legitimate uses (require explicit justification in code comments):
//   • Storage prefix sweeps in cleanup pg_cron job wrappers
//   • Post-upload DB row writes after virus scan confirms clean
//   • KYC document URL generation (admin-only signed URLs)
//   • Writing upload_pending rows from initiate-*-upload server functions
//   • Updating profiles.avatar_url after avatar upload confirmation
//   • Role grants performed by super_admin server functions
//
// For any other use: use createServerSupabaseClient(accessToken) from
// server.ts instead — it enforces RLS as the authenticated user.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server environment. " +
      "These must ONLY be set on the server — never in VITE_ prefixed variables.",
  );
}

// Singleton — safe for the admin client because the service_role key never
// changes within a process lifetime and there is no per-user state to leak.
export const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    // No session management — the admin client acts as the platform, not a user.
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
