import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, TrendingUp } from "lucide-react";
import { useAdminCities } from "@/lib/admin";

export const Route = createFileRoute("/admin/cities")({ component: AdminCitiesPage });

function AdminCitiesPage() {
  const { cities, loading, error, toggleActive } = useAdminCities();
  const [toggleErrors, setToggleErrors] = useState<Record<string, string>>({});

  async function handleToggle(id: string, current: boolean) {
    setToggleErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      await toggleActive(id, current);
    } catch (err) {
      setToggleErrors((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "Erreur" }));
    }
  }

  if (loading) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-5"><Skeleton className="h-32 w-full" /></Card>
        ))}
      </div>
    );
  }

  if (error) {
    return <Card className="p-10 text-center text-muted-foreground text-sm">Erreur : {error}</Card>;
  }

  if (cities.length === 0) {
    return <Card className="p-10 text-center text-muted-foreground text-sm">Aucune ville configurée.</Card>;
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cities.map((c) => (
        <Card key={c.id} className="p-5 hover:shadow-card transition">
          {toggleErrors[c.id] && (
            <p className="text-xs text-destructive mb-2">{toggleErrors[c.id]}</p>
          )}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center">
                <MapPin className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display font-semibold">{c.name}</h3>
                <p className="text-xs text-muted-foreground">{c.propertiesCount} propriétés</p>
              </div>
            </div>
            <Switch checked={c.isActive} onCheckedChange={() => handleToggle(c.id, c.isActive)} />
          </div>
          <div className="space-y-2 text-sm">
            <CityRow label="Statut" value={c.isActive ? "Active" : "Désactivée"} className={c.isActive ? "text-primary" : "text-muted-foreground"} />
          </div>
          <Button variant="outline" size="sm" className="w-full mt-4">
            <TrendingUp className="h-4 w-4 mr-1.5" /> Analytics
          </Button>
        </Card>
      ))}
    </div>
  );
}

function CityRow({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`font-semibold text-sm ${className}`}>{value}</span>
    </div>
  );
}
