import { useState } from "react";
import { motion } from "framer-motion";
import { Heart, Star, MapPin, BadgeCheck } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SearchResult } from "@/lib/search/types";
import { cn } from "@/lib/utils";

type Props = {
  listing: SearchResult;
  index?: number;
  active?: boolean;
  onHover?: (id: string | null) => void;
};

export function SearchResultCard({ listing, index = 0, active, onHover }: Props) {
  const [fav, setFav] = useState(false);
  const navigate = useNavigate();
  const goToDetails = () => navigate({ to: "/properties/$id", params: { id: String(listing.id) } });


  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.3), ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
      onClick={goToDetails}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") goToDetails(); }}
      whileHover={{ y: -4 }}
      className={cn(
        "group rounded-3xl overflow-hidden bg-card border border-border/60 shadow-card transition-shadow cursor-pointer",
        active ? "ring-2 ring-primary shadow-elevated" : "hover:shadow-elevated",
      )}
    >
      <div className="grid sm:grid-cols-[260px_1fr]">
        <div className="relative aspect-[4/3] sm:aspect-auto overflow-hidden">
          <img
            src={listing.image}
            alt={listing.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            {listing.verified && (
              <Badge className="bg-primary text-primary-foreground border-0 gap-1 shadow-card">
                <BadgeCheck className="h-3 w-3" />
                Vérifié
              </Badge>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setFav(!fav); }}
            aria-label="Favori"
            className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/95 backdrop-blur grid place-items-center shadow-card hover:scale-110 transition-transform"
          >
            <Heart
              className={cn("h-4 w-4", fav ? "fill-destructive text-destructive" : "text-foreground")}
            />
          </button>
        </div>

        <div className="p-4 sm:p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{listing.type}</p>
              <h3 className="font-display font-semibold text-lg leading-snug mt-0.5 line-clamp-1">{listing.name}</h3>
              <div className="flex items-center gap-1 text-muted-foreground text-sm mt-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="line-clamp-1">{[listing.city, listing.address].filter(Boolean).join(", ")}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 bg-muted/60 px-2 py-1 rounded-lg">
              <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
              <span className="text-sm font-bold">{listing.rating}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {listing.amenities.slice(0, 4).map((a) => (
              <span key={a} className="text-[11px] font-medium bg-muted text-muted-foreground px-2 py-1 rounded-full">
                {a}
              </span>
            ))}
            {listing.amenities.length > 4 && (
              <span className="text-[11px] font-medium text-muted-foreground px-2 py-1">
                +{listing.amenities.length - 4}
              </span>
            )}
          </div>

          <div className="mt-auto flex items-end justify-between gap-3 pt-2 border-t border-border/60">
            <div>
              <p className="text-xs text-muted-foreground">{listing.reviews} avis</p>
              <p className="mt-0.5">
                <span className="font-display font-bold text-xl text-foreground">
                  {listing.price.toLocaleString("fr-FR")}
                </span>
                <span className="text-xs text-muted-foreground"> FCFA / nuit</span>
              </p>
            </div>
            <Button size="sm" onClick={(e) => { e.stopPropagation(); goToDetails(); }} className="gradient-primary text-primary-foreground rounded-xl font-semibold">
              Voir les détails
            </Button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
