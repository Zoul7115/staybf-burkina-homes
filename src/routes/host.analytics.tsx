import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Receipt, Wallet } from "lucide-react";
import { StatCard, MiniLineChart, EmptyState } from "@/components/dashboard/widgets";
import { useHostRevenue } from "@/lib/host";

export const Route = createFileRoute("/host/analytics")({ component: HostAnalyticsPage });

function fmtFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function HostAnalyticsPage() {
  const { data, loading, error } = useHostRevenue();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Select defaultValue="90">
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 derniers jours</SelectItem>
            <SelectItem value="30">30 derniers jours</SelectItem>
            <SelectItem value="90">90 derniers jours</SelectItem>
            <SelectItem value="365">12 derniers mois</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" disabled title="À venir">Exporter rapport</Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-[200px] rounded-xl" />
        </div>
      ) : error ? (
        <Card className="p-10 text-center text-muted-foreground text-sm">
          Erreur lors du chargement des analytics : {error}
        </Card>
      ) : !data ? (
        <EmptyState icon={Wallet} title="Aucune donnée" description="Vos analytics apparaîtront ici après vos premières réservations." />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard label="Revenus totaux" value={fmtFCFA(data.totalPaidFcfa)} icon={Wallet} />
            <StatCard label="Ce mois" value={fmtFCFA(data.monthlyRevenueFcfa)} icon={TrendingUp} accent="secondary" />
            <StatCard label="Transactions" value={data.transactions.filter(t => t.status === "captured").length} icon={Receipt} accent="muted" />
          </div>

          {data.revenueChart.some((p) => p.value > 0) && (
            <MiniLineChart label="Tendance des revenus" data={data.revenueChart} height={200} />
          )}
        </>
      )}
    </div>
  );
}
