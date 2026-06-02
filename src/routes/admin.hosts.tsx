import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MoreHorizontal, CheckCircle2, XCircle, Pause, Play, ShieldCheck } from "lucide-react";
import { adminHosts, fmtFCFA, type AdminHost } from "@/lib/staybf-admin-data";
import { StatusBadge } from "@/components/dashboard/widgets";

export const Route = createFileRoute("/admin/hosts")({ component: AdminHostsPage });

function AdminHostsPage() {
  const [hosts, setHosts] = useState<AdminHost[]>(adminHosts);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const list = hosts.filter((h) =>
    (status === "all" || h.status === status) &&
    h.name.toLowerCase().includes(q.toLowerCase()));

  const update = (id: string, next: AdminHost["status"]) =>
    setHosts((arr) => arr.map((h) => h.id === id ? { ...h, status: next } : h));

  return (
    <Card className="overflow-hidden">
      <div className="p-4 flex items-center gap-2 flex-wrap border-b border-border">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un hôte..." className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="active">Actif</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="approved">Approuvé</SelectItem>
            <SelectItem value="suspended">Suspendu</SelectItem>
            <SelectItem value="rejected">Refusé</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline">Exporter</Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hôte</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Propriétés</TableHead>
              <TableHead>Revenu</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((h) => (
              <TableRow key={h.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full gradient-primary text-primary-foreground grid place-items-center text-xs font-bold">{h.avatar}</div>
                    <div>
                      <p className="font-semibold text-sm flex items-center gap-1">{h.name} {h.verified && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}</p>
                      <p className="text-xs text-muted-foreground">{h.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{h.city}</TableCell>
                <TableCell className="text-sm">{h.properties}</TableCell>
                <TableCell className="text-sm font-medium">{fmtFCFA(h.revenue)}</TableCell>
                <TableCell className="text-sm">{h.rating.toFixed(1)} ★</TableCell>
                <TableCell><StatusBadge status={h.status} /></TableCell>
                <TableCell className="text-right">
                  <Dialog>
                    <DialogTrigger asChild><Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>{h.name}</DialogTitle></DialogHeader>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-xs text-muted-foreground">Ville</p><p className="font-medium">{h.city}</p></div>
                        <div><p className="text-xs text-muted-foreground">Adhésion</p><p className="font-medium">{h.joined}</p></div>
                        <div><p className="text-xs text-muted-foreground">Propriétés</p><p className="font-medium">{h.properties}</p></div>
                        <div><p className="text-xs text-muted-foreground">Revenu</p><p className="font-medium">{fmtFCFA(h.revenue)}</p></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => update(h.id, "approved")}><CheckCircle2 className="h-4 w-4 mr-1" /> Approuver</Button>
                        <Button size="sm" variant="outline" onClick={() => update(h.id, "rejected")}><XCircle className="h-4 w-4 mr-1" /> Refuser</Button>
                        {h.status === "active" ? (
                          <Button size="sm" variant="outline" onClick={() => update(h.id, "suspended")}><Pause className="h-4 w-4 mr-1" /> Suspendre</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => update(h.id, "active")}><Play className="h-4 w-4 mr-1" /> Activer</Button>
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
