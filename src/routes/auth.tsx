// =============================================================================
// src/routes/auth.tsx
// Auth layout shell — wraps all /auth/* routes.
// Redirects already-authenticated active users away from auth pages.
// =============================================================================

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  beforeLoad: async ({ context, location }) => {
    const auth = context.auth;

    // Active authenticated users have no business on auth pages
    if (auth?.accountStatus === "active") {
      throw redirect({ to: "/" });
    }

    // Users awaiting email verification should stay on the verify-email page
    if (
      auth?.accountStatus === "pending_email_verification" &&
      !location.pathname.startsWith("/auth/verify-email") &&
      !location.pathname.startsWith("/auth/callback")
    ) {
      throw redirect({ to: "/auth/verify-email" });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  );
}
