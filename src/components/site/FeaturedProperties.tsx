import { properties } from "@/lib/staybf-data";
import { PropertyCard } from "./PropertyCard";
import { Button } from "@/components/ui/button";

export function FeaturedProperties() {
  return (
    <section className="py-16 sm:py-24 bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 sm:mb-12 text-center max-w-2xl mx-auto">
          <p className="text-primary font-semibold text-sm uppercase tracking-wider mb-2">Sélection</p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl md:text-5xl text-balance">
            Hébergements en vedette
          </h2>
          <p className="mt-3 text-muted-foreground">
            Les meilleures adresses du moment, soigneusement vérifiées par notre équipe.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-7">
          {properties.map((p, i) => (
            <PropertyCard key={p.id} property={p} index={i} />
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button
            size="lg"
            variant="outline"
            className="rounded-full border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground font-semibold px-8"
          >
            Voir tous les hébergements
          </Button>
        </div>
      </div>
    </section>
  );
}
