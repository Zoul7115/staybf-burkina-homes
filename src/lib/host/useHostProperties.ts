import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { toPublicUrl, PLACEHOLDER_IMG } from "@/lib/shared";
import type { HostProperty } from "./types";

// ── Raw types ─────────────────────────────────────────────────

type RawPropertyRow = {
  id: string; name: string; type: string; address: string | null;
  latitude: number | null; longitude: number | null; description_md: string | null;
  status: string; instant_book: boolean; rating_avg: number | null; rating_count: number;
  min_price_fcfa: number | null; published_at: string | null;
  created_at: string; updated_at: string;
  cities: { name: string } | null;
  property_images: { storage_path: string; is_cover: boolean; position: number }[];
  amenities_map: { amenities: { label_fr: string | null } | null }[];
};

function mapProperty(row: RawPropertyRow): HostProperty {
  const sorted = [...(row.property_images ?? [])].sort((a, b) => a.position - b.position);
  const cover = sorted.find((img) => img.is_cover) ?? sorted[0] ?? null;
  const amenityLabels = (row.amenities_map ?? [])
    .map((m) => m.amenities?.label_fr)
    .filter((l): l is string => typeof l === "string" && l.length > 0);
  return {
    id: row.id, name: row.name, type: row.type, address: row.address,
    latitude: row.latitude, longitude: row.longitude, description_md: row.description_md,
    status: row.status as HostProperty["status"], instant_book: row.instant_book,
    rating_avg: row.rating_avg, rating_count: row.rating_count, min_price_fcfa: row.min_price_fcfa,
    published_at: row.published_at, created_at: row.created_at, updated_at: row.updated_at,
    city_name: row.cities?.name ?? null,
    cover_image_url: cover ? toPublicUrl(cover.storage_path) : PLACEHOLDER_IMG,
    amenity_labels: amenityLabels,
  };
}

const SELECT = `id,name,type,address,latitude,longitude,description_md,status,instant_book,rating_avg,rating_count,min_price_fcfa,published_at,created_at,updated_at,cities!city_id(name),property_images(storage_path,is_cover,position),amenities_map!property_id(amenities!amenity_id(label_fr))`;

// ── Fetcher ───────────────────────────────────────────────────

async function fetchHostProperties(): Promise<HostProperty[]> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error(authErr?.message ?? "Non authentifié");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbErr } = await (supabase as any)
    .from("properties")
    .select(SELECT)
    .eq("host_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (dbErr) throw new Error(dbErr.message);
  return ((data ?? []) as RawPropertyRow[]).map(mapProperty);
}

// ── Hook ─────────────────────────────────────────────────────

export function useHostProperties(): { properties: HostProperty[]; loading: boolean; error: string | null } {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.hostProperties(),
    queryFn: fetchHostProperties,
  });

  return { properties: data ?? [], loading: isLoading, error: error?.message ?? null };
}
