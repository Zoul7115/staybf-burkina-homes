// =============================================================================
// src/lib/supabase/ssr.server.ts
// SSR Supabase client using @supabase/ssr for cookie-based session management.
// SERVER-ONLY — reads process.env and handles cookie parsing.
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import type { Database } from "./types";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

/**
 * Creates a Supabase client that reads the session from the Cookie header.
 * @supabase/ssr handles the sb-<ref>-auth-token cookie parsing and PKCE
 * token refresh automatically.
 *
 * @param cookieHeader - The raw Cookie header string from the incoming request
 */
export function createSsrSupabaseClient(cookieHeader: string | null) {
  const cookies = parseCookies(cookieHeader ?? "");

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return Object.entries(cookies).map(([name, value]) => ({ name, value }));
      },
      // Server-side: we don't set cookies (handled by the browser client).
      // Provide a no-op so @supabase/ssr doesn't throw.
      setAll() {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function parseCookies(cookieHeader: string): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((pair) => {
      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx).trim();
      const value = decodeURIComponent(pair.slice(idx + 1).trim());
      return [name, value];
    }),
  );
}
