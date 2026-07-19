// =============================================================================
// src/lib/property/types.ts
// TypeScript types mapped from real Supabase schema columns.
// No mocks. No `any`. These drive the entire property detail page.
// =============================================================================

export type BedItem = {
  type: string; // "double" | "single" | "king" | "queen" | "bunk" | "sofa"
  count: number;
};

export type PropertyImage = {
  id: string;
  storage_path: string;
  alt: string | null;
  is_cover: boolean;
  position: number;
};

export type PropertyRoom = {
  id: string;
  name: string;
  type: string;
  max_guests: number;
  beds: BedItem[];
  base_price_fcfa: number;
  status: string;
};

export type PropertyAmenity = {
  id: string;
  slug: string;
  label_fr: string;
  label_en: string | null;
  icon: string | null;
  category: string | null;
};

export type PropertyReview = {
  id: string;
  overall_rating: number;
  body: string;
  created_at: string;
  reviewer: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

// host_profiles (verified hosts only) + profiles (name, avatar)
export type PropertyHost = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  superhost: boolean;
  response_rate: number | null;
  response_time_minutes: number | null;
  host_since: string | null; // ISO date
  verified: boolean;
  bio: string | null;
};

export type SimilarProperty = {
  id: string;
  name: string;
  city_name: string;
  min_price_fcfa: number | null;
  rating_avg: number | null;
  image_url: string | null;
};

export type SupabasePropertyDetail = {
  // properties columns
  id: string;
  name: string;
  type: string;
  description_md: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  rating_avg: number | null;
  rating_count: number;
  min_price_fcfa: number | null;
  check_in_from: string | null;
  check_out_until: string | null;
  house_rules: string[] | null;
  // relations
  city: { id: string; name: string } | null;
  images: PropertyImage[];
  rooms: PropertyRoom[];
  amenities: PropertyAmenity[];
  reviews: PropertyReview[];
  host: PropertyHost | null;
  similar: SimilarProperty[];
};
