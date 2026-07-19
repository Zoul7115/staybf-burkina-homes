// =============================================================================
// src/lib/auth/auth.functions.ts
// Server functions for all authentication operations.
// All handlers run server-side only via createServerFn.
// =============================================================================

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { createSsrSupabaseClient, createWritableSsrSupabaseClient } from "../supabase/ssr.server";
import { supabaseAdmin } from "../supabase/admin";
import {
  signUpSchema,
  signInSchema,
  resetPasswordRequestSchema,
  resetPasswordSchema,
  exchangeCodeSchema,
} from "./auth.schemas";
import { ADMIN_ROLES, STAFF_ROLES, HOST_ROLES } from "./types";
import type { AppRole, AccountStatus, RouterAuthContext } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCookieHeader(): string | null {
  try {
    const req = getRequest();
    return req.headers.get("cookie");
  } catch {
    return null;
  }
}

/** Read-only client for session checks (middleware, getSession, getRouterAuth). */
function getSsrClient() {
  return createSsrSupabaseClient(getCookieHeader());
}

/** Writable client for auth mutations that must set/clear session cookies. */
function getWritableSsrClient() {
  return createWritableSsrSupabaseClient(getCookieHeader());
}

// ---------------------------------------------------------------------------
// Sign Up
// ---------------------------------------------------------------------------

export const signUp = createServerFn({ method: "POST" })
  .inputValidator(signUpSchema)
  .handler(async ({ data }) => {
    const supabase = getWritableSsrClient();
    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          first_name: data.firstName,
          last_name: data.lastName,
          full_name: `${data.firstName} ${data.lastName}`,
        },
        emailRedirectTo: `${process.env.APP_URL ?? ""}/auth/callback`,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      userId: authData.user?.id ?? null,
      needsEmailVerification: !authData.session,
    };
  });

// ---------------------------------------------------------------------------
// Sign In
// ---------------------------------------------------------------------------

export const signIn = createServerFn({ method: "POST" })
  .inputValidator(signInSchema)
  .handler(async ({ data }) => {
    const supabase = getWritableSsrClient();
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      throw new Error(error.message);
    }

    // Resolve roles so the login page can redirect to the correct dashboard.
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id);

    const roles = (roleRows ?? []).map((r) => r.role as AppRole);

    return {
      userId: authData.user.id,
      accessToken: authData.session.access_token,
      isAdmin: roles.some((r) => ADMIN_ROLES.includes(r)),
      isHost: roles.some((r) => HOST_ROLES.includes(r)),
      isTraveler: roles.includes("traveler"),
    };
  });

// ---------------------------------------------------------------------------
// Sign Out
// ---------------------------------------------------------------------------

export const signOut = createServerFn({ method: "POST" })
  .inputValidator(z.object({}))
  .handler(async () => {
    const supabase = getWritableSsrClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Get Session (lightweight — returns basic user info)
// ---------------------------------------------------------------------------

export const getSession = createServerFn({ method: "GET" })
  .inputValidator(z.object({}))
  .handler(async () => {
    const supabase = getSsrClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    const { data: { session } } = await supabase.auth.getSession();

    return {
      userId: user.id,
      email: user.email ?? null,
      emailConfirmedAt: user.email_confirmed_at ?? null,
      accessToken: session?.access_token ?? null,
    };
  });

// ---------------------------------------------------------------------------
// Get Router Auth
// Returns the full AuthSessionContext for the root loader.
// This is a createServerFn so it always runs server-side, even during
// client-side navigation, ensuring the loader always has the current session.
// ---------------------------------------------------------------------------

export const getRouterAuth = createServerFn({ method: "GET" })
  .inputValidator(z.object({}))
  .handler(async ({ context }) => {
    // The sessionMiddleware already ran for this request and populated context.auth.
    // Read it directly to avoid redundant DB round-trips.
    const middlewareAuth = (context as Record<string, unknown>).auth as
      | RouterAuthContext
      | undefined;

    if (middlewareAuth !== undefined) {
      return middlewareAuth ?? null;
    }

    // Fallback: re-derive from cookie when the middleware context is unavailable
    // (e.g. cold-start edge cases or test environments).
    try {
      const supabase = getSsrClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return null;

      const { data: { session } } = await supabase.auth.getSession();

      const [{ data: roleRows }, { data: profile }] = await Promise.all([
        supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id),
        supabaseAdmin
          .from("profiles")
          .select("account_status")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      const roles = (roleRows ?? []).map((r: { role: string }) => r.role as AppRole);
      const accountStatus =
        ((profile as { account_status: string } | null)?.account_status as AccountStatus) ??
        "pending_email_verification";

      return {
        user: {
          id: user.id,
          email: user.email ?? null,
          phone: user.phone ?? null,
          emailConfirmedAt: user.email_confirmed_at ?? null,
        },
        roles: {
          roles,
          isAdmin: roles.some((r) => ADMIN_ROLES.includes(r)),
          isStaff: roles.some((r) => STAFF_ROLES.includes(r)),
          isHost: roles.some((r) => HOST_ROLES.includes(r)),
          isTraveler: roles.includes("traveler"),
        },
        accountStatus,
        accessToken: session?.access_token ?? "",
      } satisfies NonNullable<RouterAuthContext>;
    } catch {
      return null;
    }
  });

// ---------------------------------------------------------------------------
// Request Password Reset
// ---------------------------------------------------------------------------

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator(resetPasswordRequestSchema)
  .handler(async ({ data }) => {
    const supabase = getSsrClient();
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${process.env.APP_URL ?? ""}/auth/reset-password`,
    });

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  });

// ---------------------------------------------------------------------------
// Update Password
// ---------------------------------------------------------------------------

export const updatePassword = createServerFn({ method: "POST" })
  .inputValidator(resetPasswordSchema)
  .handler(async ({ data }) => {
    const supabase = getSsrClient();
    const { error } = await supabase.auth.updateUser({
      password: data.password,
    });

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  });

// ---------------------------------------------------------------------------
// Exchange Code for Session (PKCE callback)
// ---------------------------------------------------------------------------

export const exchangeCodeForSession = createServerFn({ method: "POST" })
  .inputValidator(exchangeCodeSchema)
  .handler(async ({ data }) => {
    const supabase = getWritableSsrClient();
    const { data: authData, error } = await supabase.auth.exchangeCodeForSession(data.code);

    if (error) {
      throw new Error(error.message);
    }

    return {
      userId: authData.user.id,
      accessToken: authData.session.access_token,
    };
  });

// ---------------------------------------------------------------------------
// Activate Account
// ---------------------------------------------------------------------------

export const activateAccount = createServerFn({ method: "POST" })
  .inputValidator(z.object({}))
  .handler(async () => {
    const supabase = getSsrClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email_confirmed_at) {
      throw new Error("Email not yet verified");
    }

    const { error } = await supabase
      .from("profiles")
      .update({ account_status: "active" })
      .eq("id", user.id)
      .eq("account_status", "pending_email_verification");

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  });
