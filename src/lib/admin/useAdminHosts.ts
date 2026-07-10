import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { AdminHostRow } from "./types";

type RawRow = {
  id: string; status: string; superhost: boolean; verified_at: string | null;
  host_since: string | null; company_name: string | null; created_at: string;
  profiles: { full_name: string | null; email: string | null; avatar_url: string | null; country: string | null; account_status: string } | { full_name: string | null; email: string | null; avatar_url: string | null; country: string | null; account_status: string }[] | null;
};
type RawPropertyCount = { host_id: string };

function unwrapProfile(v: RawRow["profiles"]): { full_name: string | null; email: string | null; avatar_url: string | null; country: string | null; account_status: string } | null {
  if (!v) return null;
  return (Array.isArray(v) ? v[0] ?? null : v) as { full_name: string | null; email: string | null; avatar_url: string | null; country: string | null; account_status: string } | null;
}

async function fetchAdminHosts(): Promise<AdminHostRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [hostsRes, propsRes] = await Promise.all([
    db.from("host_profiles").select(`id,status,superhost,verified_at,host_since,company_name,created_at,profiles!id(full_name,email,avatar_url,country,account_status)`).order("created_at", { ascending: false }).limit(200),
    db.from("properties").select("host_id").limit(2000),
  ]);

  if (hostsRes.error) throw new Error(hostsRes.error.message);
  if (propsRes.error) throw new Error(propsRes.error.message);

  const propCounts: Record<string, number> = {};
  ((propsRes.data ?? []) as RawPropertyCount[]).forEach((p) => {
    propCounts[p.host_id] = (propCounts[p.host_id] ?? 0) + 1;
  });

  return ((hostsRes.data ?? []) as RawRow[]).map((h) => {
    const p = unwrapProfile(h.profiles);
    return {
      id: h.id, name: p?.full_name ?? null, email: p?.email ?? null, avatarUrl: p?.avatar_url ?? null,
      city: p?.country ?? null, companyName: h.company_name ?? null, status: h.status,
      verifiedAt: h.verified_at ?? null, superhost: h.superhost, propertiesCount: propCounts[h.id] ?? 0,
      accountStatus: p?.account_status ?? "active", hostSince: h.host_since ?? null, createdAt: h.created_at,
    };
  });
}

export type UseAdminHostsReturn = {
  hosts: AdminHostRow[];
  loading: boolean;
  error: string | null;
  updateHostStatus: (id: string, status: string) => Promise<void>;
};

export function useAdminHosts(): UseAdminHostsReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.adminHosts();

  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: fetchAdminHosts });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any).from("host_profiles").update({ status }).eq("id", id);
      if (dbErr) throw new Error(dbErr.message);
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<AdminHostRow[]>(KEY);
      queryClient.setQueryData<AdminHostRow[]>(KEY, (old) => (old ?? []).map((h) => h.id === id ? { ...h, status } : h));
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  return {
    hosts: data ?? [], loading: isLoading, error: error?.message ?? null,
    updateHostStatus: (id, status) => updateMutation.mutateAsync({ id, status }),
  };
}
