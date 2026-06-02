import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RotateCcw, AlertOctagon, Eye } from "lucide-react";
import { adminBookings, fmtFCFA } from "@/lib/staybf-admin-data";
import { StatusBadge } from "@/components/dashboard/widgets";

export const Route = createFileRoute("/admin/reservations")({ component: AdminReservationsPage });

function AdminReservationsPage() {
  const [q, setQ] = useState("");
  const [s, setS] = useState("all");
  const list = adminBookings.filter((b) =>
    (s === "all" || b.status === s) &&
    (b.ref.toLowerCase().includes(q.toLowerCase()) || b.guest.toLowerCase().includes(q.toLowerCase())));

  return (
    <Card className="overflow-hidden">
      <div className="p-4 flex items-center gap-2 flex-wrap border-b border-border">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Référence ou voyageur..." className="pl-9" />
        </div>
        <Select value={s} onValueChange={setS}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="confirmed">Confirmées</SelectItem>
            <SelectItem value="completed">Terminées</SelectItem>
            <SelectItem value="cancelled">Annulées</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline">Exporter</Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead>Voyageur</TableHead>
              <TableHead>Propriété</TableHead>
              <TableHead>Hôte</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Paiement</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono text-xs">{b.ref}</TableCell>
                <TableCell className="text-sm font-medium">{b.guest}</TableCell>
                <TableCell className="text-sm">{b.property}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{b.host}</TableCell>
                <TableCell className="text-xs">{b.date} · {b.nights}n</TableCell>
                <TableCell className="text-sm font-semibold">{fmtFCFA(b.amount)}</TableCell>
                <TableCell><StatusBadge status={b.status} /></TableCell>
                <TableCell><StatusBadge status={b.payment} /></TableCell>
                <TableCell>
                  <Dialog>
                    <DialogTrigger asChild><Button size="icon" variant="ghost"><Eye className="h-4 w-4" /></Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>{b.ref} · {b.guest}</DialogTitle></DialogHeader>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-xs text-muted-foreground">Propriété</p><p className="font-medium">{b.property}</p></div>
                        <div><p className="text-xs text-muted-foreground">Hôte</p><p className="font-medium">{b.host}</p></div>
                        <div><p className="text-xs text-muted-foreground">Date</p><p className="font-medium">{b.date}</p></div>
                        <div><p className="text-xs text-muted-foreground">Nuits</p><p className="font-medium">{b.nights}</p></div>
                        <div className="col-span-2"><p className="text-xs text-muted-foreground">Total</p><p className="font-display font-bold text-lg">{fmtFCFA(b.amount)}</p></div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" className="flex-1"><RotateCcw className="h-4 w-4 mr-1.5" /> Rembourser</Button>
                        <Button variant="outline" className="flex-1"><AlertOctagon className="h-4 w-4 mr-1.5" /> Ouvrir un litige</Button>
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
