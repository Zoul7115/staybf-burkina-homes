import { createFileRoute } from "@tanstack/react-router";
import { Wallet, Users, Building2, UserCog, Receipt, Crown, ShieldAlert, AlertTriangle } from "lucide-react";
import { StatCard, MiniLineChart, MiniBarChart, SectionCard, StatusBadge } from "@/components/dashboard/widgets";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminDashboard } from "@/lib/admin";
import { getInitials } from "@/lib/shared";

export const Route = createFileRoute("/admin/dashboard")({ component: AdminDashboard });

function fmtFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="p-4"><Skeleton className="h-16 w-full" /></Card>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-4"><Skeleton className="h-48 w-full" /></Card>
        <Card className="p-4"><Skeleton className="h-48 w-full" /></Card>
      </div>
      <Card className="p-4"><Skeleton className="h-32 w-full" /></Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4"><Skeleton className="h-40 w-full" /></Card>
        <Card className="p-4"><Skeleton className="h-40 w-full" /></Card>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const { data, loading, error } = useAdminDashboard();

  if (loading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <Card className="p-10 text-center text-muted-foreground text-sm">
        {error ?? "Erreur de chargement du tableau de bord."}
      </Card>
    );
  }

  const { stats, revenueChart, bookingsChart, growthChart, recentBookings, pendingHosts } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Revenus plateforme" value={fmtFCFA(stats.totalRevenueFcfa)} icon={Wallet} />
        <StatCard label="Hôtes actifs" value={stats.totalHosts} icon={Users} accent="secondary" />
        <StatCard label="Voyageurs" value={fmtK(stats.totalTravelers)} icon={UserCog} />
        <StatCard label="Propriétés" value={stats.totalProperties} icon={Building2} accent="muted" />
        <StatCard label="Réservations" value={fmtK(stats.totalBookings)} icon={Receipt} />
        <StatCard label="Abonnements actifs" value={stats.activeSubscriptions} icon={Crown} accent="secondary" />
        <StatCard label="Vérifications" value={stats.pendingVerifications} hint="En attente" icon={ShieldAlert} accent="destructive" />
        <StatCard label="Alertes système" value={stats.systemAlerts} icon={AlertTriangle} accent="destructive" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <MiniLineChart label="Revenus (en milliers FCFA)" data={revenueChart} height={220} />
        </div>
        <MiniBarChart label="Croissance hôtes" data={growthChart} accent="secondary" height={220} />
      </div>

      <MiniBarChart label="Volume des réservations" data={bookingsChart} height={180} />

      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="Dernières réservations">
          {recentBookings.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Aucune réservation récente.</p>
          ) : (
            <ul className="divide-y divide-border -my-2">
              {recentBookings.map((b) => (
                <li key={b.id} className="py-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold shrink-0">
                    {getInitials(b.travelerName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{b.travelerName ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {b.propertyName ?? b.roomName ?? "—"} · {b.reference}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{fmtFCFA(b.totalAmount)}</p>
                    <StatusBadge status={b.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Nouveaux hôtes à valider">
          {pendingHosts.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Aucun hôte en attente.</p>
          ) : (
            <ul className="divide-y divide-border -my-2">
              {pendingHosts.map((h) => (
                <li key={h.id} className="py-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full gradient-primary text-primary-foreground grid place-items-center text-xs font-bold shrink-0">
                    {getInitials(h.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{h.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {h.city ?? "—"} · {h.propertiesCount} propriété(s)
                    </p>
                  </div>
                  <Button size="sm" variant="outline">Vérifier</Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
