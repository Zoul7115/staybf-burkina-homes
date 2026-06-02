import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, TrendingUp, Receipt, Percent } from "lucide-react";
import { StatCard, MiniBarChart, MiniLineChart } from "@/components/dashboard/widgets";
import { hostStats, revenueChart, occupancyChart, analyticsTopRooms, fmtFCFA } from "@/lib/staybf-host-data";

export const Route = createFileRoute("/host/analytics")({ component: HostAnalyticsPage });

function HostAnalyticsPage() {
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
        <Button variant="outline" size="sm">Exporter rapport</Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Vues" value={hostStats.views.toLocaleString("fr-FR")} delta="+24%" icon={Eye} />
        <StatCard label="Taux de conversion" value="6.2%" delta="+0.8pt" icon={Percent} accent="secondary" />
        <StatCard label="Réservations" value={hostStats.bookings} delta="+12" icon={Receipt} />
        <StatCard label="Taux d'occupation" value={`${hostStats.occupancy}%`} delta="+6pt" icon={TrendingUp} accent="muted" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <MiniLineChart label="Tendance des revenus" data={revenueChart} height={200} />
        <MiniBarChart label="Tendance des réservations" data={occupancyChart} height={200} accent="secondary" />
      </div>

      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4">Top chambres performantes</h3>
        <ul className="space-y-3">
          {analyticsTopRooms.map((r, i) => (
            <li key={r.name} className="flex items-center gap-4">
              <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center font-bold text-sm shrink-0">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-semibold text-sm truncate">{r.name}</p>
                  <p className="font-display font-bold text-sm shrink-0">{fmtFCFA(r.revenue)}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{r.bookings} réservations</span>
                  <span>·</span>
                  <span>Taux {r.rate}%</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full gradient-primary" style={{ width: `${r.rate}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
