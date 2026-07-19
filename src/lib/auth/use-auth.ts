// =============================================================================
// src/lib/auth/use-auth.ts
// Hooks for consuming auth context in components.
// =============================================================================

import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthContext } from "./auth.context";
import type { AuthSessionContext, ResolvedRoles } from "./types";

/** Returns the current auth context (null if unauthenticated) */
export function useAuth(): AuthSessionContext | null {
  const { auth } = useAuthContext();
  return auth;
}

/**
 * Like useAuth() but redirects to /auth/login if the user is not authenticated.
 * Use in protected page components as a safety net; prefer beforeLoad guards
 * in route definitions for hard enforcement.
 */
export function useRequireAuth(redirectTo = "/auth/login"): AuthSessionContext {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth) {
      navigate({ to: redirectTo });
    }
  }, [auth, navigate, redirectTo]);

  if (!auth) {
    // Return a safe placeholder while the redirect is in flight
    return {
      user: { id: "", email: null, phone: null, emailConfirmedAt: null },
      roles: { roles: [], isAdmin: false, isStaff: false, isHost: false, isTraveler: false },
      accountStatus: "pending_email_verification",
      accessToken: "",
    };
  }

  return auth;
}

/** Convenience hook to read the resolved roles without the full auth object */
export function useRoles(): ResolvedRoles {
  const auth = useAuth();
  return auth?.roles ?? {
    roles: [],
    isAdmin: false,
    isStaff: false,
    isHost: false,
    isTraveler: false,
  };
}
