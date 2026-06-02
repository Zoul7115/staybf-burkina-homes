import { useState } from "react";
import { Heart, Star, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

type Property = {
  id: number;
  name: string;
  location: string;
  price: number;
  rating: number;
  reviews: number;
  image: string;
  badge?: string;
};

export function PropertyCard({ property, index = 0 }: { property: Property; index?: number }) {
  const [fav, setFav] = useState(false);

  return (
    <article
      className="group rounded-3xl overflow-hidden bg-card hover-lift shadow-card animate-fade-in-up"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={property.image}
          alt={property.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        {property.badge && (
          <span className="absolute top-3 left-3 bg-white/95 backdrop-blur text-foreground text-xs font-bold px-3 py-1.5 rounded-full shadow-card">
            {property.badge}
          </span>
        )}
        <button
          onClick={() => setFav(!fav)}
          aria-label="Favori"
          className="absolute top-3 right-3 h-10 w-10 rounded-full bg-white/90 backdrop-blur grid place-items-center shadow-card hover:scale-110 transition-transform"
        >
          <Heart
            className={cn("h-5 w-5 transition-colors", fav ? "fill-destructive text-destructive" : "text-foreground")}
            strokeWidth={2}
          />
        </button>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display font-semibold text-base sm:text-lg leading-snug line-clamp-1">
            {property.name}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            <Star className="h-4 w-4 fill-secondary text-secondary" />
            <span className="text-sm font-semibold">{property.rating}</span>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-muted-foreground text-sm">
          <MapPin className="h-3.5 w-3.5" />
          <span className="line-clamp-1">{property.location}</span>
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <div>
            <span className="font-display font-bold text-xl text-foreground">
              {property.price.toLocaleString("fr-FR")}
            </span>
            <span className="text-muted-foreground text-sm"> FCFA / nuit</span>
          </div>
          <span className="text-xs text-muted-foreground">{property.reviews} avis</span>
        </div>
      </div>
    </article>
  );
}
