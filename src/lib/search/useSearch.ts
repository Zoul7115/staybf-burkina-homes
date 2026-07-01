import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { mapRow, type RawPropertyRow } from "./mapper";
import type { SearchResult } from "./types";

const SELECT = `
  id,
  name,
  type,
  address,
  min_price_fcfa,
  rating_avg,
  rating_count,
  latitude,
  longitude,
  cities!city_id(name),
  property_images(storage_path, is_cover, position),
  amenities_map!property_id(
    amenities!amenity_id(label_fr)
  ),
  host_profiles!host_id(verified)
`;

export function useSearch(): {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  total: number;
} {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: dbErr } = await (supabase as any)
        .from("properties")
        .select(SELECT)
        .eq("status", "published")
        .is("deleted_at", null)
        .order("rating_avg", { ascending: false, nullsFirst: false });

      if (cancelled) return;

      if (dbErr) {
        setError(dbErr.message);
        setLoading(false);
        return;
      }

      setResults(((data ?? []) as RawPropertyRow[]).map(mapRow));
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { results, loading, error, total: results.length };
}
