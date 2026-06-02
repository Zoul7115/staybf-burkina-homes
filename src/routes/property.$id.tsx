import { createFileRoute } from "@tanstack/react-router";
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
import { property } from "@/lib/staybf-property-data";

export const Route = createFileRoute("/property/$id")({
  head: () => ({
    meta: [
      { title: `${property.name} — StayBF` },
      {
        name: "description",
        content: `Réservez ${property.name} à ${property.city}, ${property.neighborhood}. Note ${property.rating}/5 sur ${property.reviews} avis. Paiement Orange Money & Moov Money.`,
      },
      { property: "og:title", content: `${property.name} — StayBF` },
      { property: "og:description", content: `${property.city}, ${property.neighborhood} · ${property.rating}★` },
      { property: "og:image", content: property.images[0] },
    ],
  }),
  component: PropertyPage,
});

function PropertyPage() {
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({});

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar solid />

      <main className="container mx-auto px-4 pt-24 pb-24 lg:pb-12 max-w-7xl">
        <PropertyGallery images={property.images} name={property.name} />

        <div className="mt-6 md:mt-10">
          <PropertyHeader />
        </div>

        <div className="mt-8 grid lg:grid-cols-[1fr_380px] gap-10">
          {/* Left content */}
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

          {/* Sticky booking */}
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
