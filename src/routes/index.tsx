import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Hero } from "@/components/site/Hero";
import { PopularCities } from "@/components/site/PopularCities";
import { FeaturedProperties } from "@/components/site/FeaturedProperties";
import { WhyYiriGo } from "@/components/site/WhyYiriGo";
import { BecomeHost } from "@/components/site/BecomeHost";
import { Testimonials } from "@/components/site/Testimonials";
import { Footer } from "@/components/site/Footer";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    console.log("[HOME beforeLoad] activé — context.auth =", context.auth ? { userId: context.auth.user?.id, roles: context.auth.roles } : null);
  },
  head: () => ({
    meta: [
      { title: "YiriGo — Hébergements au Burkina Faso" },
      {
        name: "description",
        content:
          "Réservez hôtels, résidences meublées et auberges vérifiés partout au Burkina Faso. Paiement Mobile Money, support local 24/7.",
      },
      { property: "og:title", content: "YiriGo — Hébergements au Burkina Faso" },
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
        <WhyYiriGo />
        <BecomeHost />
        <Testimonials />
      </main>
      <Footer />
    </div>
  );
}
