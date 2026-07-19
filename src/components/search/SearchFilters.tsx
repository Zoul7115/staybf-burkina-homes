import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { AccommodationType, Amenity } from "@/lib/search/types";
import { Star, RotateCcw } from "lucide-react";

export type Filters = {
  priceRange: [number, number];
  types: AccommodationType[];
  amenities: Amenity[];
  minRating: 0 | 3 | 4 | 5;
  availability: "any" | "today" | "weekend";
  sort: "cheapest" | "expensive" | "rated";
};

export const defaultFilters: Filters = {
  priceRange: [15000, 120000],
  types: [],
  amenities: [],
  minRating: 0,
  availability: "any",
  sort: "rated",
};

const allTypes: AccommodationType[] = ["Hôtel", "Résidence", "Maison d'hôtes", "Villa", "Appartement"];
const allAmenities: Amenity[] = ["Wifi", "Climatisation", "Parking", "Restaurant", "Piscine", "Groupe électrogène", "Eau chaude"];

type Props = {
  value: Filters;
  onChange: (next: Filters) => void;
};

export function SearchFilters({ value, onChange }: Props) {
  const update = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...value, [k]: v });

  const toggle = <T extends string>(arr: T[], item: T): T[] =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  return (
    <div className="space-y-7 pb-4">
      {/* Sort */}
      <Section title="Trier par">
        <RadioGroup
          value={value.sort}
          onValueChange={(v) => update("sort", v as Filters["sort"])}
          className="space-y-2"
        >
          {[
            { v: "rated", label: "Mieux notés" },
            { v: "cheapest", label: "Moins cher" },
            { v: "expensive", label: "Plus cher" },
          ].map((o) => (
            <div key={o.v} className="flex items-center gap-2">
              <RadioGroupItem value={o.v} id={`sort-${o.v}`} />
              <Label htmlFor={`sort-${o.v}`} className="text-sm font-normal cursor-pointer">{o.label}</Label>
            </div>
          ))}
        </RadioGroup>
      </Section>

      {/* Budget */}
      <Section title="Budget par nuit">
        <div className="px-1">
          <Slider
            min={10000}
            max={150000}
            step={5000}
            value={value.priceRange}
            onValueChange={(v) => update("priceRange", [v[0], v[1]] as [number, number])}
            className="my-4"
          />
          <div className="flex justify-between text-xs font-medium text-muted-foreground">
            <span>{value.priceRange[0].toLocaleString("fr-FR")} FCFA</span>
            <span>{value.priceRange[1].toLocaleString("fr-FR")} FCFA</span>
          </div>
        </div>
      </Section>

      {/* Types */}
      <Section title="Type d'hébergement">
        <div className="space-y-2">
          {allTypes.map((t) => (
            <div key={t} className="flex items-center gap-2">
              <Checkbox
                id={`type-${t}`}
                checked={value.types.includes(t)}
                onCheckedChange={() => update("types", toggle(value.types, t))}
              />
              <Label htmlFor={`type-${t}`} className="text-sm font-normal cursor-pointer">{t}</Label>
            </div>
          ))}
        </div>
      </Section>

      {/* Amenities */}
      <Section title="Équipements">
        <div className="space-y-2">
          {allAmenities.map((a) => (
            <div key={a} className="flex items-center gap-2">
              <Checkbox
                id={`am-${a}`}
                checked={value.amenities.includes(a)}
                onCheckedChange={() => update("amenities", toggle(value.amenities, a))}
              />
              <Label htmlFor={`am-${a}`} className="text-sm font-normal cursor-pointer">{a}</Label>
            </div>
          ))}
        </div>
      </Section>

      {/* Rating */}
      <Section title="Note minimum">
        <RadioGroup
          value={String(value.minRating)}
          onValueChange={(v) => update("minRating", Number(v) as Filters["minRating"])}
          className="space-y-2"
        >
          {[
            { v: 5, label: "5 étoiles" },
            { v: 4, label: "4 étoiles et +" },
            { v: 3, label: "3 étoiles et +" },
            { v: 0, label: "Toutes" },
          ].map((o) => (
            <div key={o.v} className="flex items-center gap-2">
              <RadioGroupItem value={String(o.v)} id={`r-${o.v}`} />
              <Label htmlFor={`r-${o.v}`} className="text-sm font-normal cursor-pointer flex items-center gap-1">
                {o.v > 0 && <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />}
                {o.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </Section>

      {/* Availability */}
      <Section title="Disponibilité">
        <RadioGroup
          value={value.availability}
          onValueChange={(v) => update("availability", v as Filters["availability"])}
          className="space-y-2"
        >
          {[
            { v: "any", label: "Toutes les dates" },
            { v: "today", label: "Disponible aujourd'hui" },
            { v: "weekend", label: "Disponible ce week-end" },
          ].map((o) => (
            <div key={o.v} className="flex items-center gap-2">
              <RadioGroupItem value={o.v} id={`av-${o.v}`} />
              <Label htmlFor={`av-${o.v}`} className="text-sm font-normal cursor-pointer">{o.label}</Label>
            </div>
          ))}
        </RadioGroup>
      </Section>

      <Button variant="outline" className="w-full gap-2" onClick={() => onChange(defaultFilters)}>
        <RotateCcw className="h-4 w-4" />
        Réinitialiser
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display font-semibold text-sm mb-3">{title}</h3>
      {children}
    </div>
  );
}
