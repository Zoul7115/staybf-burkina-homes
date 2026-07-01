import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Map as MapIcon, X } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { SearchTopBar } from "@/components/search/SearchTopBar";
import { SearchFilters, defaultFilters, type Filters } from "@/components/search/SearchFilters";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import { SearchMap } from "@/components/search/SearchMap";
import { ResultsSkeleton } from "@/components/search/ResultsSkeleton";
import { EmptyResults } from "@/components/search/EmptyResults";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useSearch } from "@/lib/search/useSearch";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Rechercher un hébergement — StayBF" },
      {
        name: "description",
        content:
          "Trouvez et comparez hôtels, résidences et villas vérifiés au Burkina Faso. Filtrez par budget, équipements et disponibilité.",
      },
      { property: "og:title", content: "Rechercher un hébergement — StayBF" },
      {
        property: "og:description",
        content: "Comparez les meilleurs hébergements au Burkina Faso, du business au lodge.",
      },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const [city, setCity] = useState("Ouagadougou");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const { results: allListings, loading } = useSearch();

  const results = useMemo(() => {
    let r = allListings.filter((l) => {
      if (city && l.city !== city) return false;
      if (l.price < filters.priceRange[0] || l.price > filters.priceRange[1]) return false;
      if (filters.types.length && !filters.types.includes(l.type as never)) return false;
      if (filters.amenities.length && !filters.amenities.every((a) => l.amenities.includes(a))) return false;
      if (filters.minRating && l.rating < filters.minRating) return false;
      return true;
    });
    if (filters.sort === "cheapest") r = [...r].sort((a, b) => a.price - b.price);
    if (filters.sort === "expensive") r = [...r].sort((a, b) => b.price - a.price);
    if (filters.sort === "rated") r = [...r].sort((a, b) => b.rating - a.rating);
    return r;
  }, [allListings, city, filters]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar solid />
      <SearchTopBar
        resultCount={results.length}
        city={city}
        onCityChange={setCity}
        onOpenFilters={() => setFiltersOpen(true)}
      />

      <div className="container mx-auto px-4 py-6 flex-1 w-full">
        <div className="grid lg:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_400px] gap-6">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-[200px] max-h-[calc(100vh-220px)] overflow-y-auto pr-2">
              <SearchFilters value={filters} onChange={setFilters} />
            </div>
          </aside>

          {/* Results */}
          <section className="min-w-0">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div key="skel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ResultsSkeleton count={4} />
                </motion.div>
              ) : results.length === 0 ? (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <EmptyResults onReset={() => setFilters(defaultFilters)} />
                </motion.div>
              ) : (
                <motion.div key="results" className="space-y-4">
                  {results.map((l, i) => (
                    <SearchResultCard
                      key={l.id}
                      listing={l}
                      index={i}
                      active={activeId === l.id}
                      onHover={setActiveId}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Desktop map */}
          <aside className="hidden xl:block">
            <div className="sticky top-[200px] h-[calc(100vh-220px)]">
              <SearchMap listings={results} activeId={activeId} city={city} />
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile map FAB */}
      <Button
        onClick={() => setMapOpen(true)}
        className="xl:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40 gradient-primary text-primary-foreground rounded-full px-6 h-12 shadow-elevated gap-2 font-semibold"
      >
        <MapIcon className="h-4 w-4" />
        Carte
      </Button>

      {/* Mobile filters drawer */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className="w-[88vw] sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display">Filtres</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <SearchFilters value={filters} onChange={setFilters} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Mobile fullscreen map */}
      <AnimatePresence>
        {mapOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background p-4"
          >
            <Button
              size="icon"
              variant="outline"
              onClick={() => setMapOpen(false)}
              className="absolute top-4 right-4 z-50 rounded-full shadow-card"
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="h-full">
              <SearchMap listings={results} activeId={activeId} city={city} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
