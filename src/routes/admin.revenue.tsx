import { createFileRoute } from "@tanstack/react-router";
import { Wallet, TrendingUp, Percent, Crown } from "lucide-react";
import { StatCard, MiniLineChart, MiniBarChart } from "@/components/dashboard/widgets";
import { Card } from "@/components/ui/card";
import { adminStats, adminRevenueChart, adminBookingsChart, fmtFCFA } from "@/lib/staybf-admin-data";

export const Route = createFileRoute("/admin/revenue")({ component: AdminRevenuePage });

function AdminRevenuePage() {
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Revenus plateforme" value={fmtFCFA(adminStats.totalRevenue)} delta="+22%" icon={Wallet} />
        <StatCard label="Commission" value={fmtFCFA(adminStats.commissionRevenue)} delta="+18%" icon={Percent} accent="secondary" />
        <StatCard label="Frais de service" value={fmtFCFA(adminStats.serviceFeeRevenue)} delta="+14%" icon={TrendingUp} />
        <StatCard label="Abonnements" value={fmtFCFA(adminStats.subscriptionRevenue)} delta="+9%" icon={Crown} accent="muted" />
      </div>

      <MiniLineChart label="Revenu plateforme (milliers FCFA)" data={adminRevenueChart} height={240} />

      <div className="grid lg:grid-cols-2 gap-4">
        <MiniBarChart label="Volume des réservations" data={adminBookingsChart} height={200} />
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-3">Prévision Q3 2026</h3>
          <p className="font-display font-bold text-3xl">{fmtFCFA(48_500_000)}</p>
          <p className="text-sm text-primary mt-1">+24% vs Q2</p>
          <div className="mt-4 space-y-2 text-sm">
            <Row label="Commission projetée" value={fmtFCFA(4_125_000)} />
            <Row label="Frais service projetés" value={fmtFCFA(2_410_000)} />
            <Row label="Abonnements projetés" value={fmtFCFA(1_840_000)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-semibold">{value}</span></div>;
}
