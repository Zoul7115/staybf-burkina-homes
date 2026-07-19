// =============================================================================
// src/lib/auth/session.middleware.ts
// TanStack Start request middleware — validates the session cookie on every
// server request and injects auth context into the request pipeline.
// =============================================================================

import { createMiddleware } from "@tanstack/react-start";
import { createSsrSupabaseClient } from "../supabase/ssr.server";
import { supabaseAdmin } from "../supabase/admin";
import type { AuthSessionContext, AppRole, AccountStatus } from "./types";
import { ADMIN_ROLES, STAFF_ROLES, HOST_ROLES } from "./types";

export const sessionMiddleware = createMiddleware({ type: "request" }).server(
  async ({ request, next }) => {
    const cookieHeader = request.headers.get("cookie");

    let auth: AuthSessionContext | null = null;

    try {
      const supabase = createSsrSupabaseClient(cookieHeader);
      const { data: { user }, error } = await supabase.auth.getUser();

      if (!error && user) {
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token ?? "";

        // Fetch roles and profile via admin client (bypasses RLS for internal reads)
        const [{ data: roleRows }, { data: profile }] = await Promise.all([
          supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id),
          supabaseAdmin
            .from("profiles")
            .select("account_status")
            .eq("id", user.id)
            .maybeSingle(),
        ]);

        const roles: AppRole[] = (roleRows ?? []).map((r: { role: string }) => r.role as AppRole);
        const accountStatus: AccountStatus =
          ((profile as { account_status: string } | null)?.account_status as AccountStatus) ??
          "pending_email_verification";

        auth = {
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
          accessToken,
        };
      }
    } catch {
      auth = null;
    }

    return next({ context: { auth } });
  },
);
