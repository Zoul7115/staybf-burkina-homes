import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  CheckCircle2, Download, Calendar, Users, MapPin, Phone, MessageSquare,
  Home, LayoutDashboard, Info, Clock, ShieldCheck, Star, ChevronRight,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getPropertyById, properties, similarProperties } from "@/lib/staybf-property-data";

type S = {
  ref?: string; propertyId?: string; total?: number; method?: string;
  from?: string; to?: string; guests?: number; email?: string;
};

export const Route = createFileRoute("/booking/confirmation")({
  validateSearch: (s: Record<string, unknown>): S => ({
    ref: s.ref as string,
    propertyId: s.propertyId as string,
    total: s.total ? Number(s.total) : undefined,
    method: s.method as string,
    from: s.from as string,
    to: s.to as string,
    guests: s.guests ? Number(s.guests) : undefined,
    email: s.email as string,
  }),
  head: () => ({
    meta: [
      { title: "Réservation confirmée — StayBF" },
      { name: "description", content: "Votre réservation StayBF est confirmée. Préparez votre séjour au Burkina Faso." },
    ],
  }),
  component: ConfirmationPage,
});

const methodLabels: Record<string, string> = {
  orange: "Orange Money", moov: "Moov Money", visa: "Visa", mastercard: "Mastercard",
};

function ConfirmationPage() {
  const s = useSearch({ from: "/booking/confirmation" }) as S;
  const property = (s.propertyId ? getPropertyById(s.propertyId) : undefined) ?? properties[0];
  const ref = s.ref ?? "STBF-2026-45872";
  const fromDate = s.from ? new Date(s.from) : new Date();
  const toDate = s.to ? new Date(s.to) : new Date(Date.now() + 3 * 86400000);
  const nights = Math.max(1, differenceInDays(toDate, fromDate));
  const guests = s.guests ?? 2;
  const total = s.total ?? property.price * nights;

  const downloadReceipt = () => {
    const text = `STAYBF — REÇU DE RÉSERVATION
────────────────────────────
Référence : ${ref}
Hébergement : ${property.name}
Lieu : ${property.city}, ${property.neighborhood}
Hôte : ${property.host.name}
Dates : ${format(fromDate, "d MMM yyyy", { locale: fr })} → ${format(toDate, "d MMM yyyy", { locale: fr })}
Nuits : ${nights}
Voyageurs : ${guests}
Mode de paiement : ${methodLabels[s.method ?? ""] ?? "—"}
Email : ${s.email ?? "—"}
────────────────────────────
TOTAL PAYÉ : ${total.toLocaleString("fr-FR")} FCFA

Statut : Confirmée ✓
Merci pour votre confiance.
StayBF — Ouagadougou, Burkina Faso`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `recu-${ref}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar solid />
      <main className="container mx-auto px-4 pt-24 pb-32 md:pb-16 max-w-5xl flex-1">
        {/* HERO */}
        <motion.section
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.1 }}
            className="relative mx-auto h-24 w-24 mb-6"
          >
            <div className="absolute inset-0 rounded-full bg-primary/15 animate-ping" />
            <div className="relative h-24 w-24 rounded-full gradient-primary grid place-items-center shadow-glow">
              <CheckCircle2 className="h-12 w-12 text-primary-foreground" strokeWidth={2.5} />
            </div>
          </motion.div>
          <h1 className="font-display font-bold text-3xl md:text-4xl">Réservation confirmée 🎉</h1>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
            Votre hébergement est réservé avec succès. Un email récapitulatif a été envoyé à{" "}
            <span className="font-medium text-foreground">{s.email || "votre adresse"}</span>.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2">
            <span className="text-xs text-muted-foreground">Référence</span>
            <span className="font-mono font-semibold tracking-wider">{ref}</span>
          </div>
        </motion.section>

        {/* BOOKING SUMMARY */}
        <motion.section
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="mt-10 rounded-3xl border border-border/60 bg-card shadow-elevated overflow-hidden"
        >
          <div className="flex flex-col sm:flex-row">
            <div className="relative sm:w-64 shrink-0">
              <img src={property.images[0]} alt={property.name} className="h-48 sm:h-full w-full object-cover" />
              <Badge className="absolute top-3 left-3 bg-primary text-primary-foreground border-0 shadow-card">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Confirmée
              </Badge>
            </div>
            <div className="p-6 flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-primary">Votre séjour</p>
              <h2 className="font-display font-semibold text-xl mt-1">{property.name}</h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <MapPin className="h-3.5 w-3.5" /> {property.city}, {property.neighborhood}
              </p>
              <Separator className="my-4" />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Info2 icon={Calendar} label="Arrivée" value={format(fromDate, "EEE d MMM yyyy", { locale: fr })} />
                <Info2 icon={Calendar} label="Départ" value={format(toDate, "EEE d MMM yyyy", { locale: fr })} />
                <Info2 icon={Clock} label="Nuits" value={`${nights} nuit${nights > 1 ? "s" : ""}`} />
                <Info2 icon={Users} label="Voyageurs" value={String(guests)} />
              </div>
            </div>
          </div>
          <div className="border-t border-border bg-muted/30 p-6 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Paiement · {methodLabels[s.method ?? ""] ?? "—"}</p>
              <p className="font-display font-semibold mt-1">Montant payé</p>
            </div>
            <span className="font-display font-bold text-2xl text-primary">{total.toLocaleString("fr-FR")} FCFA</span>
          </div>
        </motion.section>

        {/* HOST */}
        <motion.section
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="mt-8 rounded-3xl border border-border/60 bg-card p-6 shadow-card"
        >
          <h3 className="font-display font-semibold text-lg">Votre hôte</h3>
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="h-16 w-16 rounded-full gradient-primary text-primary-foreground grid place-items-center font-bold text-xl shrink-0">
              {property.host.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold">{property.host.name}</p>
                {property.host.superhost && (
                  <Badge variant="secondary" className="rounded-full text-[10px]">Superhôte</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Hôte depuis {property.host.since}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                <span>Taux de réponse : <span className="font-semibold text-foreground">{property.host.responseRate}%</span></span>
                <span>Réponse : <span className="font-semibold text-foreground">{property.host.responseTime}</span></span>
              </div>
            </div>
            <div className="flex gap-2 sm:flex-col lg:flex-row">
              <Button variant="outline" className="flex-1 rounded-xl">
                <MessageSquare className="h-4 w-4" /> Message
              </Button>
              <Button className="flex-1 rounded-xl gradient-primary text-primary-foreground">
                <Phone className="h-4 w-4" /> Appeler
              </Button>
            </div>
          </div>
        </motion.section>

        {/* ACTIONS */}
        <motion.section
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3"
        >
          <Button onClick={downloadReceipt} size="lg" className="h-12 gradient-primary text-primary-foreground rounded-xl font-semibold">
            <Download className="h-4 w-4" /> Reçu PDF
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 rounded-xl font-semibold">
            <Link to="/traveler/bookings"><LayoutDashboard className="h-4 w-4" /> Ma réservation</Link>
          </Button>
          <Button variant="outline" size="lg" className="h-12 rounded-xl font-semibold">
            <MessageSquare className="h-4 w-4" /> Contacter l'hôte
          </Button>
          <Button asChild variant="ghost" size="lg" className="h-12 rounded-xl">
            <Link to="/"><Home className="h-4 w-4" /> Accueil</Link>
          </Button>
        </motion.section>

        {/* IMPORTANT INFO */}
        <motion.section
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="mt-10"
        >
          <h3 className="font-display font-semibold text-xl">Informations importantes</h3>
          <div className="mt-4 grid md:grid-cols-2 gap-4">
            <InfoCard icon={Clock} title="Horaires d'arrivée" lines={["Check-in : 14h00 — 22h00", "Check-out : avant 11h00"]} />
            <InfoCard icon={Info} title="Instructions d'arrivée" lines={["Présentez-vous à la réception avec une pièce d'identité.", "Le code WiFi vous sera remis à l'arrivée."]} />
            <InfoCard icon={ShieldCheck} title="Règles de la maison" lines={property.description.rules.slice(0, 3)} />
            <InfoCard icon={Info} title="Politique d'annulation" lines={["Annulation gratuite jusqu'à 48h avant l'arrivée.", "Au-delà, première nuit non remboursable."]} />
          </div>
        </motion.section>

        {/* SIMILAR */}
        <motion.section
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="mt-12"
        >
          <div className="flex items-baseline justify-between">
            <h3 className="font-display font-semibold text-xl">Recommandés pour vous</h3>
            <Link to="/search" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              Voir plus <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-4 flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 snap-x snap-mandatory">
            {similarProperties.map((p) => (
              <Link
                key={p.id} to="/properties/$id" params={{ id: p.id }}
                className="snap-start shrink-0 w-64 rounded-2xl border border-border bg-card overflow-hidden hover-lift"
              >
                <img src={p.image} alt={p.name} className="h-36 w-full object-cover" />
                <div className="p-3">
                  <p className="font-semibold text-sm truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.location}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs flex items-center gap-1">
                      <Star className="h-3 w-3 fill-secondary text-secondary" /> {p.rating}
                    </span>
                    <span className="text-sm font-bold">{p.price.toLocaleString("fr-FR")} <span className="text-[10px] font-normal text-muted-foreground">FCFA</span></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.section>
      </main>

      {/* Mobile sticky footer */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-border p-3 shadow-elevated">
        <Button asChild size="lg" className="w-full h-12 gradient-primary text-primary-foreground rounded-xl font-semibold">
          <Link to="/traveler/bookings">Voir mes réservations</Link>
        </Button>
      </div>

      <Footer />
    </div>
  );
}

function Info2({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function InfoCard({ icon: Icon, title, lines }: { icon: React.ComponentType<{ className?: string }>; title: string; lines: string[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary grid place-items-center">
          <Icon className="h-4 w-4" />
        </span>
        <p className="font-semibold">{title}</p>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        {lines.map((l, i) => <li key={i}>• {l}</li>)}
      </ul>
    </div>
  );
}
