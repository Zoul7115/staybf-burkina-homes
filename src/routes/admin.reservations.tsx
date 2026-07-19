import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RotateCcw, Eye, Loader2 } from "lucide-react";
import { useAdminReservations } from "@/lib/admin";
import { StatusBadge } from "@/components/dashboard/widgets";
import type { AdminBookingRow } from "@/lib/admin";

export const Route = createFileRoute("/admin/reservations")({ component: AdminReservationsPage });

function fmtFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

// ── Refund dialog ─────────────────────────────────────────────

function RefundDialog({
  booking,
  onRefund,
  actioning,
}: {
  booking: AdminBookingRow;
  onRefund: (paymentId: string, reason: string) => Promise<void>;
  actioning: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!booking.capturedPaymentId) return null;

  async function handleRefund() {
    try {
      await onRefund(booking.capturedPaymentId!, reason);
      toast.success("Remboursement initié");
      setOpen(false);
      setReason("");
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setReason(""); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex-1">
          <RotateCcw className="h-4 w-4 mr-1.5" /> Rembourser
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rembourser {booking.reference}</DialogTitle>
          <DialogDescription>
            Le paiement passera en statut «&nbsp;remboursement en attente&nbsp;». Indiquez le motif.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label>Motif <span className="text-muted-foreground text-xs">(10 caractères min)</span></Label>
          <Textarea rows={3} className="mt-1.5" placeholder="Motif du remboursement..." value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="destructive" disabled={actioning || reason.trim().length < 10} onClick={handleRefund}>
            {actioning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Confirmer le remboursement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ────────────────────────────────────────────────

function AdminReservationsPage() {
  const { bookings, loading, error, refundPayment, actioning } = useAdminReservations();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const list = bookings.filter((b) =>
    (statusFilter === "all" || b.status === statusFilter) &&
    (b.reference.toLowerCase().includes(q.toLowerCase()) || (b.travelerName ?? "").toLowerCase().includes(q.toLowerCase()))
  );

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
      <div className="p-4 flex items-center gap-2 flex-wrap border-b border-border">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Référence ou voyageur..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="confirmed">Confirmées</SelectItem>
            <SelectItem value="completed">Terminées</SelectItem>
            <SelectItem value="cancelled">Annulées</SelectItem>
          </SelectContent>
        </Select>
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
            {list.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">
                  Aucune réservation.
                </TableCell>
              </TableRow>
            )}
            {list.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono text-xs">{b.reference}</TableCell>
                <TableCell className="text-sm font-medium">{b.travelerName ?? "—"}</TableCell>
                <TableCell className="text-sm">{b.propertyName ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{b.hostName ?? "—"}</TableCell>
                <TableCell className="text-xs">{fmtDate(b.checkIn)} · {b.nights}n</TableCell>
                <TableCell className="text-sm font-semibold">{fmtFCFA(b.totalAmount)}</TableCell>
                <TableCell><StatusBadge status={b.status} /></TableCell>
                <TableCell>{b.paymentStatus ? <StatusBadge status={b.paymentStatus} /> : "—"}</TableCell>
                <TableCell>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="icon" variant="ghost"><Eye className="h-4 w-4" /></Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>{b.reference} · {b.travelerName ?? "—"}</DialogTitle></DialogHeader>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-xs text-muted-foreground">Propriété</p><p className="font-medium">{b.propertyName ?? "—"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Hôte</p><p className="font-medium">{b.hostName ?? "—"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Chambre</p><p className="font-medium">{b.roomName ?? "—"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Check-in</p><p className="font-medium">{fmtDate(b.checkIn)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Nuits</p><p className="font-medium">{b.nights}</p></div>
                        <div className="col-span-2"><p className="text-xs text-muted-foreground">Total</p><p className="font-display font-bold text-lg">{fmtFCFA(b.totalAmount)}</p></div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <RefundDialog booking={b} onRefund={refundPayment} actioning={actioning} />
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
