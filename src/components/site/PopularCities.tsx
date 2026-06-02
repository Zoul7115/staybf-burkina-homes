import { cities } from "@/lib/staybf-data";
import { ArrowRight } from "lucide-react";

export function PopularCities() {
  return (
    <section className="py-16 sm:py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4 mb-8 sm:mb-12">
          <div>
            <p className="text-primary font-semibold text-sm uppercase tracking-wider mb-2">Destinations</p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl md:text-5xl text-balance">
              Villes populaires
            </h2>
            <p className="mt-3 text-muted-foreground max-w-xl">
              Explorez les meilleurs hébergements dans les villes les plus visitées du Burkina Faso.
            </p>
          </div>
          <button className="hidden sm:inline-flex items-center gap-1.5 text-primary font-semibold hover:gap-2.5 transition-all">
            Voir toutes <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-5">
          {cities.map((city, i) => (
            <a
              key={city.name}
              href="#"
              className="group relative aspect-[3/4] overflow-hidden rounded-3xl shadow-card hover-lift animate-fade-in-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <img
                src={city.image}
                alt={city.name}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <h3 className="text-white font-display font-bold text-lg sm:text-xl leading-tight">
                  {city.name}
                </h3>
                <p className="text-white/80 text-xs sm:text-sm mt-0.5">{city.count} hébergements</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
