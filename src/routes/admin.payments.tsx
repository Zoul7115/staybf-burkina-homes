import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { CreditCard, AlertCircle, RotateCcw, ArrowDownToLine, Loader2 } from "lucide-react";
import { StatCard, StatusBadge } from "@/components/dashboard/widgets";
import { useAdminPayments } from "@/lib/admin";

export const Route = createFileRoute("/admin/payments")({ component: PaymentsPage });

function fmtFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function PaymentsPage() {
  const { payments, loading, error, refundPayment, actioning } = useAdminPayments();
  const [refundTarget, setRefundTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-4"><Skeleton className="h-16 w-full" /></Card>)}
        </div>
        <Card className="p-5 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </Card>
      </div>
    );
  }

  if (error) {
    return <Card className="p-10 text-center text-muted-foreground text-sm">Erreur : {error}</Card>;
  }

  const failed = payments.filter((p) => p.status === "failed").length;
  const refunds = payments.filter((p) => p.status === "refunded").length;
  const total = payments.filter((p) => p.status === "captured").reduce((s, p) => s + p.amountFcfa, 0);

  async function handleRefund() {
    if (!refundTarget) return;
    try {
      await refundPayment(refundTarget, reason);
      toast.success("Remboursement initié");
      setRefundTarget(null);
      setReason("");
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-4 gap-3">
        <StatCard label="Volume traité" value={fmtFCFA(total)} icon={CreditCard} />
        <StatCard label="Paiements" value={payments.length} icon={CreditCard} accent="secondary" />
        <StatCard label="Échecs" value={failed} icon={AlertCircle} accent="destructive" />
        <StatCard label="Remboursements" value={refunds} icon={RotateCcw} accent="muted" />
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-semibold">Transactions</h3>
          <Button variant="outline" size="sm" disabled title="Gestion des payouts à venir">
            <ArrowDownToLine className="h-4 w-4 mr-1.5" /> Payouts en attente
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Réservation</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Méthode</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                  Aucun paiement.
                </TableCell>
              </TableRow>
            )}
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.bookingReference ?? "—"}</TableCell>
                <TableCell className="text-sm font-medium">{p.payerName ?? "—"}</TableCell>
                <TableCell className="text-xs">{p.method ?? "—"}</TableCell>
                <TableCell className="text-sm font-semibold">{fmtFCFA(p.amountFcfa)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(p.createdAt)}</TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
                <TableCell className="text-right">
                  {p.status === "captured" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={actioning}
                      onClick={() => setRefundTarget(p.id)}
                    >
                      Rembourser
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={refundTarget !== null} onOpenChange={(v) => { if (!v) { setRefundTarget(null); setReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rembourser le paiement</DialogTitle>
            <DialogDescription>
              Le paiement passera en statut «&nbsp;remboursement en attente&nbsp;». Précisez le motif.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Motif <span className="text-muted-foreground text-xs">(10 caractères min)</span></Label>
            <Textarea rows={3} className="mt-1.5" placeholder="Motif du remboursement..." value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRefundTarget(null); setReason(""); }}>Annuler</Button>
            <Button variant="destructive" disabled={actioning || reason.trim().length < 10} onClick={handleRefund}>
              {actioning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
