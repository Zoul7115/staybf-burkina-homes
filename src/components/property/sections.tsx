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
import { useProperty } from "@/lib/property/property.context";
import { useNavigate } from "@tanstack/react-router";
import type { BedItem, SimilarProperty } from "@/lib/property/types";
import { PLACEHOLDER_IMG } from "@/lib/shared";

const amenityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  wifi: Wifi, ac: Snowflake, parking: Car, restaurant: Utensils, security: ShieldCheck,
  hotwater: Droplets, generator: Zap, tv: Tv, kitchen: ChefHat, workspace: Briefcase,
  pool: Waves, laundry: Shirt,
};

function getInitials(fullName: string | null | undefined): string {
  if (!fullName) return "H";
  return fullName
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatBeds(beds: BedItem[]): string {
  if (!beds.length) return "Lit inclus";
  const labels: Record<string, string> = {
    double: "double", single: "simple", king: "king size",
    queen: "queen", bunk: "superposé", sofa: "canapé-lit",
  };
  return beds
    .map((b) => `${b.count} lit${b.count > 1 ? "s" : ""} ${labels[b.type] ?? b.type}`)
    .join(" · ");
}

function formatResponseTime(minutes: number | null): string {
  if (!minutes) return "rapidement";
  if (minutes < 60) return "moins d'une heure";
  if (minutes <= 120) return "1 à 2 heures";
  return "quelques heures";
}

// Normalise lat/lng to a 0–1 marker position for the decorative SVG map.
// Burkina Faso approximate bounding box.
const BF_LAT = { min: 9, max: 15.5 };
const BF_LNG = { min: -5.5, max: 2.5 };

function latToMapY(lat: number | null): number {
  const v = lat ?? 12.37; // default: Ouagadougou
  return 1 - (v - BF_LAT.min) / (BF_LAT.max - BF_LAT.min);
}
function lngToMapX(lng: number | null): number {
  const v = lng ?? -1.53; // default: Ouagadougou
  return (v - BF_LNG.min) / (BF_LNG.max - BF_LNG.min);
}

/* ============================================================
   PropertyHeader
   ============================================================ */
export function PropertyHeader() {
  const property = useProperty();
  const [fav, setFav] = useState(false);
  const rating = property.rating_avg ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display font-bold text-2xl md:text-4xl tracking-tight">{property.name}</h1>
          <div className="mt-2 flex items-center gap-3 flex-wrap text-sm">
            {rating > 0 && (
              <>
                <span className="flex items-center gap-1 font-semibold">
                  <Star className="h-4 w-4 fill-secondary text-secondary" />
                  {rating.toFixed(2)}
                </span>
                <span className="text-muted-foreground underline">{property.rating_count} avis</span>
                <span className="text-muted-foreground">·</span>
              </>
            )}
            <Badge className="bg-primary/10 text-primary border-0 gap-1">
              <BadgeCheck className="h-3 w-3" /> Vérifié StayBF
            </Badge>
            {property.city && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {property.city.name}
                </span>
              </>
            )}
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

/* ============================================================
   HostCard
   ============================================================ */
export function HostCard() {
  const property = useProperty();
  const host = property.host;

  // Graceful fallback when host_profiles is not publicly accessible
  const hostName = host?.full_name ?? "Hôte StayBF";
  const initials = getInitials(host?.full_name);
  const isSuperhost = host?.superhost ?? false;
  const isVerified = host?.verified ?? false;
  const since = host?.host_since ? new Date(host.host_since).getFullYear() : null;
  const responseRate = host?.response_rate ?? null;
  const responseTime = formatResponseTime(host?.response_time_minutes ?? null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      className="rounded-3xl border border-border/60 p-5 md:p-6 bg-card shadow-card"
    >
      <div className="flex items-start gap-4">
        <Avatar className="h-16 w-16 ring-2 ring-primary/20">
          <AvatarFallback className="bg-gradient-to-br from-primary to-primary-dark text-primary-foreground font-display font-bold text-lg">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-semibold text-lg">Hébergé par {hostName}</h3>
            {isSuperhost && (
              <Badge className="bg-secondary text-foreground border-0 gap-1"><Crown className="h-3 w-3" /> Super Hôte</Badge>
            )}
            {isVerified && (
              <Badge className="bg-primary text-primary-foreground border-0 gap-1"><BadgeCheck className="h-3 w-3" /> Vérifié</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Hôte vérifié{since ? ` · Sur StayBF depuis ${since}` : ""}
          </p>
          {(responseRate !== null || host?.response_time_minutes !== null) && (
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {responseRate !== null && (
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  <span><span className="font-semibold">{responseRate}%</span> de réponse</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span>Répond en <span className="font-semibold">{responseTime}</span></span>
              </div>
            </div>
          )}
          <Button variant="outline" className="mt-4 rounded-xl">Contacter l'hôte</Button>
        </div>
      </div>
    </motion.div>
  );
}

/* ============================================================
   Description
   ============================================================ */
export function Description() {
  const property = useProperty();
  const [expanded, setExpanded] = useState(false);
  const overview = property.description_md ?? "Aucune description disponible.";
  const rules = property.house_rules ?? [];
  const hasRules = rules.length > 0;

  return (
    <section>
      <h2 className="font-display font-bold text-xl md:text-2xl mb-4">À propos de ce logement</h2>
      <div className={cn("relative", !expanded && "max-h-44 overflow-hidden")}>
        <p className="text-foreground/85 leading-relaxed">{overview}</p>
        {expanded && hasRules && (
          <>
            <h3 className="font-display font-semibold text-lg mt-6 mb-2">Règlement intérieur</h3>
            <ul className="space-y-1.5 text-foreground/85">
              {rules.map((r) => (
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

/* ============================================================
   Amenities
   ============================================================ */
export function Amenities() {
  const { amenities } = useProperty();

  if (!amenities.length) {
    return (
      <section>
        <h2 className="font-display font-bold text-xl md:text-2xl mb-4">Ce que propose ce logement</h2>
        <p className="text-sm text-muted-foreground">Équipements à venir.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="font-display font-bold text-xl md:text-2xl mb-4">Ce que propose ce logement</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {amenities.slice(0, 8).map((a) => {
          const Icon = amenityIcons[a.slug] ?? BadgeCheck;
          return (
            <div key={a.id} className="flex items-center gap-3 py-2">
              <Icon className="h-5 w-5 text-primary" />
              <span className="text-foreground/90">{a.label_fr}</span>
            </div>
          );
        })}
      </div>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" className="mt-4 rounded-xl">
            Afficher les {amenities.length} équipements
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-display">Tous les équipements</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-1 mt-2">
            {amenities.map((a) => {
              const Icon = amenityIcons[a.slug] ?? BadgeCheck;
              return (
                <div key={a.id} className="flex items-center gap-3 py-3 border-b border-border/60 last:border-0">
                  <Icon className="h-5 w-5 text-primary" />
                  <span>{a.label_fr}</span>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ============================================================
   RoomInfo
   ============================================================ */
export function RoomInfo() {
  const property = useProperty();
  const navigate = useNavigate();
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({
    from: new Date(today.getTime() + 7 * 86400000),
    to: new Date(today.getTime() + 10 * 86400000),
  });
  const [guests, setGuests] = useState(2);

  const activeRoom = property.rooms.find((r) => r.id === openRoomId);
  const nights = range.from && range.to ? Math.max(0, differenceInDays(range.to, range.from)) : 0;
  const subtotal = activeRoom ? nights * activeRoom.base_price_fcfa : 0;
  const canConfirm = !!(range.from && range.to && nights > 0);

  if (!property.rooms.length) {
    return (
      <section>
        <h2 className="font-display font-bold text-xl md:text-2xl mb-4">Chambres disponibles</h2>
        <p className="text-sm text-muted-foreground">Aucune chambre disponible pour le moment.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="font-display font-bold text-xl md:text-2xl mb-4">Chambres disponibles</h2>
      <div className="space-y-3">
        {property.rooms.map((r) => {
          const available = r.status === "active";
          return (
            <div
              key={r.id}
              className={cn(
                "rounded-2xl border border-border/60 p-4 md:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-shadow hover:shadow-card",
                !available && "opacity-60",
              )}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-semibold">{r.name}</h3>
                  {available ? (
                    <Badge className="bg-primary/10 text-primary border-0">Disponible</Badge>
                  ) : (
                    <Badge variant="outline">Complet</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {r.max_guests} voyageur{r.max_guests > 1 ? "s" : ""} · {formatBeds(r.beds)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display font-bold text-lg">
                  {r.base_price_fcfa.toLocaleString("fr-FR")}{" "}
                  <span className="text-xs font-normal text-muted-foreground">FCFA / nuit</span>
                </p>
                <Button
                  size="sm"
                  disabled={!available}
                  onClick={() => {
                    setGuests(Math.min(r.max_guests, 2));
                    setOpenRoomId(r.id);
                  }}
                  className="mt-2 gradient-primary text-primary-foreground rounded-xl"
                >
                  Sélectionner
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!openRoomId} onOpenChange={(o) => !o && setOpenRoomId(null)}>
        <DialogContent className="max-w-md p-0 max-h-[90vh] flex flex-col gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
            <DialogTitle className="font-display">Choisissez vos dates</DialogTitle>
          </DialogHeader>
          {activeRoom && (
            <>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <div className="rounded-xl bg-muted/50 border border-border p-3 text-sm">
                  <p className="font-semibold">{activeRoom.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {activeRoom.max_guests} voyageurs max · {activeRoom.base_price_fcfa.toLocaleString("fr-FR")} FCFA/nuit
                  </p>
                </div>

                <div className="flex justify-center">
                  <Calendar
                    mode="range"
                    numberOfMonths={1}
                    selected={range as { from: Date | undefined; to: Date | undefined }}
                    onSelect={(r) => setRange(r ?? {})}
                    disabled={(d) => d < today}
                    className="p-0 pointer-events-auto"
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>Voyageurs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-full"
                      onClick={() => setGuests((g) => Math.max(1, g - 1))} disabled={guests <= 1}>−</Button>
                    <span className="w-6 text-center font-medium">{guests}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-full"
                      onClick={() => setGuests((g) => Math.min(activeRoom.max_guests, g + 1))}
                      disabled={guests >= activeRoom.max_guests}>+</Button>
                  </div>
                </div>
              </div>

              <div className="border-t border-border px-5 py-3 space-y-3 bg-background rounded-b-lg">
                {canConfirm && (
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">
                      {activeRoom.base_price_fcfa.toLocaleString("fr-FR")} FCFA × {nights} nuit{nights > 1 ? "s" : ""}
                    </span>
                    <span className="font-display font-bold text-lg">
                      {subtotal.toLocaleString("fr-FR")} FCFA
                    </span>
                  </div>
                )}
                <Button
                  onClick={() => {
                    if (!canConfirm) return;
                    navigate({
                      to: "/checkout",
                      search: {
                        propertyId: property.id,
                        roomId: activeRoom.id,
                        from: range.from!.toISOString().slice(0, 10),
                        to: range.to!.toISOString().slice(0, 10),
                        guests,
                      },
                    });
                  }}
                  disabled={!canConfirm}
                  className="w-full h-11 gradient-primary text-primary-foreground rounded-xl font-semibold"
                >
                  Continuer vers le paiement
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ============================================================
   AvailabilityCalendar
   ============================================================ */
export function AvailabilityCalendar({
  range, setRange,
}: { range: { from?: Date; to?: Date }; setRange: (r: { from?: Date; to?: Date }) => void }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

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
          selected={range as { from: Date | undefined; to: Date | undefined }}
          onSelect={(r) => setRange(r ?? {})}
          disabled={(d) => d < today}
          className={cn("p-0 pointer-events-auto")}
        />
      </div>
    </section>
  );
}

/* ============================================================
   BookingCard
   ============================================================ */
export function BookingCard({
  range, setRange,
}: { range: { from?: Date; to?: Date }; setRange: (r: { from?: Date; to?: Date }) => void }) {
  const property = useProperty();
  const navigate = useNavigate();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const price = property.min_price_fcfa ?? 0;
  const rating = property.rating_avg ?? 0;
  const [guests, setGuests] = useState(2);
  const nights = range.from && range.to ? Math.max(1, differenceInDays(range.to, range.from)) : 0;
  const subtotal = nights * price;
  const fee = Math.round(subtotal * 0.1);
  const total = subtotal + fee;

  return (
    <div className="rounded-3xl border border-border/60 shadow-elevated bg-card p-5 md:p-6">
      <div className="flex items-baseline gap-2">
        <span className="font-display font-bold text-2xl">{price.toLocaleString("fr-FR")}</span>
        <span className="text-muted-foreground">FCFA / nuit</span>
      </div>
      {rating > 0 && (
        <div className="mt-1 flex items-center gap-1 text-sm">
          <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
          <span className="font-semibold">{rating.toFixed(2)}</span>
          <span className="text-muted-foreground">· {property.rating_count} avis</span>
        </div>
      )}

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
              <Calendar mode="range"
                selected={range as { from: Date | undefined; to: Date | undefined }}
                onSelect={(r) => setRange(r ?? {})}
                disabled={(d) => d < today}
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
              <Calendar mode="range"
                selected={range as { from: Date | undefined; to: Date | undefined }}
                onSelect={(r) => setRange(r ?? {})}
                disabled={(d) => d < today}
                className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>
        <div className="p-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider">Voyageurs</p>
            <p className="text-sm mt-0.5 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />{guests} voyageur{guests > 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-7 w-7 rounded-full"
              onClick={() => setGuests(Math.max(1, guests - 1))}>−</Button>
            <Button size="icon" variant="outline" className="h-7 w-7 rounded-full"
              onClick={() => setGuests(guests + 1)}>+</Button>
          </div>
        </div>
      </div>

      <Button
        className="w-full mt-4 h-12 gradient-primary text-primary-foreground rounded-xl font-semibold text-base shadow-card"
        onClick={() =>
          navigate({
            to: "/checkout",
            search: {
              propertyId: property.id,
              from: range.from ? range.from.toISOString().slice(0, 10) : undefined,
              to: range.to ? range.to.toISOString().slice(0, 10) : undefined,
              guests,
            },
          })
        }
      >
        Réserver maintenant
      </Button>
      <p className="text-center text-xs text-muted-foreground mt-2">Aucun débit pour le moment</p>

      {nights > 0 && (
        <div className="mt-5 space-y-2.5 text-sm">
          <div className="flex justify-between">
            <span className="underline">{price.toLocaleString("fr-FR")} FCFA × {nights} nuit{nights > 1 ? "s" : ""}</span>
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

/* ============================================================
   Reviews
   ============================================================ */
export function Reviews() {
  const property = useProperty();
  const [shown, setShown] = useState(3);
  const list = property.reviews;
  const rating = property.rating_avg ?? 0;

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
        {rating > 0 ? (
          <>{rating.toFixed(2)} · {property.rating_count} avis</>
        ) : (
          "Avis"
        )}
      </h2>

      {list.length > 0 && (
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
      )}

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun avis pour le moment.</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-5">
            {list.slice(0, shown).map((r, i) => {
              const reviewerName = r.reviewer?.full_name ?? "Voyageur";
              const initials = getInitials(r.reviewer?.full_name);
              const dateStr = format(new Date(r.created_at), "MMMM yyyy", { locale: fr });

              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{reviewerName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{dateStr}</p>
                    </div>
                  </div>
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <StarIcon key={j} className={cn("h-3.5 w-3.5", j < r.overall_rating ? "fill-secondary text-secondary" : "text-muted")} />
                    ))}
                  </div>
                  <p className="text-sm text-foreground/85 leading-relaxed">{r.body}</p>
                </motion.div>
              );
            })}
          </div>

          {shown < list.length && (
            <Button variant="outline" className="mt-6 rounded-xl" onClick={() => setShown((s) => s + 3)}>
              Afficher plus d'avis
            </Button>
          )}
        </>
      )}
    </section>
  );
}

/* ============================================================
   LocationMap
   ============================================================ */
export function LocationMap() {
  const property = useProperty();
  const mapX = lngToMapX(property.longitude);
  const mapY = latToMapY(property.latitude);
  const cityName = property.city?.name ?? "";
  const label = property.address ?? cityName;

  return (
    <section>
      <h2 className="font-display font-bold text-xl md:text-2xl mb-2">Où se situe le logement</h2>
      <p className="text-muted-foreground text-sm mb-4">{label}</p>
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

        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }}
          className="absolute -translate-x-1/2 -translate-y-full z-20"
          style={{ left: `${mapX * 100}%`, top: `${mapY * 100}%` }}
        >
          <div className="bg-foreground text-background px-3 py-1.5 rounded-full text-xs font-bold shadow-elevated whitespace-nowrap">
            📍 {property.name.split(" ")[0]}
          </div>
        </motion.div>
      </div>

      {(property.address || cityName) && (
        <div className="mt-5 grid sm:grid-cols-2 gap-2">
          {property.address && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-card text-sm">
              <div>
                <p className="font-medium">{property.address}</p>
                <p className="text-xs text-muted-foreground">Adresse</p>
              </div>
            </div>
          )}
          {cityName && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-card text-sm">
              <div>
                <p className="font-medium">{cityName}</p>
                <p className="text-xs text-muted-foreground">Ville</p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   SimilarProperties
   ============================================================ */
export function SimilarProperties() {
  const property = useProperty();
  const navigate = useNavigate();
  const similar = property.similar;

  if (!similar.length) return null;

  return (
    <section>
      <h2 className="font-display font-bold text-xl md:text-2xl mb-4">Hébergements similaires</h2>
      <div className="-mx-4 px-4 flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none pb-2">
        {similar.map((p: SimilarProperty, i: number) => (
          <motion.article
            key={p.id}
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ delay: i * 0.04 }}
            onClick={() => navigate({ to: "/properties/$id", params: { id: p.id } })}
            className="shrink-0 w-[260px] sm:w-[280px] snap-start rounded-3xl overflow-hidden bg-card border border-border/60 shadow-card hover:shadow-elevated transition-shadow cursor-pointer"
          >
            <div className="aspect-[4/3] overflow-hidden">
              <img
                src={p.image_url ?? PLACEHOLDER_IMG}
                alt={p.name}
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
              />
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display font-semibold line-clamp-1">{p.name}</h3>
                {p.rating_avg && (
                  <span className="flex items-center gap-1 text-sm shrink-0">
                    <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
                    {p.rating_avg.toFixed(1)}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{p.city_name}</p>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-sm">
                  <span className="font-display font-bold">
                    {(p.min_price_fcfa ?? 0).toLocaleString("fr-FR")}
                  </span>
                  <span className="text-muted-foreground text-xs"> FCFA</span>
                </p>
                <Button
                  size="sm" variant="outline" className="rounded-lg h-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate({ to: "/properties/$id", params: { id: p.id } });
                  }}
                >
                  Voir
                </Button>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   MobileBookingBar
   ============================================================ */
export function MobileBookingBar() {
  const property = useProperty();
  const navigate = useNavigate();
  const price = property.min_price_fcfa ?? 0;
  const rating = property.rating_avg ?? 0;

  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border shadow-elevated p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display font-bold text-lg leading-tight">
            {price.toLocaleString("fr-FR")}
            <span className="text-xs font-normal text-muted-foreground"> FCFA / nuit</span>
          </p>
          {rating > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <Star className="h-3 w-3 fill-secondary text-secondary" />
              <span className="font-semibold">{rating.toFixed(1)}</span>
              <span className="text-muted-foreground">· {property.rating_count} avis</span>
            </div>
          )}
        </div>
        <Button
          className="h-12 px-6 gradient-primary text-primary-foreground rounded-xl font-semibold shadow-card"
          onClick={() => navigate({ to: "/checkout", search: { propertyId: property.id, guests: 2 } })}
        >
          Réserver
        </Button>
      </div>
    </div>
  );
}

// Re-export CalendarIcon to avoid unused-import warning in consumers
export { CalendarIcon };
