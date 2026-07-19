import { toPublicUrl, PLACEHOLDER_IMG } from "@/lib/shared";
import type { SearchResult } from "./types";

// ---------------------------------------------------------------------------
// Burkina Faso bounding box — same reference as sections.tsx
// ---------------------------------------------------------------------------

const BF_LAT = { min: 9, max: 15.5 };
const BF_LNG = { min: -5.5, max: 2.5 };

function latToY(lat: number | null): number {
  const v = lat ?? 12.37; // Ouagadougou default
  return Math.max(0, Math.min(1, 1 - (v - BF_LAT.min) / (BF_LAT.max - BF_LAT.min)));
}

function lngToX(lng: number | null): number {
  const v = lng ?? -1.53; // Ouagadougou default
  return Math.max(0, Math.min(1, (v - BF_LNG.min) / (BF_LNG.max - BF_LNG.min)));
}

// ---------------------------------------------------------------------------
// Type normalisation
// Supabase may store type values in different casing or slug form.
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  hotel: "Hôtel",
  hôtel: "Hôtel",
  résidence: "Résidence",
  residence: "Résidence",
  villa: "Villa",
  appartement: "Appartement",
  apartment: "Appartement",
  maison_hotes: "Maison d'hôtes",
  "maison d'hôtes": "Maison d'hôtes",
  maison_dhotes: "Maison d'hôtes",
};

function normalizeType(raw: string | null): string {
  if (!raw) return "";
  return TYPE_LABELS[raw.toLowerCase()] ?? raw;
}

// ---------------------------------------------------------------------------
// Raw Supabase row shape (matches the SELECT in useSearch)
// ---------------------------------------------------------------------------

export type RawPropertyRow = {
  id: string;
  name: string;
  type: string | null;
  address: string | null;
  min_price_fcfa: number | null;
  rating_avg: number | null;
  rating_count: number | null;
  latitude: number | null;
  longitude: number | null;
  cities: { name: string } | null;
  property_images: { storage_path: string; is_cover: boolean; position: number }[];
  amenities_map: { amenities: { label_fr: string | null } | null }[];
  host_profiles: { verified: boolean } | null;
};

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

export function mapRow(row: RawPropertyRow): SearchResult {
  const sorted = (row.property_images ?? []).sort((a, b) => a.position - b.position);
  const cover = sorted.find((i) => i.is_cover) ?? sorted[0] ?? null;

  const amenities = (row.amenities_map ?? [])
    .map((m) => m.amenities?.label_fr)
    .filter((label): label is string => typeof label === "string" && label.length > 0);

  return {
    id: row.id,
    name: row.name,
    city: row.cities?.name ?? "",
    address: row.address,
    type: normalizeType(row.type),
    price: row.min_price_fcfa ?? 0,
    rating: row.rating_avg ?? 0,
    reviews: row.rating_count ?? 0,
    image: cover ? toPublicUrl(cover.storage_path) : PLACEHOLDER_IMG,
    amenities,
    verified: row.host_profiles?.verified ?? false,
    mapX: lngToX(row.longitude),
    mapY: latToY(row.latitude),
  };
}
