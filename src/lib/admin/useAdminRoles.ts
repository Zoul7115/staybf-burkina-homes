import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { AdminRoleCount, AdminAuditLogRow } from "./types";

type RawUserRole = { role: string };
type RawAuditLog = {
  id: string;
  action_type: string;
  target_table: string | null;
  target_id: string | null;
  notes: string | null;
  ip_address: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type UseAdminRolesReturn = {
  roleCounts: AdminRoleCount[];
  auditLogs: AdminAuditLogRow[];
  loading: boolean;
  error: string | null;
};

export function useAdminRoles(): UseAdminRolesReturn {
  const [roleCounts, setRoleCounts] = useState<AdminRoleCount[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      const [rolesRes, auditRes] = await Promise.all([
        db.from("user_roles").select("role"),
        db.from("admin_actions").select(`
          id, action_type, target_table, target_id, notes, ip_address, created_at,
          profiles!actor_id(full_name, email)
        `).order("created_at", { ascending: false }).limit(100),
      ]);

      if (cancelled) return;
      if (rolesRes.error && auditRes.error) {
        setError(rolesRes.error?.message ?? auditRes.error?.message);
        setLoading(false);
        return;
      }

      // Count by role
      const counts: Record<string, number> = {};
      ((rolesRes.data ?? []) as RawUserRole[]).forEach((r) => {
        counts[r.role] = (counts[r.role] ?? 0) + 1;
      });
      setRoleCounts(Object.entries(counts).map(([role, usersCount]) => ({ role, usersCount })));

      const mapped: AdminAuditLogRow[] = ((auditRes.data ?? []) as RawAuditLog[]).map((l) => {
        const actor = unwrap(l.profiles);
        return {
          id: l.id,
          actorName: actor?.full_name ?? null,
          actorEmail: actor?.email ?? null,
          actionType: l.action_type,
          targetTable: l.target_table,
          targetId: l.target_id,
          notes: l.notes,
          ipAddress: l.ip_address,
          createdAt: l.created_at,
        };
      });

      setAuditLogs(mapped);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { roleCounts, auditLogs, loading, error };
}
