import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MapPin, Star } from "lucide-react";
import { TravelerShell } from "@/components/traveler/TravelerShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase/client";
import { toPublicUrl, PLACEHOLDER_IMG } from "@/lib/property/usePropertyDetail";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FavoriteProperty = {
  favoriteId: string;
  id: string;
  name: string;
  address: string | null;
  city_name: string | null;
  min_price_fcfa: number | null;
  rating_avg: number | null;
  rating_count: number;
  cover_image_url: string;
};

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/traveler/favorites")({
  head: () => ({ meta: [{ title: "Mes favoris — StayBF" }] }),
  component: FavoritesPage,
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function useFavorites() {
  const [items, setItems] = useState<FavoriteProperty[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("favorites")
      .select(`
        id,
        properties!property_id(
          id,
          name,
          address,
          min_price_fcfa,
          rating_avg,
          rating_count,
          status,
          deleted_at,
          cities!city_id(name),
          property_images(storage_path, is_cover, position)
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setItems([]);
      setLoading(false);
      return;
    }

    const favorites: FavoriteProperty[] = ((data ?? []) as {
      id: string;
      properties: {
        id: string;
        name: string;
        address: string | null;
        min_price_fcfa: number | null;
        rating_avg: number | null;
        rating_count: number;
        status: string;
        deleted_at: string | null;
        cities: { name: string } | null;
        property_images: { storage_path: string; is_cover: boolean; position: number }[];
      } | null;
    }[])
      .filter((row) => row.properties && row.properties.status === "published" && !row.properties.deleted_at)
      .map((row) => {
        const p = row.properties!;
        const sorted = (p.property_images ?? []).sort((a, b) => a.position - b.position);
        const cover = sorted.find((img) => img.is_cover) ?? sorted[0] ?? null;
        return {
          favoriteId: row.id,
          id: p.id,
          name: p.name,
          address: p.address,
          city_name: p.cities?.name ?? null,
          min_price_fcfa: p.min_price_fcfa,
          rating_avg: p.rating_avg,
          rating_count: p.rating_count ?? 0,
          cover_image_url: cover ? toPublicUrl(cover.storage_path) : PLACEHOLDER_IMG,
        };
      });

    setItems(favorites);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = useCallback(async (favoriteId: string) => {
    // Optimistic update
    setItems((prev) => prev.filter((item) => item.favoriteId !== favoriteId));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("favorites")
      .delete()
      .eq("id", favoriteId)
      .eq("user_id", user.id);
  }, []);

  return { items, loading, remove };
}

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
