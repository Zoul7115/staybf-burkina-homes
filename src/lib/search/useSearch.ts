import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
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

async function fetchSearch(filters: SearchFilters): Promise<SearchResult[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("properties")
    .select(SELECT)
    .eq("status", "published")
    .is("deleted_at", null);

  if (filters.city) {
    const { data: cityRow } = await (supabase as any)
      .from("cities")
      .select("id")
      .eq("name", filters.city)
      .maybeSingle();
    if (cityRow?.id) query = query.eq("city_id", cityRow.id);
  }

  query = query.gte("min_price_fcfa", filters.minPrice).lte("min_price_fcfa", filters.maxPrice);

  if (filters.types.length > 0) query = query.in("type", filters.types);
  if (filters.minRating > 0) query = query.gte("rating_avg", filters.minRating);
  if (filters.searchText.trim()) query = query.ilike("name", `%${filters.searchText.trim()}%`);

  if (filters.sort === "cheapest") {
    query = query.order("min_price_fcfa", { ascending: true, nullsFirst: false });
  } else if (filters.sort === "expensive") {
    query = query.order("min_price_fcfa", { ascending: false, nullsFirst: false });
  } else {
    query = query.order("rating_avg", { ascending: false, nullsFirst: false });
  }

  const { data, error: dbErr } = await query;
  if (dbErr) throw new Error(dbErr.message);

  let rows = ((data ?? []) as RawPropertyRow[]).map(mapRow);

  if (filters.amenities.length > 0) {
    rows = rows.filter((r) => filters.amenities.every((a) => r.amenities.includes(a)));
  }

  return rows;
}

// useEffect here is for UI debouncing (not data fetching) — allowed under the migration rules.
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function useSearch(filters: SearchFilters): {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  total: number;
} {
  const debouncedFilters = useDebounced(filters, 300);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.search(debouncedFilters),
    queryFn: () => fetchSearch(debouncedFilters),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  return { results: data ?? [], loading: isLoading, error: error?.message ?? null, total: (data ?? []).length };
}
