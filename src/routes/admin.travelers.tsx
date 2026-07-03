import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Pause, Play } from "lucide-react";
import { useAdminTravelers } from "@/lib/admin";
import { StatusBadge } from "@/components/dashboard/widgets";
import { getInitials } from "@/lib/shared";

export const Route = createFileRoute("/admin/travelers")({ component: AdminTravelersPage });

function fmtFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

function AdminTravelersPage() {
  const { travelers, loading, error, toggleStatus } = useAdminTravelers();
  const [q, setQ] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const list = travelers.filter((t) =>
    t.name?.toLowerCase().includes(q.toLowerCase()) ||
    t.email?.toLowerCase().includes(q.toLowerCase())
  );

  async function handleToggle(id: string, current: string) {
    setActionError(null);
    try {
      await toggleStatus(id, current);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erreur (droits insuffisants)");
    }
  }

  if (loading) {
    return (
      <Card className="p-5 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </Card>
    );
  }

  if (error) {
    return <Card className="p-10 text-center text-muted-foreground text-sm">Erreur : {error}</Card>;
  }

  return (
    <Card className="overflow-hidden">
      {actionError && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-xs border-b border-destructive/20">
          {actionError}
        </div>
      )}
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
            {list.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                  Aucun voyageur.
                </TableCell>
              </TableRow>
            )}
            {list.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-secondary/30 text-secondary-foreground grid place-items-center text-xs font-bold shrink-0">
                      {getInitials(t.name)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{t.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{t.email ?? "—"}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{t.bookingsCount}</TableCell>
                <TableCell className="text-sm font-medium">{fmtFCFA(t.totalSpentFcfa)}</TableCell>
                <TableCell className="text-sm">{t.reviewsCount}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtDate(t.createdAt)}</TableCell>
                <TableCell><StatusBadge status={t.accountStatus} /></TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleToggle(t.id, t.accountStatus)}
                    title={t.accountStatus === "active" ? "Suspendre" : "Activer"}
                  >
                    {t.accountStatus === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
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
