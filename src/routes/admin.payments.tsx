import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, AlertCircle, RotateCcw, ArrowDownToLine } from "lucide-react";
import { StatCard, StatusBadge } from "@/components/dashboard/widgets";
import { useAdminPayments } from "@/lib/admin";

export const Route = createFileRoute("/admin/payments")({ component: PaymentsPage });

function fmtFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

// payments mutations (refund/retry) require a service_role Edge Function
// because payments has SELECT GRANT only for admin role.

function PaymentsPage() {
  const { payments, loading, error } = useAdminPayments();

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
          {/* Payouts management requires service_role Edge Function */}
          <Button variant="outline" size="sm" disabled title="Nécessite une Edge Function service_role">
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
                {/* Refund/retry require service_role Edge Function */}
                <TableCell className="text-right">
                  {p.status === "captured" && (
                    <Button size="sm" variant="ghost" disabled title="Nécessite une Edge Function service_role">
                      Rembourser
                    </Button>
                  )}
                  {p.status === "failed" && (
                    <Button size="sm" variant="ghost" disabled title="Nécessite une Edge Function service_role">
                      Relancer
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
