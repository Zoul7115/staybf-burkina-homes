// =============================================================================
// src/lib/auth/types.ts
// Shared TypeScript types for session, roles, and router auth context.
// =============================================================================

export type AppRole =
  | "traveler"
  | "host"
  | "host_staff"
  | "support"
  | "finance"
  | "admin"
  | "super_admin";

export type AccountStatus =
  | "pending_email_verification"
  | "active"
  | "suspended"
  | "deactivated"
  | "deleted";

export interface SessionUser {
  id: string;
  email: string | null;
  phone: string | null;
  emailConfirmedAt: string | null;
}

export interface ResolvedRoles {
  roles: AppRole[];
  isAdmin: boolean;
  isStaff: boolean;
  isHost: boolean;
  isTraveler: boolean;
}

export interface AuthSessionContext {
  user: SessionUser;
  roles: ResolvedRoles;
  accountStatus: AccountStatus;
  accessToken: string;
}

/** Shape injected into TanStack Router context (null = unauthenticated) */
export type RouterAuthContext = AuthSessionContext | null;

// Role group constants
export const ADMIN_ROLES: AppRole[] = ["admin", "super_admin"];
export const STAFF_ROLES: AppRole[] = ["admin", "super_admin", "support", "finance"];
export const HOST_ROLES: AppRole[] = ["host", "host_staff"];
