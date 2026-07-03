import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Eye } from "lucide-react";
import { useAdminProperties } from "@/lib/admin";
import { StatusBadge } from "@/components/dashboard/widgets";

export const Route = createFileRoute("/admin/properties")({ component: AdminPropertiesPage });

// Properties mutations (approve/reject/suspend) require a service_role Edge Function
// because properties table only has SELECT GRANT for admin role.
// Buttons are shown but disabled to communicate intent.

function AdminPropertiesPage() {
  const { properties, loading, error } = useAdminProperties();
  const [q, setQ] = useState("");

  const filt = (s: string) =>
    properties.filter((p) => (s === "all" || p.status === s) && p.name.toLowerCase().includes(q.toLowerCase()));

  const tabs = [
    { value: "pending_review", label: "En attente" },
    { value: "published", label: "Approuvées" },
    { value: "rejected", label: "Refusées" },
    { value: "suspended", label: "Suspendues" },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="p-4"><Skeleton className="h-36 w-full" /></Card>)}
        </div>
      </div>
    );
  }

  if (error) {
    return <Card className="p-10 text-center text-muted-foreground text-sm">Erreur : {error}</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher..." className="pl-9" />
      </div>

      <Tabs defaultValue="pending_review">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label} ({filt(t.value).length})
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map(({ value }) => (
          <TabsContent key={value} value={value} className="mt-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filt(value).map((p) => (
                <Card key={p.id} className="p-4 hover:shadow-card transition">
                  <div className="aspect-video rounded-xl bg-gradient-to-br from-primary/15 to-secondary/15 mb-3 grid place-items-center text-xs text-muted-foreground font-semibold">
                    {p.propertyType ?? "Propriété"}
                  </div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-display font-semibold truncate">{p.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.hostName ?? "—"} · {p.cityName ?? "—"}
                      </p>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{p.roomsCount} chambre(s)</p>
                  <div className="flex items-center gap-2">
                    {value === "pending_review" ? (
                      <>
                        {/* Mutations disabled: properties.status UPDATE requires service_role Edge Function */}
                        <Button size="sm" className="flex-1" disabled title="Nécessite une Edge Function service_role">
                          Approuver
                        </Button>
                        <Button size="sm" variant="outline" disabled title="Nécessite une Edge Function service_role">
                          Refuser
                        </Button>
                      </>
                    ) : value === "published" ? (
                      <>
                        <Button size="sm" variant="outline" className="flex-1">
                          <Eye className="h-4 w-4 mr-1" /> Voir
                        </Button>
                        <Button size="sm" variant="outline" disabled title="Nécessite une Edge Function service_role">
                          Suspendre
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="flex-1" disabled title="Nécessite une Edge Function service_role">
                        Réactiver
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
              {filt(value).length === 0 && (
                <Card className="p-10 text-center text-sm text-muted-foreground col-span-full">
                  Aucune propriété.
                </Card>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
