// =============================================================================
// src/lib/auth/auth.context.tsx
// React context that wraps the Supabase auth state change listener.
// Bridges browser-side auth events to TanStack Router's navigation.
// =============================================================================

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "../supabase/client";
import type { RouterAuthContext } from "./types";

interface AuthContextValue {
  auth: RouterAuthContext;
}

const AuthContext = createContext<AuthContextValue>({ auth: null });

interface AuthProviderProps {
  children: ReactNode;
  initialAuth: RouterAuthContext;
}

export function AuthProvider({ children, initialAuth }: AuthProviderProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      console.log("[AuthProvider onAuthStateChange] event =", event, "| currentPath =", window.location.pathname);
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        // Re-run the root loader (getRouterAuth server fn) to pick up the new session.
        console.log("[AuthProvider] → router.invalidate()");
        router.invalidate();
      } else if (event === "SIGNED_OUT") {
        // Purge all cached server data — user-specific data must not leak between sessions.
        console.log("[AuthProvider] → SIGNED_OUT → navigate /auth/login");
        queryClient.clear();
        router.navigate({ to: "/auth/login" });
      }
    });

    return () => subscription.unsubscribe();
  }, [router, queryClient]);

  // Memoize so consumers only re-render when initialAuth actually changes.
  // initialAuth is updated by the root loader (getRouterAuth) on every navigation
  // and after router.invalidate(), so it always reflects the current session.
  const value = useMemo(() => ({ auth: initialAuth }), [initialAuth]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  return useContext(AuthContext);
}
