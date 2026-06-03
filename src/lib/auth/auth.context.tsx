// =============================================================================
// src/lib/auth/auth.context.tsx
// React context that wraps the Supabase auth state change listener.
// Bridges browser-side auth events to TanStack Router's navigation.
// =============================================================================

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
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
  // Keep a ref so the effect closure always sees the latest auth value
  const authRef = useRef<RouterAuthContext>(initialAuth);
  authRef.current = initialAuth;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        // Reload server loaders so the session middleware re-resolves roles/status
        router.invalidate();
      } else if (event === "SIGNED_OUT") {
        router.navigate({ to: "/auth/login" });
      } else if (event === "TOKEN_REFRESHED") {
        router.invalidate();
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <AuthContext.Provider value={{ auth: initialAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  return useContext(AuthContext);
}
