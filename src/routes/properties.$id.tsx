import { createFileRoute, Link, useParams } from "@tanstack/react-router";
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
import { getPropertyById, PropertyProvider, type PropertyDetail } from "@/lib/staybf-property-data";

export const Route = createFileRoute("/properties/$id")({
  head: ({ params }) => {
    const p = getPropertyById(params.id);
    const title = p ? `${p.name} — StayBF` : "Hébergement — StayBF";
    const description = p
      ? `Réservez ${p.name} à ${p.city}, ${p.neighborhood}. Note ${p.rating}/5 sur ${p.reviews} avis. Paiement Orange Money & Moov Money.`
      : "Hébergements vérifiés au Burkina Faso.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(p ? [{ property: "og:image", content: p.images[0] }] : []),
      ],
    };
  },
  component: PropertyRoute,
  notFoundComponent: NotFound,
  errorComponent: NotFound,
});

function PropertyRoute() {
  const { id } = useParams({ from: "/properties/$id" });
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PropertyDetail | undefined>(undefined);

  useEffect(() => {
    setLoading(true);
    setData(undefined);
    const t = setTimeout(() => {
      setData(getPropertyById(id));
      setLoading(false);
    }, 450);
    return () => clearTimeout(t);
  }, [id]);

  if (loading) return <PropertyDetailsSkeleton />;
  if (!data) return <NotFound />;

  return (
    <PropertyProvider value={data}>
      <PropertyPage />
    </PropertyProvider>
  );
}

function PropertyPage() {
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({});

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar solid />
      <main className="container mx-auto px-4 pt-24 pb-24 lg:pb-12 max-w-7xl">
        <PropertyGalleryWrapper />
        <div className="mt-6 md:mt-10">
          <PropertyHeader />
        </div>
        <div className="mt-8 grid lg:grid-cols-[1fr_380px] gap-10">
          <div className="space-y-10 min-w-0">
            <HostCard />
            <Separator />
            <Description />
            <Separator />
            <Amenities />
            <Separator />
            <RoomInfo />
            <Separator />
            <AvailabilityCalendar range={range} setRange={setRange} />
          </div>
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <BookingCard range={range} setRange={setRange} />
            </div>
          </aside>
        </div>
        <Separator className="my-12" />
        <Reviews />
        <Separator className="my-12" />
        <LocationMap />
        <Separator className="my-12" />
        <SimilarProperties />
      </main>
      <MobileBookingBar />
      <Footer />
    </div>
  );
}

function PropertyGalleryWrapper() {
  // Read property from context via a small bridge
  const { useProperty } = require("@/lib/staybf-property-data") as typeof import("@/lib/staybf-property-data");
  const p = useProperty();
  return <PropertyGallery images={p.images} name={p.name} />;
}

function PropertyDetailsSkeleton() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar solid />
      <main className="container mx-auto px-4 pt-24 pb-24 max-w-7xl">
        <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[260px] md:h-[460px] rounded-3xl overflow-hidden">
          <Skeleton className="col-span-4 row-span-2 md:col-span-2" />
          <Skeleton className="hidden md:block" />
          <Skeleton className="hidden md:block" />
          <Skeleton className="hidden md:block" />
          <Skeleton className="hidden md:block" />
        </div>
        <div className="mt-8 space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
        </div>
        <div className="mt-8 grid lg:grid-cols-[1fr_380px] gap-10">
          <div className="space-y-5">
            <Skeleton className="h-32 w-full rounded-3xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-60 w-full rounded-2xl" />
          </div>
          <Skeleton className="hidden lg:block h-[420px] rounded-3xl" />
        </div>
      </main>
      <Footer />
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar solid />
      <main className="flex-1 grid place-items-center px-4 pt-24 pb-16">
        <div className="text-center max-w-md">
          <div className="mx-auto h-20 w-20 rounded-full bg-muted grid place-items-center mb-6">
            <SearchX className="h-10 w-10 text-muted-foreground" />
          </div>
          <h1 className="font-display font-bold text-2xl md:text-3xl">Hébergement introuvable</h1>
          <p className="mt-3 text-muted-foreground">
            Cet hébergement n'existe pas ou n'est plus disponible.
          </p>
          <Button asChild size="lg" className="mt-6 gradient-primary text-primary-foreground rounded-xl font-semibold">
            <Link to="/search">Retour à la recherche</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
