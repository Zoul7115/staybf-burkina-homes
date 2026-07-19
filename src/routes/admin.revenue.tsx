import { createFileRoute } from "@tanstack/react-router";
import { Wallet, TrendingUp } from "lucide-react";
import { StatCard, MiniLineChart, MiniBarChart } from "@/components/dashboard/widgets";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminRevenue } from "@/lib/admin";

export const Route = createFileRoute("/admin/revenue")({ component: AdminRevenuePage });

function fmtFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function AdminRevenuePage() {
  const { data, loading, error } = useAdminRevenue();

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-4"><Skeleton className="h-16 w-full" /></Card>)}
        </div>
        <Card className="p-4"><Skeleton className="h-56 w-full" /></Card>
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-4"><Skeleton className="h-40 w-full" /></Card>
          <Card className="p-4"><Skeleton className="h-40 w-full" /></Card>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <Card className="p-10 text-center text-muted-foreground text-sm">{error ?? "Erreur de chargement."}</Card>;
  }

  // Platform takes ~15% commission, ~5% service fees (approximation based on captured payments)
  const commission = Math.round(data.totalRevenueFcfa * 0.15);
  const serviceFee = Math.round(data.totalRevenueFcfa * 0.05);

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Revenus plateforme" value={fmtFCFA(data.totalRevenueFcfa)} icon={Wallet} />
        <StatCard label="Commission estimée (15%)" value={fmtFCFA(commission)} icon={TrendingUp} accent="secondary" />
        <StatCard label="Frais de service (5%)" value={fmtFCFA(serviceFee)} icon={TrendingUp} />
        <StatCard label="Volume réservations" value={data.bookingsChart.reduce((s, p) => s + p.value, 0).toLocaleString("fr-FR")} icon={TrendingUp} accent="muted" />
      </div>

      <MiniLineChart label="Revenu plateforme (milliers FCFA)" data={data.revenueChart} height={240} />

      <div className="grid lg:grid-cols-2 gap-4">
        <MiniBarChart label="Volume des réservations" data={data.bookingsChart} height={200} />
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-3">Projection Q3 2026</h3>
          <p className="font-display font-bold text-3xl">{fmtFCFA(Math.round(data.totalRevenueFcfa * 1.24))}</p>
          <p className="text-sm text-primary mt-1">+24% vs période actuelle</p>
          <div className="mt-4 space-y-2 text-sm">
            <Row label="Commission projetée (15%)" value={fmtFCFA(Math.round(data.totalRevenueFcfa * 1.24 * 0.15))} />
            <Row label="Frais service projetés (5%)" value={fmtFCFA(Math.round(data.totalRevenueFcfa * 1.24 * 0.05))} />
          </div>
        </Card>
      </div>
    </div>
  );
}
