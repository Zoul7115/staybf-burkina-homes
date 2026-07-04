import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { AdminRoleCount, AdminAuditLogRow } from "./types";

type RawUserRole = { role: string };
type RawAuditLog = {
  id: string; action_type: string; target_table: string | null; target_id: string | null;
  notes: string | null; ip_address: string | null; created_at: string;
  profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type AdminRolesData = { roleCounts: AdminRoleCount[]; auditLogs: AdminAuditLogRow[] };

async function fetchAdminRoles(): Promise<AdminRolesData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [rolesRes, auditRes] = await Promise.all([
    db.from("user_roles").select("role"),
    db.from("admin_actions").select(`id,action_type,target_table,target_id,notes,ip_address,created_at,profiles!actor_id(full_name,email)`).order("created_at", { ascending: false }).limit(100),
  ]);

  const counts: Record<string, number> = {};
  ((rolesRes.data ?? []) as RawUserRole[]).forEach((r) => {
    counts[r.role] = (counts[r.role] ?? 0) + 1;
  });
  const roleCounts = Object.entries(counts).map(([role, usersCount]) => ({ role, usersCount }));

  const auditLogs: AdminAuditLogRow[] = ((auditRes.data ?? []) as RawAuditLog[]).map((l) => {
    const actor = unwrap(l.profiles);
    return {
      id: l.id, actorName: actor?.full_name ?? null, actorEmail: actor?.email ?? null,
      actionType: l.action_type, targetTable: l.target_table, targetId: l.target_id,
      notes: l.notes, ipAddress: l.ip_address, createdAt: l.created_at,
    };
  });

  return { roleCounts, auditLogs };
}

export type UseAdminRolesReturn = {
  roleCounts: AdminRoleCount[];
  auditLogs: AdminAuditLogRow[];
  loading: boolean;
  error: string | null;
};

export function useAdminRoles(): UseAdminRolesReturn {
  const { data, isLoading, error } = useQuery({ queryKey: queryKeys.adminRoles(), queryFn: fetchAdminRoles });
  return {
    roleCounts: data?.roleCounts ?? [],
    auditLogs: data?.auditLogs ?? [],
    loading: isLoading,
    error: error?.message ?? null,
  };
}
