import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Hero } from "@/components/site/Hero";
import { PopularCities } from "@/components/site/PopularCities";
import { FeaturedProperties } from "@/components/site/FeaturedProperties";
import { WhyStayBF } from "@/components/site/WhyStayBF";
import { BecomeHost } from "@/components/site/BecomeHost";
import { Testimonials } from "@/components/site/Testimonials";
import { Footer } from "@/components/site/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StayBF — Hébergements au Burkina Faso" },
      {
        name: "description",
        content:
          "Réservez hôtels, résidences meublées et auberges vérifiés partout au Burkina Faso. Paiement Mobile Money, support local 24/7.",
      },
      { property: "og:title", content: "StayBF — Hébergements au Burkina Faso" },
      {
        property: "og:description",
        content:
          "La 1ère plateforme dédiée à l'hébergement au Burkina Faso. Réservez en quelques minutes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <PopularCities />
        <FeaturedProperties />
        <WhyStayBF />
        <BecomeHost />
        <Testimonials />
      </main>
      <Footer />
    </div>
  );
}
