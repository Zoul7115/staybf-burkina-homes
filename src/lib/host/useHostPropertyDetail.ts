import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { HostPropertyDetail, PropertyImage, PropertyAmenity, CancellationPolicy, PropertyStatus } from "./types";

type RawPropertyRow = {
  id: string; slug: string | null; name: string; type: string; address: string | null;
  latitude: number | null; longitude: number | null; description_md: string | null;
  status: string; instant_book: boolean; cancellation_policy: string | null;
  check_in_from: string | null; check_out_until: string | null;
  house_rules: Record<string, unknown> | null; rating_avg: number | null; rating_count: number;
  min_price_fcfa: number | null; published_at: string | null; created_at: string; updated_at: string;
  cities: { name: string } | null;
  property_images: { id: string; storage_path: string; alt: string | null; position: number; is_cover: boolean }[];
  amenities_map: { amenities: { id: string; key: string; label_fr: string } | null }[];
};

// ── Fetcher ───────────────────────────────────────────────────

async function fetchHostPropertyDetail(): Promise<HostPropertyDetail | null> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error(authErr?.message ?? "Non authentifié");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbErr } = await (supabase as any)
    .from("properties")
    .select(`id,slug,name,type,address,latitude,longitude,description_md,status,instant_book,cancellation_policy,check_in_from,check_out_until,house_rules,rating_avg,rating_count,min_price_fcfa,published_at,created_at,updated_at,cities!city_id(name),property_images(id,storage_path,alt,position,is_cover),amenities_map!property_id(amenities!amenity_id(id,key,label_fr))`)
    .eq("host_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (dbErr) throw new Error(dbErr.message);
  if (!data) return null;

  const raw = data as RawPropertyRow;

  const images: PropertyImage[] = (raw.property_images ?? []).sort((a, b) => a.position - b.position);
  const amenities: PropertyAmenity[] = (raw.amenities_map ?? [])
    .map((m) => m.amenities)
    .filter((a): a is { id: string; key: string; label_fr: string } => a !== null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [roomsRes, bookingsRes] = await Promise.all([
    (supabase as any).from("rooms").select("id", { count: "exact", head: true }).eq("property_id", raw.id).neq("status", "archived"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("bookings").select("id", { count: "exact", head: true }).eq("property_id", raw.id).in("status", ["confirmed", "checked_in", "completed"]),
  ]);

  return {
    id: raw.id, slug: raw.slug, name: raw.name, type: raw.type, address: raw.address,
    latitude: raw.latitude, longitude: raw.longitude, description_md: raw.description_md,
    status: raw.status as PropertyStatus, instant_book: raw.instant_book,
    cancellation_policy: raw.cancellation_policy as CancellationPolicy | null,
    check_in_from: raw.check_in_from, check_out_until: raw.check_out_until,
    house_rules: raw.house_rules, rating_avg: raw.rating_avg, rating_count: raw.rating_count,
    min_price_fcfa: raw.min_price_fcfa, published_at: raw.published_at,
    created_at: raw.created_at, updated_at: raw.updated_at,
    city_name: raw.cities?.name ?? null, images, amenities,
    room_count: roomsRes.count ?? 0, booking_count: bookingsRes.count ?? 0,
  };
}

// ── Hook ─────────────────────────────────────────────────────

export function useHostPropertyDetail(): { property: HostPropertyDetail | null; loading: boolean; error: string | null } {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.hostPropertyDetail("own"),
    queryFn: fetchHostPropertyDetail,
  });

  return { property: data ?? null, loading: isLoading, error: error?.message ?? null };
}
