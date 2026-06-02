import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Check, X, Eye, Pause } from "lucide-react";
import { adminProperties, type AdminProperty } from "@/lib/staybf-admin-data";
import { StatusBadge } from "@/components/dashboard/widgets";

export const Route = createFileRoute("/admin/properties")({ component: AdminPropertiesPage });

function AdminPropertiesPage() {
  const [items, setItems] = useState(adminProperties);
  const [q, setQ] = useState("");
  const set = (id: string, s: AdminProperty["status"]) => setItems((a) => a.map((p) => p.id === id ? { ...p, status: s } : p));
  const filt = (s: AdminProperty["status"] | "all") =>
    items.filter((p) => (s === "all" || p.status === s) && p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher..." className="pl-9" />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">En attente ({filt("pending").length})</TabsTrigger>
          <TabsTrigger value="approved">Approuvées ({filt("approved").length})</TabsTrigger>
          <TabsTrigger value="rejected">Refusées ({filt("rejected").length})</TabsTrigger>
          <TabsTrigger value="suspended">Suspendues ({filt("suspended").length})</TabsTrigger>
        </TabsList>

        {(["pending", "approved", "rejected", "suspended"] as const).map((s) => (
          <TabsContent key={s} value={s} className="mt-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filt(s).map((p) => (
                <Card key={p.id} className="p-4 hover:shadow-card transition">
                  <div className="aspect-video rounded-xl bg-gradient-to-br from-primary/15 to-secondary/15 mb-3 grid place-items-center text-xs text-muted-foreground font-semibold">{p.type}</div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-display font-semibold truncate">{p.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">{p.host} · {p.city}</p>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                    <span>{p.rooms} chambres</span>
                    <span>{p.rating.toFixed(1)} ★</span>
                    <span>{p.bookings} bookings</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s === "pending" ? (
                      <>
                        <Button size="sm" className="flex-1 gradient-primary text-primary-foreground" onClick={() => set(p.id, "approved")}><Check className="h-4 w-4 mr-1" /> Approuver</Button>
                        <Button size="sm" variant="outline" onClick={() => set(p.id, "rejected")}><X className="h-4 w-4" /></Button>
                      </>
                    ) : s === "approved" ? (
                      <>
                        <Button size="sm" variant="outline" className="flex-1"><Eye className="h-4 w-4 mr-1" /> Voir</Button>
                        <Button size="sm" variant="outline" onClick={() => set(p.id, "suspended")}><Pause className="h-4 w-4" /></Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => set(p.id, "approved")}>Réactiver</Button>
                    )}
                  </div>
                </Card>
              ))}
              {filt(s).length === 0 && <Card className="p-10 text-center text-sm text-muted-foreground col-span-full">Aucune propriété.</Card>}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
