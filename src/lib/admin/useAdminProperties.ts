import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { callEdgeFunction } from "@/lib/storage";
import type { AdminPropertyRow } from "./types";

type RawRow = {
  id: string; name: string; status: string; type: string | null; created_at: string;
  cities: { name: string } | { name: string }[] | null;
  host_profiles: { profiles: { full_name: string | null } | { full_name: string | null }[] | null } | { profiles: unknown }[] | null;
  rooms: { id: string }[] | null;
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function fetchAdminProperties(): Promise<AdminPropertyRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbErr } = await (supabase as any)
    .from("properties")
    .select(`id,name,status,type,created_at,cities!city_id(name),host_profiles!host_id(profiles!id(full_name)),rooms!property_id(id)`)
    .order("created_at", { ascending: false })
    .limit(300);

  if (dbErr) throw new Error(dbErr.message);

  return ((data ?? []) as RawRow[]).map((p) => {
    const hp = Array.isArray(p.host_profiles) ? p.host_profiles[0] : p.host_profiles;
    const profileNode = (hp as { profiles: { full_name: string | null } | { full_name: string | null }[] | null } | null)?.profiles;
    const hostName = (Array.isArray(profileNode) ? profileNode[0] : profileNode)?.full_name ?? null;
    return {
      id: p.id, name: p.name, status: p.status, propertyType: p.type ?? null,
      cityName: unwrap(p.cities)?.name ?? null, hostName,
      roomsCount: Array.isArray(p.rooms) ? p.rooms.length : 0, createdAt: p.created_at,
    };
  });
}

export type UseAdminPropertiesReturn = {
  properties: AdminPropertyRow[];
  loading: boolean;
  error: string | null;
  approveProperty: (propertyId: string, reason: string) => Promise<void>;
  rejectProperty: (propertyId: string, reason: string) => Promise<void>;
  actioning: boolean;
  actionError: string | null;
};

export function useAdminProperties(): UseAdminPropertiesReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.adminProperties();

  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: fetchAdminProperties });

  const approveMutation = useMutation({
    mutationFn: ({ propertyId, reason }: { propertyId: string; reason: string }) =>
      callEdgeFunction("approve-property", { property_id: propertyId, reason }),
    onMutate: async ({ propertyId }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<AdminPropertyRow[]>(KEY);
      queryClient.setQueryData<AdminPropertyRow[]>(KEY, (old) =>
        (old ?? []).map((p) => p.id === propertyId ? { ...p, status: "published" } : p)
      );
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ propertyId, reason }: { propertyId: string; reason: string }) =>
      callEdgeFunction("reject-property", { property_id: propertyId, reason }),
    onMutate: async ({ propertyId }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<AdminPropertyRow[]>(KEY);
      queryClient.setQueryData<AdminPropertyRow[]>(KEY, (old) =>
        (old ?? []).map((p) => p.id === propertyId ? { ...p, status: "rejected" } : p)
      );
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  return {
    properties: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    approveProperty: (propertyId, reason) => approveMutation.mutateAsync({ propertyId, reason }).then(() => undefined),
    rejectProperty: (propertyId, reason) => rejectMutation.mutateAsync({ propertyId, reason }).then(() => undefined),
    actioning: approveMutation.isPending || rejectMutation.isPending,
    actionError: (approveMutation.error ?? rejectMutation.error)?.message ?? null,
  };
}
