import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MapPin, TrendingUp } from "lucide-react";
import { adminCities, fmtFCFA } from "@/lib/staybf-admin-data";

export const Route = createFileRoute("/admin/cities")({ component: AdminCitiesPage });

function AdminCitiesPage() {
  const [items, setItems] = useState(adminCities);
  const toggle = (name: string) => setItems((arr) => arr.map((c) => c.name === name ? { ...c, active: !c.active } : c));

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((c) => (
        <Card key={c.name} className="p-5 hover:shadow-card transition">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center"><MapPin className="h-5 w-5" /></span>
              <div>
                <h3 className="font-display font-semibold">{c.name}</h3>
                <p className="text-xs text-muted-foreground">{c.properties} propriétés</p>
              </div>
            </div>
            <Switch checked={c.active} onCheckedChange={() => toggle(c.name)} />
          </div>
          <div className="space-y-2 text-sm">
            <Row label="Réservations" value={c.bookings.toLocaleString("fr-FR")} />
            <Row label="Revenus" value={fmtFCFA(c.revenue)} />
            <Row label="Statut" value={c.active ? "Active" : "Désactivée"} className={c.active ? "text-primary" : "text-muted-foreground"} />
          </div>
          <Button variant="outline" size="sm" className="w-full mt-4"><TrendingUp className="h-4 w-4 mr-1.5" /> Analytics</Button>
        </Card>
      ))}
    </div>
  );
}

function Row({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground text-xs">{label}</span><span className={`font-semibold text-sm ${className}`}>{value}</span></div>;
}
