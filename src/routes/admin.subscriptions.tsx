import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Crown, TrendingUp, RotateCw, XCircle } from "lucide-react";
import { StatCard, MiniBarChart, StatusBadge } from "@/components/dashboard/widgets";
import { adminSubscriptions, fmtFCFA } from "@/lib/staybf-admin-data";

export const Route = createFileRoute("/admin/subscriptions")({ component: AdminSubscriptionsPage });

function AdminSubscriptionsPage() {
  const active = adminSubscriptions.filter((s) => s.status === "active").length;
  const mrr = adminSubscriptions.filter((s) => s.status === "active").reduce((sum, s) => sum + (s.price > 50000 ? s.price / 12 : s.price), 0);

  const byPlan = ["Découverte", "Croissance", "Pro", "Entreprise"].map((p) => ({
    label: p, value: adminSubscriptions.filter((s) => s.plan === p).length,
  }));

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-4 gap-3">
        <StatCard label="Abonnements actifs" value={active} delta="+12" icon={Crown} />
        <StatCard label="MRR" value={fmtFCFA(Math.round(mrr))} delta="+18%" icon={TrendingUp} accent="secondary" />
        <StatCard label="Renouvellements (7j)" value={4} icon={RotateCw} accent="muted" />
        <StatCard label="Expirations (30j)" value={7} icon={XCircle} accent="destructive" />
      </div>

      <MiniBarChart label="Répartition par plan" data={byPlan} height={180} accent="secondary" />

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-display font-semibold">Abonnés</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hôte</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Prix</TableHead>
              <TableHead>Début</TableHead>
              <TableHead>Renouvellement</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adminSubscriptions.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="text-sm font-medium">{s.host}</TableCell>
                <TableCell><span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{s.plan}</span></TableCell>
                <TableCell className="text-sm">{s.price > 0 ? fmtFCFA(s.price) : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.start}</TableCell>
                <TableCell className="text-xs">{s.renew}</TableCell>
                <TableCell><StatusBadge status={s.status === "active" ? "active" : s.status === "pending" ? "pending" : "cancelled"} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
