import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { CalendarCheck, Heart, Star, CheckCircle2, MapPin, ChevronRight, Bell } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { TravelerShell } from "@/components/traveler/TravelerShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  traveler, stats, upcomingBookings, getBookingProperty, notifications,
} from "@/lib/staybf-traveler-data";

export const Route = createFileRoute("/traveler/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — StayBF" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <TravelerShell title="Dashboard">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="font-display font-bold text-2xl md:text-3xl">Bonjour {traveler.firstName} 👋</h2>
        <p className="text-muted-foreground mt-1">Bienvenue sur votre espace voyageur. Voici un aperçu de votre activité.</p>
      </motion.div>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={CalendarCheck} label="Réservations actives" value={stats.active} tint="from-primary to-primary-dark" />
        <StatCard icon={CheckCircle2} label="Séjours terminés" value={stats.completed} tint="from-blue-500 to-indigo-600" />
        <StatCard icon={Heart} label="Favoris" value={stats.favorites} tint="from-rose-500 to-pink-600" />
        <StatCard icon={Star} label="Avis publiés" value={stats.reviews} tint="from-amber-500 to-orange-500" />
      </div>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display font-semibold text-xl">Prochains séjours</h3>
          <Link to="/traveler/bookings" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            Tout voir <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-4 grid md:grid-cols-2 gap-4">
          {upcomingBookings.map((b, i) => {
            const p = getBookingProperty(b);
            return (
              <motion.article
                key={b.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="rounded-2xl bg-card border border-border overflow-hidden shadow-card hover-lift"
              >
                <div className="flex gap-4 p-4">
                  <img src={p.images[0]} alt={p.name} className="h-24 w-28 object-cover rounded-xl shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-primary/10 text-primary border-0 rounded-full text-[10px]">
                        {b.status === "upcoming" ? "À venir" : "Confirmée"}
                      </Badge>
                    </div>
                    <p className="font-semibold mt-1 truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" /> {p.city}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {format(new Date(b.from), "d MMM", { locale: fr })} → {format(new Date(b.to), "d MMM yyyy", { locale: fr })}
                    </p>
                  </div>
                </div>
                <div className="border-t border-border bg-muted/30 p-3 flex items-center justify-between">
                  <span className="text-xs font-mono text-muted-foreground">{b.ref}</span>
                  <Button asChild size="sm" variant="outline" className="rounded-lg h-8">
                    <Link to="/properties/$id" params={{ id: p.id }}>Voir détails</Link>
                  </Button>
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>

      <section className="mt-10 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-card border border-border p-5">
          <h3 className="font-display font-semibold text-lg flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" /> Activité récente
          </h3>
          <ul className="mt-4 divide-y divide-border">
            {notifications.map((n) => (
              <li key={n.id} className="py-3 flex items-start gap-3">
                <span className={`h-2 w-2 mt-2 rounded-full ${n.unread ? "bg-primary" : "bg-muted-foreground/30"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{n.text}</p>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{n.time}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl gradient-primary text-primary-foreground p-6 shadow-glow">
          <h3 className="font-display font-bold text-lg">Envie d'évasion ?</h3>
          <p className="text-sm opacity-90 mt-2">Découvrez de nouveaux hébergements premium à travers le Burkina Faso.</p>
          <Button asChild variant="secondary" className="mt-4 rounded-xl bg-white text-primary hover:bg-white/90">
            <Link to="/search">Explorer</Link>
          </Button>
        </div>
      </section>
    </TravelerShell>
  );
}

function StatCard({
  icon: Icon, label, value, tint,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tint: string }) {
  return (
    <motion.div whileHover={{ y: -2 }} className="rounded-2xl bg-card border border-border p-4 shadow-card">
      <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${tint} text-white grid place-items-center`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="font-display font-bold text-2xl mt-3">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </motion.div>
  );
}
