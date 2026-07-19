import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { AdminCityRow } from "./types";

type RawCity = { id: string; name: string; is_active: boolean };
type RawPropertyCount = { city_id: string };

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// keep unwrap in scope for future use
void unwrap;

async function fetchAdminCities(): Promise<AdminCityRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [citiesRes, propsRes] = await Promise.all([
    db.from("cities").select("id, name, is_active").order("name"),
    db.from("properties").select("city_id").limit(2000),
  ]);

  if (citiesRes.error) throw new Error(citiesRes.error.message);

  const propCounts: Record<string, number> = {};
  ((propsRes.data ?? []) as RawPropertyCount[]).forEach((p) => {
    propCounts[p.city_id] = (propCounts[p.city_id] ?? 0) + 1;
  });

  return ((citiesRes.data ?? []) as RawCity[]).map((c) => ({
    id: c.id, name: c.name, isActive: c.is_active,
    propertiesCount: propCounts[c.id] ?? 0,
    bookingsCount: 0, totalRevenueFcfa: 0,
  }));
}

export type UseAdminCitiesReturn = {
  cities: AdminCityRow[];
  loading: boolean;
  error: string | null;
  toggleActive: (id: string, current: boolean) => Promise<void>;
};

export function useAdminCities(): UseAdminCitiesReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.adminCities();

  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: fetchAdminCities });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any).from("cities").update({ is_active: next }).eq("id", id);
      if (dbErr) throw new Error(dbErr.message);
    },
    onMutate: async ({ id, next }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<AdminCityRow[]>(KEY);
      queryClient.setQueryData<AdminCityRow[]>(KEY, (old) => (old ?? []).map((c) => c.id === id ? { ...c, isActive: next } : c));
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  return {
    cities: data ?? [], loading: isLoading, error: error?.message ?? null,
    toggleActive: (id, current) => toggleMutation.mutateAsync({ id, next: !current }),
  };
}
