// =============================================================================
// src/lib/auth/auth.functions.ts
// Server functions for all authentication operations.
// All handlers run server-side only via createServerFn.
// =============================================================================

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { createSsrSupabaseClient } from "../supabase/ssr.server";
import {
  signUpSchema,
  signInSchema,
  resetPasswordRequestSchema,
  resetPasswordSchema,
  exchangeCodeSchema,
} from "./auth.schemas";

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

function getSsrClient() {
  return createSsrSupabaseClient(getCookieHeader());
}

// ---------------------------------------------------------------------------
// Sign Up
// ---------------------------------------------------------------------------

export const signUp = createServerFn({ method: "POST" })
  .inputValidator(signUpSchema)
  .handler(async ({ data }) => {
    const supabase = getSsrClient();
    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          first_name: data.firstName,
          last_name: data.lastName,
          full_name: `${data.firstName} ${data.lastName}`,
        },
        // Redirect to the auth callback route after email verification
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
    const supabase = getSsrClient();
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      userId: authData.user.id,
      accessToken: authData.session.access_token,
    };
  });

// ---------------------------------------------------------------------------
// Sign Out
// ---------------------------------------------------------------------------

export const signOut = createServerFn({ method: "POST" })
  .inputValidator(z.object({}))
  .handler(async () => {
    const supabase = getSsrClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Get Session
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

    // Always return success to prevent email enumeration
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Update Password (authenticated user changing their own password)
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
    const supabase = getSsrClient();
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
// Activate Account (transition from pending_email_verification → active)
// Called automatically after email verification via the auth callback route.
// ---------------------------------------------------------------------------

export const activateAccount = createServerFn({ method: "POST" })
  .inputValidator(z.object({}))
  .handler(async () => {
    const supabase = getSsrClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email_confirmed_at) {
      throw new Error("Email not yet verified");
    }

    // The handle_new_user trigger creates the profile with pending_email_verification.
    // After email confirmation, transition to active.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ account_status: "active" })
      .eq("id", user.id)
      .eq("account_status", "pending_email_verification");

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  });
