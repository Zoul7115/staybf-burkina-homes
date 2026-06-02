import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Wallet, TrendingUp, ArrowDownToLine, FileText } from "lucide-react";
import { StatCard, MiniLineChart, StatusBadge } from "@/components/dashboard/widgets";
import { hostStats, revenueChart, hostTransactions, hostPayouts, fmtFCFA } from "@/lib/staybf-host-data";

export const Route = createFileRoute("/host/revenue")({ component: HostRevenuePage });

function HostRevenuePage() {
  const total = hostTransactions.filter((t) => t.status === "paid").reduce((s, t) => s + t.amount, 0);
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Revenus totaux" value={fmtFCFA(total)} delta="+18%" icon={Wallet} />
        <StatCard label="Ce mois" value={fmtFCFA(hostStats.monthlyRevenue)} delta="+12%" icon={TrendingUp} />
        <StatCard label="Annuel projeté" value={fmtFCFA(hostStats.monthlyRevenue * 12)} icon={TrendingUp} accent="secondary" />
        <StatCard label="Prochain versement" value={fmtFCFA(3_842_000)} hint="01 Juillet 2026" icon={ArrowDownToLine} accent="muted" />
      </div>

      <MiniLineChart label="Évolution des revenus" data={revenueChart} height={220} />

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold">Transactions récentes</h3>
          <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" /> Exporter</Button>
        </div>
        <div className="overflow-x-auto -mx-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Date</TableHead>
                <TableHead>Référence</TableHead>
                <TableHead>Invité</TableHead>
                <TableHead>Méthode</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right pr-5">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hostTransactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-5 text-xs text-muted-foreground">{t.date}</TableCell>
                  <TableCell className="font-mono text-xs">{t.ref}</TableCell>
                  <TableCell className="text-sm font-medium">{t.guest}</TableCell>
                  <TableCell className="text-xs">{t.method}</TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-right pr-5 font-semibold">{fmtFCFA(t.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold">Historique des versements</h3>
          <Button variant="outline" size="sm"><FileText className="h-4 w-4 mr-1.5" /> Rapport PDF</Button>
        </div>
        <ul className="divide-y divide-border -my-2">
          {hostPayouts.map((p) => (
            <li key={p.id} className="py-3 flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center"><ArrowDownToLine className="h-5 w-5" /></span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{fmtFCFA(p.amount)}</p>
                <p className="text-xs text-muted-foreground">{p.method} · {p.date}</p>
              </div>
              <StatusBadge status="paid" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
