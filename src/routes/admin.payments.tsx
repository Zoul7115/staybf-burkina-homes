import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CreditCard, AlertCircle, RotateCcw, ArrowDownToLine } from "lucide-react";
import { StatCard, StatusBadge } from "@/components/dashboard/widgets";
import { adminPayments, fmtFCFA } from "@/lib/staybf-admin-data";

export const Route = createFileRoute("/admin/payments")({ component: PaymentsPage });

function PaymentsPage() {
  const failed = adminPayments.filter(p => p.status === "failed").length;
  const refunds = adminPayments.filter(p => p.status === "refunded").length;
  const total = adminPayments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-4 gap-3">
        <StatCard label="Volume traité" value={fmtFCFA(total)} icon={CreditCard} />
        <StatCard label="Paiements" value={adminPayments.length} icon={CreditCard} accent="secondary" />
        <StatCard label="Échecs" value={failed} icon={AlertCircle} accent="destructive" />
        <StatCard label="Remboursements" value={refunds} icon={RotateCcw} accent="muted" />
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-semibold">Transactions</h3>
          <Button variant="outline" size="sm"><ArrowDownToLine className="h-4 w-4 mr-1.5" /> Payouts en attente</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Méthode</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adminPayments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.ref}</TableCell>
                <TableCell className="text-sm font-medium">{p.user}</TableCell>
                <TableCell className="text-xs">{p.method}</TableCell>
                <TableCell className="text-sm font-semibold">{fmtFCFA(p.amount)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.date}</TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
                <TableCell className="text-right">
                  {p.status === "paid" && <Button size="sm" variant="ghost">Rembourser</Button>}
                  {p.status === "failed" && <Button size="sm" variant="ghost">Relancer</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
