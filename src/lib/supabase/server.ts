// =============================================================================
// src/lib/supabase/server.ts
// Server-side Supabase client factory — per-request, RLS-scoped.
//
// This file is server-only (never bundled into the browser build) because:
//   1. It reads process.env (not import.meta.env).
//   2. It is only ever called from createServerFn handlers or middleware,
//      which TanStack Start strips from the client bundle automatically.
//
// Usage (inside a createServerFn handler):
//   const supabase = createServerSupabaseClient(accessToken);
//   const { data } = await supabase.from('properties').select('*');
//
// The accessToken parameter is the user's JWT, extracted from the request
// cookie by session middleware (T12). When omitted the client operates as
// the anon role — suitable for reading public data only.
//
// Do NOT use this client for admin operations (service_role). Use
// src/lib/supabase/admin.ts for those, with explicit justification.
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY in server environment. " +
      "Ensure these are set in your deployment platform and .env files.",
  );
}

// ---------------------------------------------------------------------------
// createServerSupabaseClient
// ---------------------------------------------------------------------------
// Creates a fresh Supabase client per request. Not a singleton — each call
// returns a new instance scoped to the provided access token (or anon).
//
// The client does NOT persist sessions or refresh tokens — session lifecycle
// is managed by the browser client (client.ts). The server client is
// stateless: it uses the token that was already validated by auth middleware.

export function createServerSupabaseClient(accessToken?: string | null): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      // Server clients must not persist sessions — there is no localStorage
      // on the server and we do not want sessions leaked between requests.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: accessToken
        ? {
            // Setting Authorization directly causes Supabase to use this JWT
            // for all queries, enforcing RLS as the token's user.
            Authorization: `Bearer ${accessToken}`,
          }
        : {},
    },
  });
}

// ---------------------------------------------------------------------------
// createAnonServerSupabaseClient
// ---------------------------------------------------------------------------
// Convenience helper for server functions that only access public data
// (e.g. listing published properties for SSR). Explicit naming makes the
// intent clear at the call site: this client has anon-level access only.

export function createAnonServerSupabaseClient(): SupabaseClient<Database> {
  return createServerSupabaseClient(null);
}
