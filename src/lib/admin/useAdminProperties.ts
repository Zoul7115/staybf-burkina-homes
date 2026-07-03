import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { AdminPropertyRow } from "./types";

type RawRow = {
  id: string;
  name: string;
  status: string;
  property_type: string | null;
  created_at: string;
  cities: { name: string } | { name: string }[] | null;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
  rooms: { id: string }[] | null;
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type UseAdminPropertiesReturn = {
  properties: AdminPropertyRow[];
  loading: boolean;
  error: string | null;
};

export function useAdminProperties(): UseAdminPropertiesReturn {
  const [properties, setProperties] = useState<AdminPropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: dbErr } = await (supabase as any)
        .from("properties")
        .select(`
          id, name, status, property_type, created_at,
          cities!city_id(name),
          profiles!host_id(full_name),
          rooms!property_id(id)
        `)
        .order("created_at", { ascending: false })
        .limit(300);

      if (cancelled) return;
      if (dbErr) { setError(dbErr.message); setLoading(false); return; }

      const mapped: AdminPropertyRow[] = ((data ?? []) as RawRow[]).map((p) => {
        const city = unwrap(p.cities);
        const host = unwrap(p.profiles);
        const rooms = Array.isArray(p.rooms) ? p.rooms.length : 0;
        return {
          id: p.id,
          name: p.name,
          status: p.status,
          propertyType: p.property_type ?? null,
          cityName: city?.name ?? null,
          hostName: host?.full_name ?? null,
          roomsCount: rooms,
          createdAt: p.created_at,
        };
      });

      setProperties(mapped);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { properties, loading, error };
}
