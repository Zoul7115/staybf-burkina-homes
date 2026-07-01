import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { mapRow, type RawPropertyRow } from "./mapper";
import type { SearchFilters, SearchResult } from "./types";

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

const DEBOUNCE_MS = 300;

export function useSearch(filters: SearchFilters): {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  total: number;
} {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filtersKey = JSON.stringify(filters);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from("properties")
        .select(SELECT)
        .eq("status", "published")
        .is("deleted_at", null);

      if (filters.city) {
        query = query.eq("cities.name", filters.city);
      }

      query = query
        .gte("min_price_fcfa", filters.minPrice)
        .lte("min_price_fcfa", filters.maxPrice);

      if (filters.types.length > 0) {
        query = query.in("type", filters.types);
      }

      if (filters.minRating > 0) {
        query = query.gte("rating_avg", filters.minRating);
      }

      if (filters.searchText.trim()) {
        query = query.ilike("name", `%${filters.searchText.trim()}%`);
      }

      if (filters.sort === "cheapest") {
        query = query.order("min_price_fcfa", { ascending: true, nullsFirst: false });
      } else if (filters.sort === "expensive") {
        query = query.order("min_price_fcfa", { ascending: false, nullsFirst: false });
      } else {
        query = query.order("rating_avg", { ascending: false, nullsFirst: false });
      }

      const { data, error: dbErr } = await query;

      if (cancelled) return;

      if (dbErr) {
        setError(dbErr.message);
        setLoading(false);
        return;
      }

      let rows = ((data ?? []) as RawPropertyRow[]).map(mapRow);

      // Amenities: client-side intersection (PostgREST cannot do ALL-match on junction tables)
      if (filters.amenities.length > 0) {
        rows = rows.filter((r) =>
          filters.amenities.every((a) => r.amenities.includes(a))
        );
      }

      setResults(rows);
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  return { results, loading, error, total: results.length };
}
