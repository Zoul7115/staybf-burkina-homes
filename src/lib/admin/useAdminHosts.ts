import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { AdminHostRow } from "./types";

type RawRow = {
  id: string;
  status: string;
  superhost: boolean;
  verified_at: string | null;
  host_since: string | null;
  company_name: string | null;
  created_at: string;
  profiles: {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    country: string | null;
    account_status: string;
  } | {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    country: string | null;
    account_status: string;
  }[] | null;
};

type RawPropertyCount = { host_id: string };

function unwrapProfile(v: RawRow["profiles"]): RawRow["profiles"] extends (infer U)[] ? U : RawRow["profiles"] {
  if (!v) return null as never;
  return (Array.isArray(v) ? v[0] ?? null : v) as never;
}

export type UseAdminHostsReturn = {
  hosts: AdminHostRow[];
  loading: boolean;
  error: string | null;
  updateHostStatus: (id: string, status: string) => Promise<void>;
};

export function useAdminHosts(): UseAdminHostsReturn {
  const [hosts, setHosts] = useState<AdminHostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      const [hostsRes, propsRes] = await Promise.all([
        db.from("host_profiles").select(`
          id, status, superhost, verified_at, host_since, company_name, created_at,
          profiles!id(full_name, email, avatar_url, country, account_status)
        `).order("created_at", { ascending: false }).limit(200),
        db.from("properties").select("host_id").limit(2000),
      ]);

      if (cancelled) return;

      if (hostsRes.error) { setError(hostsRes.error.message); setLoading(false); return; }

      // Build property count map
      const propCounts: Record<string, number> = {};
      ((propsRes.data ?? []) as RawPropertyCount[]).forEach((p) => {
        propCounts[p.host_id] = (propCounts[p.host_id] ?? 0) + 1;
      });

      const mapped: AdminHostRow[] = ((hostsRes.data ?? []) as RawRow[]).map((h) => {
        const p = unwrapProfile(h.profiles);
        return {
          id: h.id,
          name: p?.full_name ?? null,
          email: p?.email ?? null,
          avatarUrl: p?.avatar_url ?? null,
          city: p?.country ?? null,
          companyName: h.company_name ?? null,
          status: h.status,
          verifiedAt: h.verified_at ?? null,
          superhost: h.superhost,
          propertiesCount: propCounts[h.id] ?? 0,
          accountStatus: p?.account_status ?? "active",
          hostSince: h.host_since ?? null,
          createdAt: h.created_at,
        };
      });

      setHosts(mapped);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Only works for super_admin (RLS: super_admin write-any on host_profiles)
  const updateHostStatus = useCallback(async (id: string, status: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any).from("host_profiles").update({ status }).eq("id", id);
    if (dbErr) throw new Error(dbErr.message);
    setHosts((prev) => prev.map((h) => h.id === id ? { ...h, status } : h));
  }, []);

  return { hosts, loading, error, updateHostStatus };
}
