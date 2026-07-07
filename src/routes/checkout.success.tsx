import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { CheckCircle2, Download, Calendar, Users, MapPin, Mail, Home, Search } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { usePropertyDetail } from "@/lib/property/usePropertyDetail";
import { coverImageUrl, PLACEHOLDER_IMG } from "@/lib/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SuccessSearch = {
  ref?: string;
  propertyId?: string;
  total?: number;
  method?: string;
  from?: string;
  to?: string;
  guests?: number;
  email?: string;
};

export const Route = createFileRoute("/checkout/success")({
  validateSearch: (s: Record<string, unknown>): SuccessSearch => ({
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
      { name: "description", content: "Votre réservation StayBF a été confirmée avec succès." },
    ],
  }),
  component: SuccessPage,
});

const methodLabels: Record<string, string> = {
  orange_money: "Orange Money", moov_money: "Moov Money", visa: "Visa", mastercard: "Mastercard",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function SuccessPage() {
  const s = useSearch({ from: "/checkout/success" }) as SuccessSearch;
  const { data: property, loading } = usePropertyDetail(s.propertyId);

  const ref = s.ref ?? "STBF-XXXXXX";
  const fromDate = s.from ? new Date(s.from) : new Date();
  const toDate = s.to ? new Date(s.to) : new Date();

  const location = property
    ? [property.city?.name, property.address].filter(Boolean).join(", ")
    : "";

  const downloadReceipt = () => {
    const text = `STAYBF — REÇU DE RÉSERVATION
────────────────────────────
Référence : ${ref}
Hébergement : ${property?.name ?? ""}
${location ? `Lieu : ${location}` : ""}
Dates : ${format(fromDate, "d MMM yyyy", { locale: fr })} → ${format(toDate, "d MMM yyyy", { locale: fr })}
Voyageurs : ${s.guests ?? 2}
Mode de paiement : ${methodLabels[s.method ?? ""] ?? "—"}
Email : ${s.email ?? "—"}
────────────────────────────
TOTAL PAYÉ : ${(s.total ?? 0).toLocaleString("fr-FR")} FCFA

Merci pour votre confiance.
StayBF — Ouagadougou, Burkina Faso
`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `recu-${ref}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar solid />
      <main className="container mx-auto px-4 pt-24 pb-16 max-w-3xl flex-1">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
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
          <h1 className="font-display font-bold text-3xl md:text-4xl">Paiement réussi 🎉</h1>
          <p className="mt-3 text-muted-foreground">
            Votre réservation a été confirmée. Un email récapitulatif a été envoyé à{" "}
            <span className="font-medium text-foreground">{s.email || "votre adresse"}</span>.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2">
            <span className="text-xs text-muted-foreground">Référence</span>
            <span className="font-mono font-semibold tracking-wider">{ref}</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="mt-10 rounded-3xl border border-border/60 bg-card shadow-elevated overflow-hidden"
        >
          {loading ? (
            <PropertyCardSkeleton />
          ) : (
            <div className="flex flex-col sm:flex-row">
              <img
                src={property ? coverImageUrl(property.images) : PLACEHOLDER_IMG}
                alt={property?.name ?? ""}
                className="h-48 sm:h-auto sm:w-56 object-cover"
              />
              <div className="p-6 flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-primary">Réservation confirmée</p>
                <h2 className="font-display font-semibold text-xl mt-1">{property?.name ?? "—"}</h2>
                {location && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5" /> {location}
                  </p>
                )}
                <Separator className="my-4" />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <InfoItem icon={Calendar} label="Arrivée" value={format(fromDate, "d MMM yyyy", { locale: fr })} />
                  <InfoItem icon={Calendar} label="Départ" value={format(toDate, "d MMM yyyy", { locale: fr })} />
                  <InfoItem icon={Users} label="Voyageurs" value={String(s.guests ?? 2)} />
                  <InfoItem icon={Mail} label="Paiement" value={methodLabels[s.method ?? ""] ?? "—"} />
                </div>
              </div>
            </div>
          )}
          <div className="border-t border-border bg-muted/30 p-6 flex items-baseline justify-between">
            <span className="font-display font-semibold">Total payé</span>
            <span className="font-display font-bold text-2xl text-primary">{(s.total ?? 0).toLocaleString("fr-FR")} FCFA</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
          className="mt-6 flex flex-col sm:flex-row gap-3"
        >
          <Button onClick={downloadReceipt} size="lg" className="flex-1 h-12 gradient-primary text-primary-foreground rounded-xl font-semibold">
            <Download className="h-4 w-4" /> Télécharger le reçu
          </Button>
          <Button asChild variant="outline" size="lg" className="flex-1 h-12 rounded-xl font-semibold">
            <Link to="/search"><Search className="h-4 w-4" /> Explorer d'autres séjours</Link>
          </Button>
          <Button asChild variant="ghost" size="lg" className="h-12 rounded-xl">
            <Link to="/"><Home className="h-4 w-4" /> Accueil</Link>
          </Button>
        </motion.div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Besoin d'aide ? Contactez notre support 24/7 — support@staybf.bf
        </p>
      </main>
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PropertyCardSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row">
      <Skeleton className="h-48 sm:h-auto sm:w-56 shrink-0" />
      <div className="p-6 flex-1 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <div className="grid grid-cols-2 gap-4 pt-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
