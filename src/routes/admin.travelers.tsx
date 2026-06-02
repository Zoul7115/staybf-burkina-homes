import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Pause, Play, Eye } from "lucide-react";
import { adminTravelers, fmtFCFA } from "@/lib/staybf-admin-data";
import { StatusBadge } from "@/components/dashboard/widgets";

export const Route = createFileRoute("/admin/travelers")({ component: AdminTravelersPage });

function AdminTravelersPage() {
  const [items, setItems] = useState(adminTravelers);
  const [q, setQ] = useState("");
  const list = items.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => setItems((arr) =>
    arr.map((t) => t.id === id ? { ...t, status: t.status === "active" ? "suspended" : "active" } : t));

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un voyageur..." className="pl-9" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Voyageur</TableHead>
              <TableHead>Réservations</TableHead>
              <TableHead>Dépensé</TableHead>
              <TableHead>Avis laissés</TableHead>
              <TableHead>Membre depuis</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-secondary/30 text-secondary-foreground grid place-items-center text-xs font-bold">{t.avatar}</div>
                    <div>
                      <p className="font-semibold text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{t.bookings}</TableCell>
                <TableCell className="text-sm font-medium">{fmtFCFA(t.spent)}</TableCell>
                <TableCell className="text-sm">{t.reviews}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{t.joined}</TableCell>
                <TableCell><StatusBadge status={t.status} /></TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost"><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => toggle(t.id)}>
                    {t.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
