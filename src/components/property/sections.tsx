import { useState } from "react";
import { motion } from "framer-motion";
import { differenceInDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Star, MapPin, Share2, Heart, BadgeCheck, Crown, Clock, MessageCircle,
  Wifi, Snowflake, Car, Utensils, ShieldCheck, Droplets, Zap, Tv,
  ChefHat, Briefcase, Waves, Shirt, ChevronRight, CalendarIcon,
  Users, CreditCard, Smartphone, Star as StarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { similarProperties, useProperty } from "@/lib/staybf-property-data";
import { useNavigate } from "@tanstack/react-router";

const amenityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  wifi: Wifi, ac: Snowflake, parking: Car, restaurant: Utensils, security: ShieldCheck,
  hotwater: Droplets, generator: Zap, tv: Tv, kitchen: ChefHat, workspace: Briefcase,
  pool: Waves, laundry: Shirt,
};

/* ---------- Header ---------- */
export function PropertyHeader() {
  const property = useProperty();
  const [fav, setFav] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display font-bold text-2xl md:text-4xl tracking-tight">{property.name}</h1>
          <div className="mt-2 flex items-center gap-3 flex-wrap text-sm">
            <span className="flex items-center gap-1 font-semibold">
              <Star className="h-4 w-4 fill-secondary text-secondary" />
              {property.rating}
            </span>
            <span className="text-muted-foreground underline">{property.reviews} avis</span>
            <span className="text-muted-foreground">·</span>
            <Badge className="bg-primary/10 text-primary border-0 gap-1">
              <BadgeCheck className="h-3 w-3" /> Vérifié StayBF
            </Badge>
            <span className="text-muted-foreground">·</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {property.city}, {property.neighborhood}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5 rounded-full">
            <Share2 className="h-4 w-4" /> Partager
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setFav(!fav)} className="gap-1.5 rounded-full">
            <Heart className={cn("h-4 w-4", fav && "fill-destructive text-destructive")} />
            Sauvegarder
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Host card ---------- */
export function HostCard() {
  const property = useProperty();
  const { host } = property;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      className="rounded-3xl border border-border/60 p-5 md:p-6 bg-card shadow-card"
    >
      <div className="flex items-start gap-4">
        <Avatar className="h-16 w-16 ring-2 ring-primary/20">
          <AvatarFallback className="bg-gradient-to-br from-primary to-primary-dark text-primary-foreground font-display font-bold text-lg">
            {host.avatar}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-semibold text-lg">Hébergé par {host.name}</h3>
            {host.superhost && (
              <Badge className="bg-secondary text-foreground border-0 gap-1"><Crown className="h-3 w-3" /> Super Hôte</Badge>
            )}
            {host.verified && (
              <Badge className="bg-primary text-primary-foreground border-0 gap-1"><BadgeCheck className="h-3 w-3" /> Vérifié</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{host.type} · Sur StayBF depuis {host.since}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              <span><span className="font-semibold">{host.responseRate}%</span> de réponse</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span>Répond en <span className="font-semibold">{host.responseTime}</span></span>
            </div>
          </div>
          <Button variant="outline" className="mt-4 rounded-xl">Contacter l'hôte</Button>
        </div>
      </div>
    </motion.div>
  );
}

/* ---------- Description ---------- */
export function Description() {
  const property = useProperty();
  const [expanded, setExpanded] = useState(false);
  const { description } = property;
  return (
    <section>
      <h2 className="font-display font-bold text-xl md:text-2xl mb-4">À propos de ce logement</h2>
      <div className={cn("relative", !expanded && "max-h-44 overflow-hidden")}>
        <p className="text-foreground/85 leading-relaxed">{description.overview}</p>
        {expanded && (
          <>
            <h3 className="font-display font-semibold text-lg mt-6 mb-2">Le quartier</h3>
            <p className="text-foreground/85 leading-relaxed">{description.neighborhood}</p>
            <h3 className="font-display font-semibold text-lg mt-6 mb-2">Règlement intérieur</h3>
            <ul className="space-y-1.5 text-foreground/85">
              {description.rules.map((r) => (
                <li key={r} className="flex gap-2"><span className="text-primary">•</span>{r}</li>
              ))}
            </ul>
          </>
        )}
        {!expanded && (
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        )}
      </div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 font-semibold text-foreground underline underline-offset-4 hover:text-primary inline-flex items-center gap-1"
      >
        {expanded ? "Réduire" : "Lire la suite"}
        <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
      </button>
    </section>
  );
}

/* ---------- Amenities ---------- */
export function Amenities() {
  const property = useProperty();
  const items = property.amenities;
  return (
    <section>
      <h2 className="font-display font-bold text-xl md:text-2xl mb-4">Ce que propose ce logement</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.slice(0, 8).map((a) => {
          const Icon = amenityIcons[a.key] ?? BadgeCheck;
          return (
            <div key={a.key} className="flex items-center gap-3 py-2">
              <Icon className="h-5 w-5 text-primary" />
              <span className="text-foreground/90">{a.label}</span>
            </div>
          );
        })}
      </div>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" className="mt-4 rounded-xl">
            Afficher les {items.length} équipements
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-display">Tous les équipements</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-1 mt-2">
            {items.map((a) => {
              const Icon = amenityIcons[a.key] ?? BadgeCheck;
              return (
                <div key={a.key} className="flex items-center gap-3 py-3 border-b border-border/60 last:border-0">
                  <Icon className="h-5 w-5 text-primary" />
                  <span>{a.label}</span>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ---------- Rooms ---------- */
export function RoomInfo() {
  const property = useProperty();
  return (
    <section>
      <h2 className="font-display font-bold text-xl md:text-2xl mb-4">Chambres disponibles</h2>
      <div className="space-y-3">
        {property.rooms.map((r) => (
          <div
            key={r.type}
            className={cn(
              "rounded-2xl border border-border/60 p-4 md:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-shadow hover:shadow-card",
              !r.available && "opacity-60",
            )}
          >
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-semibold">{r.type}</h3>
                {r.available ? (
                  <Badge className="bg-primary/10 text-primary border-0">Disponible</Badge>
                ) : (
                  <Badge variant="outline">Complet</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {r.capacity} voyageurs · {r.bed}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display font-bold text-lg">
                {r.price.toLocaleString("fr-FR")} <span className="text-xs font-normal text-muted-foreground">FCFA / nuit</span>
              </p>
              <Button size="sm" disabled={!r.available} className="mt-2 gradient-primary text-primary-foreground rounded-xl">
                Sélectionner
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Calendar ---------- */
export function AvailabilityCalendar({
  range, setRange,
}: { range: { from?: Date; to?: Date }; setRange: (r: { from?: Date; to?: Date }) => void }) {
  const property = useProperty();
  const isUnavailable = (d: Date) =>
    property.unavailableDates.includes(d.toISOString().slice(0, 10));
  return (
    <section>
      <h2 className="font-display font-bold text-xl md:text-2xl mb-2">Sélectionnez vos dates</h2>
      <p className="text-muted-foreground text-sm mb-4">
        Les dates grisées sont déjà réservées.
      </p>
      <div className="rounded-3xl border border-border/60 p-3 md:p-5 bg-card shadow-card inline-block">
        <Calendar
          mode="range"
          numberOfMonths={1}
          selected={range as any}
          onSelect={(r: any) => setRange(r ?? {})}
          disabled={(d) => isUnavailable(d) || d < new Date(new Date().setHours(0, 0, 0, 0))}
          className={cn("p-0 pointer-events-auto")}
        />
      </div>
    </section>
  );
}

/* ---------- Booking card ---------- */
export function BookingCard({
  range, setRange,
}: { range: { from?: Date; to?: Date }; setRange: (r: { from?: Date; to?: Date }) => void }) {
  const property = useProperty();
  const isUnavailable = (d: Date) =>
    property.unavailableDates.includes(d.toISOString().slice(0, 10));
  const [guests, setGuests] = useState(2);
  const nights = range.from && range.to ? Math.max(1, differenceInDays(range.to, range.from)) : 0;
  const subtotal = nights * property.price;
  const fee = Math.round(subtotal * 0.1);
  const total = subtotal + fee;

  return (
    <div className="rounded-3xl border border-border/60 shadow-elevated bg-card p-5 md:p-6">
      <div className="flex items-baseline gap-2">
        <span className="font-display font-bold text-2xl">{property.price.toLocaleString("fr-FR")}</span>
        <span className="text-muted-foreground">FCFA / nuit</span>
      </div>
      <div className="mt-1 flex items-center gap-1 text-sm">
        <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
        <span className="font-semibold">{property.rating}</span>
        <span className="text-muted-foreground">· {property.reviews} avis</span>
      </div>

      <div className="mt-5 rounded-2xl border border-border overflow-hidden">
        <div className="grid grid-cols-2">
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-left p-3 border-r border-b border-border hover:bg-muted/40">
                <p className="text-[10px] font-bold uppercase tracking-wider">Arrivée</p>
                <p className="text-sm mt-0.5">{range.from ? format(range.from, "d MMM", { locale: fr }) : "Choisir"}</p>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar mode="range" selected={range as any} onSelect={(r: any) => setRange(r ?? {})}
                disabled={(d) => isUnavailable(d) || d < new Date(new Date().setHours(0,0,0,0))}
                className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-left p-3 border-b border-border hover:bg-muted/40">
                <p className="text-[10px] font-bold uppercase tracking-wider">Départ</p>
                <p className="text-sm mt-0.5">{range.to ? format(range.to, "d MMM", { locale: fr }) : "Choisir"}</p>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar mode="range" selected={range as any} onSelect={(r: any) => setRange(r ?? {})}
                disabled={(d) => isUnavailable(d) || d < new Date(new Date().setHours(0,0,0,0))}
                className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>
        <div className="p-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider">Voyageurs</p>
            <p className="text-sm mt-0.5 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{guests} voyageur{guests > 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={() => setGuests(Math.max(1, guests - 1))}>-</Button>
            <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={() => setGuests(guests + 1)}>+</Button>
          </div>
        </div>
      </div>

      <Button className="w-full mt-4 h-12 gradient-primary text-primary-foreground rounded-xl font-semibold text-base shadow-card">
        Réserver maintenant
      </Button>
      <p className="text-center text-xs text-muted-foreground mt-2">Aucun débit pour le moment</p>

      {nights > 0 && (
        <div className="mt-5 space-y-2.5 text-sm">
          <div className="flex justify-between">
            <span className="underline">{property.price.toLocaleString("fr-FR")} FCFA × {nights} nuit{nights > 1 ? "s" : ""}</span>
            <span>{subtotal.toLocaleString("fr-FR")} FCFA</span>
          </div>
          <div className="flex justify-between">
            <span className="underline">Frais de service StayBF (10%)</span>
            <span>{fee.toLocaleString("fr-FR")} FCFA</span>
          </div>
          <Separator />
          <div className="flex justify-between font-display font-bold text-base">
            <span>Total</span>
            <span>{total.toLocaleString("fr-FR")} FCFA</span>
          </div>
        </div>
      )}

      <div className="mt-5 pt-5 border-t border-border/60">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Paiements acceptés</p>
        <div className="flex flex-wrap gap-2">
          <PayBadge icon={<Smartphone className="h-3.5 w-3.5" />} label="Orange Money" tone="orange" />
          <PayBadge icon={<Smartphone className="h-3.5 w-3.5" />} label="Moov Money" tone="blue" />
          <PayBadge icon={<CreditCard className="h-3.5 w-3.5" />} label="Carte bancaire" tone="neutral" />
        </div>
      </div>
    </div>
  );
}

function PayBadge({ icon, label, tone }: { icon: React.ReactNode; label: string; tone: "orange" | "blue" | "neutral" }) {
  const colors = {
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    neutral: "bg-muted text-foreground border-border",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border", colors[tone])}>
      {icon}{label}
    </span>
  );
}

/* ---------- Reviews ---------- */
export function Reviews() {
  const property = useProperty();
  const [shown, setShown] = useState(3);
  const list = property.reviewsList;
  const breakdown = [
    { label: "Propreté", value: 4.9 },
    { label: "Précision", value: 4.95 },
    { label: "Communication", value: 5.0 },
    { label: "Emplacement", value: 4.8 },
    { label: "Arrivée", value: 4.95 },
    { label: "Rapport qualité-prix", value: 4.85 },
  ];

  return (
    <section>
      <h2 className="font-display font-bold text-xl md:text-2xl mb-5 flex items-center gap-2">
        <Star className="h-6 w-6 fill-secondary text-secondary" />
        {property.rating} · {property.reviews} avis
      </h2>

      <div className="grid sm:grid-cols-2 gap-x-10 gap-y-3 mb-8">
        {breakdown.map((b) => (
          <div key={b.label} className="flex items-center gap-4">
            <span className="text-sm flex-1">{b.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-foreground" style={{ width: `${(b.value / 5) * 100}%` }} />
            </div>
            <span className="text-sm font-semibold w-8 text-right">{b.value}</span>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        {list.slice(0, shown).map((r, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="space-y-2"
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-11 w-11">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">{r.avatar}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.date}</p>
              </div>
            </div>
            <div className="flex">
              {Array.from({ length: 5 }).map((_, j) => (
                <StarIcon key={j} className={cn("h-3.5 w-3.5", j < r.rating ? "fill-secondary text-secondary" : "text-muted")} />
              ))}
            </div>
            <p className="text-sm text-foreground/85 leading-relaxed">{r.comment}</p>
          </motion.div>
        ))}
      </div>

      {shown < list.length && (
        <Button variant="outline" className="mt-6 rounded-xl" onClick={() => setShown((s) => s + 3)}>
          Afficher plus d'avis
        </Button>
      )}
    </section>
  );
}

/* ---------- Map ---------- */
export function LocationMap() {
  const property = useProperty();
  return (
    <section>
      <h2 className="font-display font-bold text-xl md:text-2xl mb-2">Où se situe le logement</h2>
      <p className="text-muted-foreground text-sm mb-4">{property.city}, {property.neighborhood}</p>
      <div className="relative w-full aspect-[16/9] rounded-3xl overflow-hidden border border-border/60 shadow-card">
        <div className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at 30% 20%, #e8f3ec, #f4f8f3 35%, #f0ede5 70%, #ece6d4)" }} />
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          <g stroke="#cdd5c8" strokeWidth="0.4" fill="none" opacity="0.7">
            <path d="M0 30 Q 40 25 60 40 T 100 55" />
            <path d="M0 70 Q 30 60 55 72 T 100 80" />
            <path d="M20 0 Q 25 40 40 60 T 55 100" />
            <path d="M70 0 Q 65 35 80 55 T 75 100" />
          </g>
          <path d="M-5 85 Q 30 75 55 88 T 105 78" stroke="#9ec5db" strokeWidth="1.4" fill="none" opacity="0.6" />
        </svg>

        {/* Property marker */}
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }}
          className="absolute -translate-x-1/2 -translate-y-full z-20"
          style={{ left: `${property.mapX * 100}%`, top: `${property.mapY * 100}%` }}
        >
          <div className="bg-foreground text-background px-3 py-1.5 rounded-full text-xs font-bold shadow-elevated whitespace-nowrap">
            📍 {property.name.split(" ")[0]}
          </div>
        </motion.div>

        {/* Nearby */}
        {property.nearby.slice(0, 4).map((p, i) => {
          const angle = (i / 4) * Math.PI * 2;
          const x = property.mapX + Math.cos(angle) * 0.22;
          const y = property.mapY + Math.sin(angle) * 0.18;
          return (
            <div key={p.name} className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
              <div className="bg-card/95 backdrop-blur px-2 py-1 rounded-full text-[10px] font-medium shadow-card border border-border/60">
                {p.type}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid sm:grid-cols-2 gap-2">
        {property.nearby.map((n) => (
          <div key={n.name} className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-card text-sm">
            <div>
              <p className="font-medium">{n.name}</p>
              <p className="text-xs text-muted-foreground">{n.type}</p>
            </div>
            <span className="text-xs font-semibold text-primary">{n.distance}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Similar ---------- */
export function SimilarProperties() {
  const navigate = useNavigate();
  return (
    <section>
      <h2 className="font-display font-bold text-xl md:text-2xl mb-4">Hébergements similaires</h2>
      <div className="-mx-4 px-4 flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none pb-2">
        {similarProperties.map((p, i) => (
          <motion.article
            key={p.id}
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ delay: i * 0.04 }}
            onClick={() => navigate({ to: "/properties/$id", params: { id: String(p.id) } })}
            className="shrink-0 w-[260px] sm:w-[280px] snap-start rounded-3xl overflow-hidden bg-card border border-border/60 shadow-card hover:shadow-elevated transition-shadow cursor-pointer"
          >
            <div className="aspect-[4/3] overflow-hidden">
              <img src={p.image} alt={p.name} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display font-semibold line-clamp-1">{p.name}</h3>
                <span className="flex items-center gap-1 text-sm shrink-0">
                  <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
                  {p.rating}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{p.location}</p>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-sm">
                  <span className="font-display font-bold">{p.price.toLocaleString("fr-FR")}</span>
                  <span className="text-muted-foreground text-xs"> FCFA</span>
                </p>
                <Button size="sm" variant="outline" className="rounded-lg h-8" onClick={(e) => { e.stopPropagation(); navigate({ to: "/properties/$id", params: { id: String(p.id) } }); }}>Voir</Button>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

/* ---------- Mobile booking bar ---------- */
export function MobileBookingBar() {
  const property = useProperty();
  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border shadow-elevated p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display font-bold text-lg leading-tight">
            {property.price.toLocaleString("fr-FR")}
            <span className="text-xs font-normal text-muted-foreground"> FCFA / nuit</span>
          </p>
          <div className="flex items-center gap-1 text-xs">
            <Star className="h-3 w-3 fill-secondary text-secondary" />
            <span className="font-semibold">{property.rating}</span>
            <span className="text-muted-foreground">· {property.reviews} avis</span>
          </div>
        </div>
        <Button className="h-12 px-6 gradient-primary text-primary-foreground rounded-xl font-semibold shadow-card">
          Réserver
        </Button>
      </div>
    </div>
  );
}
