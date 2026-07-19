// =============================================================================
// src/routes/auth/suspended.tsx
// Displayed when an authenticated user's account status is 'suspended'.
// =============================================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { signOut } from "../../lib/auth/auth.functions";

export const Route = createFileRoute("/auth/suspended")({
  component: SuspendedPage,
});

function SuspendedPage() {
  async function handleSignOut() {
    await signOut({ data: {} });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <svg
              className="h-8 w-8 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Account Suspended</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your account has been temporarily suspended. If you believe this is a mistake,
          please contact our support team.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href="mailto:support@staybf.com"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Contact Support
          </a>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
