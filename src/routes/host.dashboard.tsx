import { createFileRoute, Link } from "@tanstack/react-router";
import { Wallet, TrendingUp, Receipt, Bell, Star, ArrowRight, CalendarCheck, CalendarX, MessageSquare } from "lucide-react";
import { StatCard, MiniBarChart, MiniLineChart, SectionCard } from "@/components/dashboard/widgets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { useHostDashboard } from "@/lib/host";
import { getInitials } from "@/lib/shared";

export const Route = createFileRoute("/host/dashboard")({ component: HostDashboard });

// ── Helpers ──────────────────────────────────────────────────

function fmtFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days}j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ── Skeletons ─────────────────────────────────────────────────

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="p-5">
          <Skeleton className="h-3 w-24 mb-3" />
          <Skeleton className="h-7 w-20 mb-2" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </Card>
      ))}
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 p-5">
        <Skeleton className="h-4 w-48 mb-4" />
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </Card>
      <Card className="p-5">
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </Card>
    </div>
  );
}

function SectionsSkeleton() {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="p-5">
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

function HostDashboard() {
  const { data, loading, error } = useHostDashboard();

  if (loading) {
    return (
      <div className="space-y-6">
        <StatsSkeleton />
        <ChartsSkeleton />
        <SectionsSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-10 text-center text-muted-foreground text-sm">
        Erreur lors du chargement du tableau de bord : {error}
      </Card>
    );
  }

  const stats = data?.stats;
  const checkIns = data?.upcomingCheckIns ?? [];
  const checkOuts = data?.upcomingCheckOuts ?? [];
  const recentReviews = data?.recentReviews ?? [];
  const recentMessages = data?.recentMessages ?? [];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          label="Revenus du mois"
          value={stats ? fmtFCFA(stats.monthlyRevenueFcfa) : "—"}
          icon={Wallet}
        />
        <StatCard
          label="Taux d'occupation"
          value="—"
          hint="Disponible prochainement"
          icon={TrendingUp}
          accent="muted"
        />
        <StatCard
          label="Réservations"
          value={stats?.totalBookingsThisMonth ?? "—"}
          icon={Receipt}
          accent="secondary"
        />
        <StatCard
          label="Note moyenne"
          value={stats?.avgRating != null ? stats.avgRating.toFixed(2) : "—"}
          hint={stats?.totalReviews ? `${stats.totalReviews} avis` : undefined}
          icon={Star}
          accent="muted"
        />
        <StatCard
          label="En attente"
          value={stats?.pendingBookings ?? "—"}
          hint="À valider"
          icon={Bell}
          accent="destructive"
        />
      </div>

      {/* Charts — données temps-réel à venir */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <MiniLineChart
            label="Revenus mensuels (en milliers FCFA)"
            data={[]}
            height={200}
          />
        </div>
        <MiniBarChart label="Occupation hebdo" data={[]} height={200} />
      </div>

      {/* Check-ins / Check-outs */}
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard
          title="Arrivées prévues"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/host/reservations">
                Voir tout <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          }
        >
          {checkIns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucune arrivée prévue dans les 7 prochains jours.
            </p>
          ) : (
            <ul className="divide-y divide-border -my-2">
              {checkIns.map((c) => (
                <li key={c.bookingId} className="py-3 flex items-center gap-3">
                  <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                    <CalendarCheck className="h-5 w-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {c.travelerName ?? "Voyageur"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.roomName ?? "—"} · {c.guestsAdults} pers · {c.reference}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {fmtDate(c.checkIn)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Départs prévus">
          {checkOuts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucun départ prévu dans les 7 prochains jours.
            </p>
          ) : (
            <ul className="divide-y divide-border -my-2">
              {checkOuts.map((c) => (
                <li key={c.bookingId} className="py-3 flex items-center gap-3">
                  <span className="h-10 w-10 rounded-xl bg-secondary/20 text-secondary-foreground grid place-items-center shrink-0">
                    <CalendarX className="h-5 w-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {c.travelerName ?? "Voyageur"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.roomName ?? "—"} · {c.reference}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {fmtDate(c.checkIn)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Reviews / Messages */}
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard
          title="Avis récents"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/host/reviews">Tout voir</Link>
            </Button>
          }
        >
          {recentReviews.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucun avis récent.
            </p>
          ) : (
            <ul className="space-y-4">
              {recentReviews.map((r) => (
                <li key={r.id} className="flex gap-3">
                  <div className="h-9 w-9 rounded-full gradient-primary text-primary-foreground grid place-items-center text-xs font-bold shrink-0">
                    {getInitials(r.reviewerName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm">
                        {r.reviewerName ?? "Voyageur"}
                      </p>
                      <div className="flex items-center gap-0.5 text-secondary">
                        {Array.from({ length: r.overallRating }).map((_, i) => (
                          <Star key={i} className="h-3 w-3 fill-current" />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {relativeTime(r.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Messages récents"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/host/messages">Tout voir</Link>
            </Button>
          }
        >
          {recentMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucun message récent.
            </p>
          ) : (
            <ul className="space-y-3">
              {recentMessages.map((m) => (
                <li key={m.threadId} className="flex gap-3 items-center">
                  <div className="h-10 w-10 rounded-full gradient-primary text-primary-foreground grid place-items-center text-xs font-bold shrink-0">
                    {getInitials(m.travelerName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm truncate">
                        {m.travelerName ?? "Voyageur"}
                      </p>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {m.lastMessageAt ? relativeTime(m.lastMessageAt) : "—"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.lastMessageBody ?? ""}
                    </p>
                  </div>
                  {m.hostUnreadCount > 0 && (
                    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  )}
                  {m.hostUnreadCount === 0 && (
                    <MessageSquare className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
