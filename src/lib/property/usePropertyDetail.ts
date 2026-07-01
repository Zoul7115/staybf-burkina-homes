// =============================================================================
// src/lib/property/usePropertyDetail.ts
// Shared hook: fetch a single published property from Supabase by UUID.
// Used by: properties.$id.tsx, checkout.tsx, checkout.success.tsx,
//          booking.confirmation.tsx
// =============================================================================

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  SupabasePropertyDetail,
  PropertyImage,
  PropertyRoom,
  PropertyAmenity,
  PropertyReview,
  PropertyHost,
  SimilarProperty,
} from "./types";

export const PLACEHOLDER_IMG = "https://placehold.co/800x500?text=StayBF";
const IMAGE_BUCKET = "property-images";

export function toPublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl ?? PLACEHOLDER_IMG;
}

export function coverImageUrl(images: PropertyImage[]): string {
  const cover = images.find((img) => img.is_cover) ?? images[0] ?? null;
  return cover ? toPublicUrl(cover.storage_path) : PLACEHOLDER_IMG;
}

// Initials from "Prénom Nom" → "PN"
export function getInitials(fullName: string | null | undefined): string {
  if (!fullName) return "?";
  return fullName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatResponseTime(minutes: number | null | undefined): string {
  if (!minutes) return "—";
  if (minutes < 60) return "moins d'une heure";
  if (minutes < 240) return "quelques heures";
  if (minutes < 1440) return "dans la journée";
  return "quelques jours";
}

type UsePropertyDetailResult = {
  data: SupabasePropertyDetail | null;
  loading: boolean;
  notFound: boolean;
};

export function usePropertyDetail(id: string | undefined): UsePropertyDetailResult {
  const [data, setData] = useState<SupabasePropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setData(null);

    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: raw, error } = await (supabase as any)
        .from("properties")
        .select(`
          id,
          name,
          type,
          description_md,
          address,
          latitude,
          longitude,
          rating_avg,
          rating_count,
          min_price_fcfa,
          check_in_from,
          check_out_until,
          house_rules,
          cities!city_id(id, name),
          property_images(id, storage_path, alt, position, is_cover),
          rooms!property_id(id, name, type, max_guests, beds, base_price_fcfa, status),
          amenities_map!property_id(
            amenities!amenity_id(id, slug, label_fr, label_en, icon, category)
          ),
          host_profiles!host_id(
            id,
            bio,
            superhost,
            response_rate,
            response_time_minutes,
            host_since,
            verified,
            profiles!id(full_name, avatar_url)
          )
        `)
        .eq("id", id)
        .eq("status", "published")
        .is("deleted_at", null)
        .maybeSingle();

      if (cancelled) return;

      if (error || !raw) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const images: PropertyImage[] = ((raw.property_images ?? []) as PropertyImage[])
        .sort((a, b) => a.position - b.position);

      const rooms: PropertyRoom[] = (raw.rooms ?? []) as PropertyRoom[];

      const amenities: PropertyAmenity[] = (
        (raw.amenities_map ?? []) as { amenities: PropertyAmenity | null }[]
      )
        .map((m) => m.amenities)
        .filter((a): a is PropertyAmenity => a !== null);

      let host: PropertyHost | null = null;
      if (raw.host_profiles) {
        const hp = raw.host_profiles as {
          id: string;
          bio: string | null;
          superhost: boolean;
          response_rate: number | null;
          response_time_minutes: number | null;
          host_since: string | null;
          verified: boolean;
          profiles: { full_name: string | null; avatar_url: string | null } | null;
        };
        host = {
          id: hp.id,
          full_name: hp.profiles?.full_name ?? null,
          avatar_url: hp.profiles?.avatar_url ?? null,
          superhost: hp.superhost,
          response_rate: hp.response_rate,
          response_time_minutes: hp.response_time_minutes,
          host_since: hp.host_since,
          verified: hp.verified,
          bio: hp.bio,
        };
      }

      // Reviews via bookings join (no direct property_id on reviews table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: reviewRows } = await (supabase as any)
        .from("reviews")
        .select(`
          id,
          overall_rating,
          body,
          created_at,
          bookings!booking_id(property_id),
          reviewer:profiles!reviewer_id(id, full_name, avatar_url)
        `)
        .eq("bookings.property_id", id)
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(20);

      const reviews: PropertyReview[] = (reviewRows ?? []) as PropertyReview[];

      // Similar: prefer same city, fill with same type if needed
      const cityId = (raw.cities as { id: string; name: string } | null)?.id;
      let similar: SimilarProperty[] = [];

      if (cityId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: cityRows } = await (supabase as any)
          .from("properties")
          .select(`
            id, name, min_price_fcfa, rating_avg,
            cities!city_id(name),
            property_images(storage_path, is_cover, position)
          `)
          .eq("city_id", cityId)
          .eq("status", "published")
          .is("deleted_at", null)
          .neq("id", id)
          .limit(6);

        similar = normalizeSimilar(cityRows ?? []);
      }

      if (similar.length < 6) {
        const seen = new Set([id, ...similar.map((s) => s.id)]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: typeRows } = await (supabase as any)
          .from("properties")
          .select(`
            id, name, min_price_fcfa, rating_avg,
            cities!city_id(name),
            property_images(storage_path, is_cover, position)
          `)
          .eq("type", raw.type)
          .eq("status", "published")
          .is("deleted_at", null)
          .limit(6);

        for (const row of normalizeSimilar(typeRows ?? [])) {
          if (!seen.has(row.id)) {
            similar.push(row);
            seen.add(row.id);
            if (similar.length >= 6) break;
          }
        }
      }

      const property: SupabasePropertyDetail = {
        id: raw.id,
        name: raw.name,
        type: raw.type,
        description_md: raw.description_md ?? null,
        address: raw.address ?? null,
        latitude: raw.latitude ?? null,
        longitude: raw.longitude ?? null,
        rating_avg: raw.rating_avg ?? null,
        rating_count: raw.rating_count ?? 0,
        min_price_fcfa: raw.min_price_fcfa ?? null,
        check_in_from: raw.check_in_from ?? null,
        check_out_until: raw.check_out_until ?? null,
        house_rules: raw.house_rules ?? null,
        city: raw.cities ? { id: raw.cities.id, name: raw.cities.name } : null,
        images,
        rooms,
        amenities,
        reviews,
        host,
        similar,
      };

      if (!cancelled) {
        setData(property);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  return { data, loading, notFound };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RawSimilarRow = {
  id: string;
  name: string;
  min_price_fcfa: number | null;
  rating_avg: number | null;
  cities: { name: string } | null;
  property_images: { storage_path: string; is_cover: boolean; position: number }[];
};

function normalizeSimilar(rows: RawSimilarRow[]): SimilarProperty[] {
  return rows.map((s) => {
    const sorted = (s.property_images ?? []).sort((a, b) => a.position - b.position);
    const cover = sorted.find((img) => img.is_cover) ?? sorted[0] ?? null;
    return {
      id: s.id,
      name: s.name,
      city_name: s.cities?.name ?? "",
      min_price_fcfa: s.min_price_fcfa,
      rating_avg: s.rating_avg,
      image_url: cover ? toPublicUrl(cover.storage_path) : PLACEHOLDER_IMG,
    };
  });
}
