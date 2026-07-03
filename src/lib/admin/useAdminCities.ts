import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { AdminCityRow } from "./types";

type RawCity = {
  id: string;
  name: string;
  is_active: boolean;
};

type RawPropertyCount = { city_id: string };
type RawBookingCount = { rooms: { properties: { city_id: string } | { city_id: string }[] | null } | { properties: unknown }[] | null };
type RawPaymentForCity = { amount_fcfa: number; bookings: { rooms: { properties: { city_id: string } | { city_id: string }[] | null } | unknown[] | null } | unknown[] | null };

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type UseAdminCitiesReturn = {
  cities: AdminCityRow[];
  loading: boolean;
  error: string | null;
  toggleActive: (id: string, current: boolean) => Promise<void>;
};

export function useAdminCities(): UseAdminCitiesReturn {
  const [cities, setCities] = useState<AdminCityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      const [citiesRes, propsRes] = await Promise.all([
        db.from("cities").select("id, name, is_active").order("name"),
        db.from("properties").select("city_id").limit(2000),
      ]);

      if (cancelled) return;
      if (citiesRes.error) { setError(citiesRes.error.message); setLoading(false); return; }

      const propCounts: Record<string, number> = {};
      ((propsRes.data ?? []) as RawPropertyCount[]).forEach((p) => {
        propCounts[p.city_id] = (propCounts[p.city_id] ?? 0) + 1;
      });

      const mapped: AdminCityRow[] = ((citiesRes.data ?? []) as RawCity[]).map((c) => ({
        id: c.id,
        name: c.name,
        isActive: c.is_active,
        propertiesCount: propCounts[c.id] ?? 0,
        bookingsCount: 0,
        totalRevenueFcfa: 0,
      }));

      setCities(mapped);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const toggleActive = useCallback(async (id: string, current: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any).from("cities").update({ is_active: !current }).eq("id", id);
    if (dbErr) throw new Error(dbErr.message);
    setCities((prev) => prev.map((c) => c.id === id ? { ...c, isActive: !current } : c));
  }, []);

  return { cities, loading, error, toggleActive };
}
