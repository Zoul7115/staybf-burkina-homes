import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, TrendingUp, RotateCw, XCircle } from "lucide-react";
import { StatCard, MiniBarChart, StatusBadge } from "@/components/dashboard/widgets";
import { useAdminSubscriptions } from "@/lib/admin";

export const Route = createFileRoute("/admin/subscriptions")({ component: AdminSubscriptionsPage });

function fmtFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function AdminSubscriptionsPage() {
  const { subscriptions, loading, error } = useAdminSubscriptions();

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-4"><Skeleton className="h-16 w-full" /></Card>)}
        </div>
        <Card className="p-4"><Skeleton className="h-40 w-full" /></Card>
        <Card className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </Card>
      </div>
    );
  }

  if (error) {
    return <Card className="p-10 text-center text-muted-foreground text-sm">Erreur : {error}</Card>;
  }

  const active = subscriptions.filter((s) => s.status === "active").length;
  const mrr = subscriptions
    .filter((s) => s.status === "active")
    .reduce((sum, s) => sum + (s.planPriceFcfa > 50_000 ? s.planPriceFcfa / 12 : s.planPriceFcfa), 0);

  // Compute per-plan distribution
  const planMap: Record<string, number> = {};
  subscriptions.forEach((s) => {
    if (s.planName) planMap[s.planName] = (planMap[s.planName] ?? 0) + 1;
  });
  const byPlan = Object.entries(planMap).map(([label, value]) => ({ label, value }));

  // Count renewals/expirations in next 7/30 days
  const now = Date.now();
  const renewals7d = subscriptions.filter((s) => {
    if (!s.currentPeriodEnd || s.status !== "active") return false;
    const diff = new Date(s.currentPeriodEnd).getTime() - now;
    return diff > 0 && diff <= 7 * 86_400_000;
  }).length;
  const expirations30d = subscriptions.filter((s) => {
    if (!s.currentPeriodEnd || s.status !== "active") return false;
    const diff = new Date(s.currentPeriodEnd).getTime() - now;
    return diff > 0 && diff <= 30 * 86_400_000;
  }).length;

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-4 gap-3">
        <StatCard label="Abonnements actifs" value={active} icon={Crown} />
        <StatCard label="MRR" value={fmtFCFA(Math.round(mrr))} delta="+18%" icon={TrendingUp} accent="secondary" />
        <StatCard label="Renouvellements (7j)" value={renewals7d} icon={RotateCw} accent="muted" />
        <StatCard label="Expirations (30j)" value={expirations30d} icon={XCircle} accent="destructive" />
      </div>

      {byPlan.length > 0 && (
        <MiniBarChart label="Répartition par plan" data={byPlan} height={180} accent="secondary" />
      )}

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
            {subscriptions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                  Aucun abonnement.
                </TableCell>
              </TableRow>
            )}
            {subscriptions.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="text-sm font-medium">{s.hostName ?? "—"}</TableCell>
                <TableCell>
                  {s.planName && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {s.planName}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{s.planPriceFcfa > 0 ? fmtFCFA(s.planPriceFcfa) : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(s.startedAt)}</TableCell>
                <TableCell className="text-xs">{fmtDate(s.currentPeriodEnd)}</TableCell>
                <TableCell>
                  <StatusBadge status={s.status === "active" ? "active" : s.status === "pending" ? "pending" : "cancelled"} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
