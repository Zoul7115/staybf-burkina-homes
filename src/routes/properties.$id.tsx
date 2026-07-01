import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { PropertyGallery } from "@/components/property/PropertyGallery";
import {
  PropertyHeader, HostCard, Description, Amenities, RoomInfo,
  AvailabilityCalendar, BookingCard, Reviews, LocationMap,
  SimilarProperties, MobileBookingBar,
} from "@/components/property/sections";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchX } from "lucide-react";
import { PropertyProvider } from "@/lib/property/property.context";
import type { SupabasePropertyDetail, PropertyImage, PropertyRoom, PropertyAmenity, PropertyReview, PropertyHost, SimilarProperty } from "@/lib/property/types";
import { supabase } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/properties/$id")({
  head: () => ({
    meta: [
      { title: "Hébergement — StayBF" },
      { name: "description", content: "Hébergements vérifiés au Burkina Faso." },
    ],
  }),
  component: PropertyRoute,
  notFoundComponent: NotFound,
  errorComponent: NotFound,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLACEHOLDER_IMG = "https://placehold.co/800x500?text=StayBF";
const IMAGE_BUCKET = "property-images";

function toPublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl ?? PLACEHOLDER_IMG;
}

// ---------------------------------------------------------------------------
// Data fetching hook
// ---------------------------------------------------------------------------

function usePropertyData(id: string) {
  const [data, setData] = useState<SupabasePropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
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

      // --- Normalize images ---
      const images: PropertyImage[] = ((raw.property_images ?? []) as PropertyImage[])
        .sort((a, b) => a.position - b.position);

      // --- Normalize rooms ---
      const rooms: PropertyRoom[] = (raw.rooms ?? []) as PropertyRoom[];

      // --- Normalize amenities (through junction table) ---
      const amenities: PropertyAmenity[] = ((raw.amenities_map ?? []) as { amenities: PropertyAmenity | null }[])
        .map((m) => m.amenities)
        .filter((a): a is PropertyAmenity => a !== null);

      // --- Normalize host ---
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

      // --- Fetch reviews via bookings join (reviews have no direct property_id) ---
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

      const reviews: PropertyReview[] = ((reviewRows ?? []) as {
        id: string;
        overall_rating: number;
        body: string;
        created_at: string;
        reviewer: { id: string; full_name: string | null; avatar_url: string | null } | null;
      }[]);

      // --- Fetch similar properties ---
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: simRows } = await (supabase as any)
        .from("properties")
        .select(`
          id,
          name,
          min_price_fcfa,
          rating_avg,
          cities!city_id(name),
          property_images(storage_path, is_cover, position)
        `)
        .eq("status", "published")
        .is("deleted_at", null)
        .neq("id", id)
        .limit(4);

      const similar: SimilarProperty[] = ((simRows ?? []) as {
        id: string;
        name: string;
        min_price_fcfa: number | null;
        rating_avg: number | null;
        cities: { name: string } | null;
        property_images: { storage_path: string; is_cover: boolean; position: number }[];
      }[]).map((s) => {
        const coverImg = (s.property_images ?? [])
          .sort((a, b) => a.position - b.position)
          .find((img) => img.is_cover) ?? s.property_images?.[0] ?? null;
        return {
          id: s.id,
          name: s.name,
          city_name: s.cities?.name ?? "",
          min_price_fcfa: s.min_price_fcfa,
          rating_avg: s.rating_avg,
          image_url: coverImg ? toPublicUrl(coverImg.storage_path) : PLACEHOLDER_IMG,
        };
      });

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
// Page component
// ---------------------------------------------------------------------------

function PropertyRoute() {
  const { id } = useParams({ from: "/properties/$id" });
  const { data, loading, notFound } = usePropertyData(id);
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({});

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <PropertyDetailsSkeleton />
        <Footer />
      </div>
    );
  }

  if (notFound || !data) {
    return <NotFound />;
  }

  const galleryImages = data.images.length > 0
    ? data.images.map((img) => toPublicUrl(img.storage_path))
    : [PLACEHOLDER_IMG];

  return (
    <PropertyProvider value={data}>
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />

        <main className="flex-1">
          <PropertyGallery images={galleryImages} name={data.name} />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="lg:grid lg:grid-cols-3 lg:gap-12">
              {/* Left column */}
              <div className="lg:col-span-2 space-y-8">
                <PropertyHeader />
                <Separator />
                <HostCard />
                <Separator />
                <Description />
                <Separator />
                <Amenities />
                <Separator />
                <RoomInfo />
                <Separator />
                <AvailabilityCalendar range={range} setRange={setRange} />
                <Separator />
                <Reviews />
                <Separator />
                <LocationMap />
                <Separator />
                <SimilarProperties />
              </div>

              {/* Right column (sticky booking card) */}
              <div className="hidden lg:block">
                <div className="sticky top-24">
                  <BookingCard range={range} setRange={setRange} />
                </div>
              </div>
            </div>
          </div>
        </main>

        <Footer />
        <MobileBookingBar />
      </div>
    </PropertyProvider>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function PropertyDetailsSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <Skeleton className="h-72 w-full rounded-2xl" />
      <div className="lg:grid lg:grid-cols-3 lg:gap-12">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="hidden lg:block">
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not found
// ---------------------------------------------------------------------------

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 text-center px-4">
        <div className="h-16 w-16 rounded-2xl bg-muted grid place-items-center">
          <SearchX className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-display font-bold">Hébergement introuvable</h1>
        <p className="text-muted-foreground max-w-sm">
          Cet hébergement n'existe pas ou n'est plus disponible.
        </p>
        <Button asChild className="gradient-primary text-primary-foreground rounded-xl mt-2">
          <a href="/search">Explorer les hébergements</a>
        </Button>
      </div>
      <Footer />
    </div>
  );
}
