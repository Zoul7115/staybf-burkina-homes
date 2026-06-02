import { createFileRoute } from "@tanstack/react-router";
import { Wallet, Users, Building2, UserCog, Receipt, Crown, ShieldAlert, AlertTriangle } from "lucide-react";
import { StatCard, MiniLineChart, MiniBarChart, SectionCard } from "@/components/dashboard/widgets";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminStats, adminRevenueChart, adminBookingsChart, adminGrowthChart, fmtFCFA, fmtK, adminBookings, adminHosts } from "@/lib/staybf-admin-data";
import { StatusBadge } from "@/components/dashboard/widgets";

export const Route = createFileRoute("/admin/dashboard")({ component: AdminDashboard });

function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Revenus plateforme" value={fmtFCFA(adminStats.totalRevenue)} delta="+22%" icon={Wallet} />
        <StatCard label="Hôtes actifs" value={adminStats.totalHosts} delta="+18" icon={Users} accent="secondary" />
        <StatCard label="Voyageurs" value={fmtK(adminStats.totalTravelers)} delta="+12%" icon={UserCog} />
        <StatCard label="Propriétés" value={adminStats.totalProperties} delta="+34" icon={Building2} accent="muted" />
        <StatCard label="Réservations" value={fmtK(adminStats.totalBookings)} delta="+8%" icon={Receipt} />
        <StatCard label="Abonnements actifs" value={adminStats.activeSubscriptions} delta="+12" icon={Crown} accent="secondary" />
        <StatCard label="Vérifications" value={adminStats.pendingVerifications} hint="En attente" icon={ShieldAlert} accent="destructive" />
        <StatCard label="Alertes système" value={adminStats.systemAlerts} icon={AlertTriangle} accent="destructive" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><MiniLineChart label="Revenus (en milliers FCFA)" data={adminRevenueChart} height={220} /></div>
        <MiniBarChart label="Croissance hôtes" data={adminGrowthChart} accent="secondary" height={220} />
      </div>

      <MiniBarChart label="Volume des réservations" data={adminBookingsChart} height={180} />

      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="Dernières réservations">
          <ul className="divide-y divide-border -my-2">
            {adminBookings.slice(0, 5).map((b) => (
              <li key={b.id} className="py-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold">{b.guest.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{b.guest}</p>
                  <p className="text-xs text-muted-foreground truncate">{b.property} · {b.ref}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm">{fmtFCFA(b.amount)}</p>
                  <StatusBadge status={b.status} />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Nouveaux hôtes à valider">
          <ul className="divide-y divide-border -my-2">
            {adminHosts.filter((h) => h.status === "pending").slice(0, 5).map((h) => (
              <li key={h.id} className="py-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full gradient-primary text-primary-foreground grid place-items-center text-xs font-bold">{h.avatar}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{h.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{h.city} · {h.properties} propriété(s)</p>
                </div>
                <Button size="sm" variant="outline">Vérifier</Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
