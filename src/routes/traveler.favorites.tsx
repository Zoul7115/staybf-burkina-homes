import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MapPin, Star } from "lucide-react";
import { TravelerShell } from "@/components/traveler/TravelerShell";
import { Button } from "@/components/ui/button";
import { favorites as initialFavorites } from "@/lib/staybf-traveler-data";
import { getPropertyById } from "@/lib/staybf-property-data";

export const Route = createFileRoute("/traveler/favorites")({
  head: () => ({ meta: [{ title: "Mes favoris — StayBF" }] }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const [ids, setIds] = useState<string[]>(initialFavorites);
  const items = ids.map((id) => getPropertyById(id)).filter(Boolean) as NonNullable<ReturnType<typeof getPropertyById>>[];

  return (
    <TravelerShell title="Mes favoris">
      {items.length === 0 ? (
        <div className="text-center py-20">
          <Heart className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <p className="mt-4 font-semibold">Aucun favori pour le moment</p>
          <Button asChild className="mt-4 gradient-primary text-primary-foreground rounded-xl"><Link to="/search">Découvrir</Link></Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {items.map((p, i) => (
              <motion.article
                key={p.id}
                layout
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-2xl bg-card border border-border overflow-hidden shadow-card hover-lift"
              >
                <div className="relative">
                  <Link to="/properties/$id" params={{ id: p.id }}>
                    <img src={p.images[0]} alt={p.name} className="h-48 w-full object-cover" />
                  </Link>
                  <button
                    onClick={() => setIds((x) => x.filter((id) => id !== p.id))}
                    aria-label="Retirer des favoris"
                    className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/95 grid place-items-center shadow-card hover:scale-110 transition"
                  >
                    <Heart className="h-4 w-4 fill-destructive text-destructive" />
                  </button>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold truncate flex-1">{p.name}</h3>
                    <span className="flex items-center gap-1 text-sm">
                      <Star className="h-3.5 w-3.5 fill-secondary text-secondary" /> {p.rating}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3" /> {p.city}, {p.neighborhood}
                  </p>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span><span className="font-bold">{p.price.toLocaleString("fr-FR")}</span> <span className="text-xs text-muted-foreground">FCFA / nuit</span></span>
                    <Button asChild size="sm" variant="outline" className="rounded-lg h-8">
                      <Link to="/properties/$id" params={{ id: p.id }}>Voir</Link>
                    </Button>
                  </div>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}
    </TravelerShell>
  );
}
