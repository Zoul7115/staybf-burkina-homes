// =============================================================================
// src/lib/supabase/ssr.server.ts
// SSR Supabase client using @supabase/ssr for cookie-based session management.
// SERVER-ONLY — reads process.env and handles cookie parsing.
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { setCookie } from "@tanstack/react-start/server";
import type { Database } from "./types";

const supabaseUrl = process.env.SUPABASE_URL!;
// Accept SUPABASE_ANON_KEY (server env) OR the Vite-injected VITE_SUPABASE_ANON_KEY.
// Netlify only exposes VITE_ vars to the browser bundle; the server-side variable
// must be declared as SUPABASE_ANON_KEY in Netlify's environment settings.
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

/**
 * Read-only SSR client — reads the session from the Cookie header.
 * Use for session validation (middleware, getSession).
 * setAll is a no-op: this client never writes cookies.
 */
export function createSsrSupabaseClient(cookieHeader: string | null) {
  const cookies = parseCookies(cookieHeader ?? "");

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return Object.entries(cookies).map(([name, value]) => ({ name, value }));
      },
      setAll() {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Writable SSR client — reads AND writes session cookies via Set-Cookie response headers.
 * Use for auth operations: signIn, signOut, signUp, exchangeCodeForSession.
 * Must be called within a TanStack Start server function context.
 */
export function createWritableSsrSupabaseClient(cookieHeader: string | null) {
  const cookies = parseCookies(cookieHeader ?? "");

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return Object.entries(cookies).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          // setCookie from @tanstack/react-start/server writes a Set-Cookie header
          // on the current H3 response, making the session available to the browser.
          setCookie(name, value, options as Parameters<typeof setCookie>[2]);
        });
      },
    },
  });
}

function parseCookies(cookieHeader: string): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").flatMap((pair) => {
      const idx = pair.indexOf("=");
      if (idx === -1) return [];
      const name = pair.slice(0, idx).trim();
      const rawValue = pair.slice(idx + 1).trim();
      try {
        return [[name, decodeURIComponent(rawValue)]];
      } catch {
        return [[name, rawValue]];
      }
    }),
  );
}
