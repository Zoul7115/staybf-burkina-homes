import { createFileRoute, Link } from "@tanstack/react-router";
import { Wallet, TrendingUp, Receipt, Eye, Bell, Star, ArrowRight, CalendarCheck, CalendarX } from "lucide-react";
import { StatCard, MiniBarChart, MiniLineChart, SectionCard } from "@/components/dashboard/widgets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { hostStats, revenueChart, occupancyChart, upcomingCheckIns, upcomingCheckOuts, recentReviews, recentMessages, fmtFCFA } from "@/lib/staybf-host-data";

export const Route = createFileRoute("/host/dashboard")({ component: HostDashboard });

function HostDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Revenus du mois" value={fmtFCFA(hostStats.monthlyRevenue)} delta="+18%" icon={Wallet} />
        <StatCard label="Taux d'occupation" value={`${hostStats.occupancy}%`} delta="+6 pts" icon={TrendingUp} />
        <StatCard label="Réservations" value={hostStats.bookings} delta="+12" icon={Receipt} accent="secondary" />
        <StatCard label="Vues" value={hostStats.views.toLocaleString("fr-FR")} delta="+24%" icon={Eye} accent="muted" />
        <StatCard label="En attente" value={hostStats.pendingRequests} hint="À valider" icon={Bell} accent="destructive" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><MiniLineChart label="Revenus mensuels (en milliers FCFA)" data={revenueChart} height={200} /></div>
        <MiniBarChart label="Occupation hebdo" data={occupancyChart} height={200} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="Arrivées prévues" action={<Button asChild variant="ghost" size="sm"><Link to="/host/reservations">Voir tout <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link></Button>}>
          <ul className="divide-y divide-border -my-2">
            {upcomingCheckIns.map((c) => (
              <li key={c.id} className="py-3 flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center"><CalendarCheck className="h-5 w-5" /></span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{c.guest}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.room} · {c.guests} pers · {c.ref}</p>
                </div>
                <Badge variant="outline" className="shrink-0">{c.date}</Badge>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Départs prévus">
          <ul className="divide-y divide-border -my-2">
            {upcomingCheckOuts.map((c) => (
              <li key={c.id} className="py-3 flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl bg-secondary/20 text-secondary-foreground grid place-items-center"><CalendarX className="h-5 w-5" /></span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{c.guest}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.room} · {c.ref}</p>
                </div>
                <Badge variant="outline" className="shrink-0">{c.date}</Badge>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="Avis récents" action={<Button asChild variant="ghost" size="sm"><Link to="/host/reviews">Tout voir</Link></Button>}>
          <ul className="space-y-4">
            {recentReviews.map((r) => (
              <li key={r.id} className="flex gap-3">
                <div className="h-9 w-9 rounded-full gradient-primary text-primary-foreground grid place-items-center text-xs font-bold shrink-0">{r.avatar}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm">{r.name}</p>
                    <div className="flex items-center gap-0.5 text-secondary">
                      {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-3 w-3 fill-current" />)}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{r.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{r.date}</p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Messages récents" action={<Button asChild variant="ghost" size="sm"><Link to="/host/messages">Tout voir</Link></Button>}>
          <ul className="space-y-3">
            {recentMessages.map((m) => (
              <li key={m.id} className="flex gap-3 items-center">
                <div className="h-10 w-10 rounded-full gradient-primary text-primary-foreground grid place-items-center text-xs font-bold shrink-0">{m.avatar}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm truncate">{m.name}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">{m.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{m.preview}</p>
                </div>
                {m.unread && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
