// =============================================================================
// src/lib/supabase/client.ts
// Browser-side Supabase client — singleton, safe to import in any component.
//
// Reads only VITE_* env vars (public, bundled by Vite into the browser build).
// Contains no secrets. RLS enforced on the DB side via the user's JWT.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill in the values.",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the session in localStorage so the user stays signed in across
    // page reloads and browser restarts.
    persistSession: true,

    // Automatically refresh the access token before it expires (JWT TTL = 1h).
    // The refresh happens in the background without interrupting the user.
    autoRefreshToken: true,

    // Detect OAuth callback tokens and magic-link tokens in the URL hash/query
    // on page load and automatically exchange them for a session.
    detectSessionInUrl: true,

    // Use localStorage as the session storage adapter (browser default).
    storage: typeof window !== "undefined" ? window.localStorage : undefined,

    // Storage key prefix. Supabase uses `sb-<project-ref>-auth-token` by default.
    // Keeping the default avoids key collisions if a user opens multiple StayBF
    // environments (staging vs production) in the same browser profile.
    storageKey: undefined,

    // Flow type: "pkce" (Proof Key for Code Exchange) is the most secure OAuth
    // flow for SPAs and is Supabase's default since v2.
    flowType: "pkce",
  },

  // Realtime configuration — used by booking status subscriptions in BLOCK B.
  // The channel limit of 10 covers the expected concurrent subscriptions per
  // session: 1 booking, 1 thread, 1 notification feed.
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
