import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MapPin, Star } from "lucide-react";
import { TravelerShell } from "@/components/traveler/TravelerShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFavorites } from "@/lib/favorites/useFavorites";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/traveler/favorites")({
  head: () => ({ meta: [{ title: "Mes favoris — StayBF" }] }),
  component: FavoritesPage,
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function FavoritesPage() {
  const { items, loading, remove } = useFavorites();

  return (
    <TravelerShell title="Mes favoris">
      {loading ? (
        <FavoritesSkeleton />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {items.map((p, i) => (
              <motion.article
                key={p.favoriteId}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-2xl bg-card border border-border overflow-hidden shadow-card hover-lift"
              >
                <div className="relative">
                  <Link to="/properties/$id" params={{ id: p.id }}>
                    <img src={p.cover_image_url} alt={p.name} className="h-48 w-full object-cover" />
                  </Link>
                  <button
                    onClick={() => remove(p.favoriteId)}
                    aria-label="Retirer des favoris"
                    className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/95 grid place-items-center shadow-card hover:scale-110 transition"
                  >
                    <Heart className="h-4 w-4 fill-destructive text-destructive" />
                  </button>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold truncate flex-1">{p.name}</h3>
                    {p.rating_avg !== null && (
                      <span className="flex items-center gap-1 text-sm shrink-0">
                        <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
                        {p.rating_avg.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3" />
                    {[p.city_name, p.address].filter(Boolean).join(", ") || "Burkina Faso"}
                  </p>
                  <div className="mt-3 flex items-baseline justify-between">
                    {p.min_price_fcfa !== null ? (
                      <span>
                        <span className="font-bold">{p.min_price_fcfa.toLocaleString("fr-FR")}</span>{" "}
                        <span className="text-xs text-muted-foreground">FCFA / nuit</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Prix sur demande</span>
                    )}
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FavoritesSkeleton() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="rounded-2xl bg-card border border-border overflow-hidden shadow-card">
          <Skeleton className="h-48 w-full" />
          <div className="p-4 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="h-3 w-1/2" />
            <div className="flex justify-between pt-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-16 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20">
      <Heart className="h-12 w-12 text-muted-foreground/40 mx-auto" />
      <p className="mt-4 font-semibold">Aucun favori pour le moment</p>
      <p className="text-sm text-muted-foreground mt-1">
        Explorez nos hébergements et sauvegardez vos préférés.
      </p>
      <Button asChild className="mt-4 gradient-primary text-primary-foreground rounded-xl">
        <Link to="/search">Découvrir</Link>
      </Button>
    </div>
  );
}
