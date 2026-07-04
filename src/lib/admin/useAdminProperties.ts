import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { AdminPropertyRow } from "./types";

type RawRow = {
  id: string; name: string; status: string; property_type: string | null; created_at: string;
  cities: { name: string } | { name: string }[] | null;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
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
    .select(`id,name,status,property_type,created_at,cities!city_id(name),profiles!host_id(full_name),rooms!property_id(id)`)
    .order("created_at", { ascending: false })
    .limit(300);

  if (dbErr) throw new Error(dbErr.message);

  return ((data ?? []) as RawRow[]).map((p) => ({
    id: p.id, name: p.name, status: p.status, propertyType: p.property_type ?? null,
    cityName: unwrap(p.cities)?.name ?? null, hostName: unwrap(p.profiles)?.full_name ?? null,
    roomsCount: Array.isArray(p.rooms) ? p.rooms.length : 0, createdAt: p.created_at,
  }));
}

export type UseAdminPropertiesReturn = {
  properties: AdminPropertyRow[];
  loading: boolean;
  error: string | null;
};

export function useAdminProperties(): UseAdminPropertiesReturn {
  const { data, isLoading, error } = useQuery({ queryKey: queryKeys.adminProperties(), queryFn: fetchAdminProperties });
  return { properties: data ?? [], loading: isLoading, error: error?.message ?? null };
}
