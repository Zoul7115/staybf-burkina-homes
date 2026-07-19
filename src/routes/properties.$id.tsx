import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
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
import { usePropertyDetail } from "@/lib/property/usePropertyDetail";
import { toPublicUrl, PLACEHOLDER_IMG } from "@/lib/shared";

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

function PropertyRoute() {
  const { id } = useParams({ from: "/properties/$id" });
  const { data, loading, notFound } = usePropertyDetail(id);
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
