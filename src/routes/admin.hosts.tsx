import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MoreHorizontal, CheckCircle2, XCircle, Pause, Play, ShieldCheck } from "lucide-react";
import { useAdminHosts } from "@/lib/admin";
import { StatusBadge } from "@/components/dashboard/widgets";
import { getInitials } from "@/lib/shared";

export const Route = createFileRoute("/admin/hosts")({ component: AdminHostsPage });

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

function AdminHostsPage() {
  const { hosts, loading, error, updateHostStatus } = useAdminHosts();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionError, setActionError] = useState<string | null>(null);

  const list = hosts.filter((h) =>
    (statusFilter === "all" || h.status === statusFilter) &&
    (h.name?.toLowerCase().includes(q.toLowerCase()) || h.email?.toLowerCase().includes(q.toLowerCase()))
  );

  async function doUpdate(id: string, status: string) {
    setActionError(null);
    try {
      await updateHostStatus(id, status);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erreur (droits super_admin requis)");
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
      <div className="p-4 flex items-center gap-2 flex-wrap border-b border-border">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un hôte..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="pending_review">En attente</SelectItem>
            <SelectItem value="verified">Vérifié</SelectItem>
            <SelectItem value="rejected">Refusé</SelectItem>
            <SelectItem value="suspended">Suspendu</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hôte</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Propriétés</TableHead>
              <TableHead>Membre depuis</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                  Aucun hôte.
                </TableCell>
              </TableRow>
            )}
            {list.map((h) => (
              <TableRow key={h.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full gradient-primary text-primary-foreground grid place-items-center text-xs font-bold shrink-0">
                      {getInitials(h.name)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm flex items-center gap-1">
                        {h.name ?? "—"}
                        {h.verifiedAt && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                      </p>
                      <p className="text-xs text-muted-foreground">{h.email ?? "—"}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{h.city ?? "—"}</TableCell>
                <TableCell className="text-sm">{h.propertiesCount}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtDate(h.hostSince ?? h.createdAt)}</TableCell>
                <TableCell><StatusBadge status={h.status} /></TableCell>
                <TableCell className="text-right">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>{h.name ?? "Hôte"}</DialogTitle></DialogHeader>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium truncate">{h.email ?? "—"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Société</p><p className="font-medium">{h.companyName ?? "—"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Propriétés</p><p className="font-medium">{h.propertiesCount}</p></div>
                        <div><p className="text-xs text-muted-foreground">Membre depuis</p><p className="font-medium">{fmtDate(h.hostSince ?? h.createdAt)}</p></div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Les modifications de statut nécessitent les droits super_admin.</p>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => doUpdate(h.id, "verified")}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Approuver
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => doUpdate(h.id, "rejected")}>
                          <XCircle className="h-4 w-4 mr-1" /> Refuser
                        </Button>
                        {h.status !== "suspended" ? (
                          <Button size="sm" variant="outline" onClick={() => doUpdate(h.id, "suspended")}>
                            <Pause className="h-4 w-4 mr-1" /> Suspendre
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => doUpdate(h.id, "verified")}>
                            <Play className="h-4 w-4 mr-1" /> Activer
                          </Button>
                        )}
                        <Button size="sm" variant="ghost">Voir détails</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
