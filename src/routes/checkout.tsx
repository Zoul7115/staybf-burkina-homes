import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { differenceInDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Star, MapPin, Users, CalendarDays, Check, ShieldCheck, Lock,
  Headphones, Zap, ChevronLeft, Loader2, CreditCard, Smartphone, AlertCircle,
} from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePropertyDetail } from "@/lib/property/usePropertyDetail";
import { coverImageUrl } from "@/lib/shared";
import { usePricing, useCreateBooking } from "@/lib/booking/hooks";

// ---------------------------------------------------------------------------
// Types & validation
// ---------------------------------------------------------------------------

type CheckoutSearch = {
  propertyId?: string;
  roomId?: string;
  from?: string;
  to?: string;
  guests?: number;
};

export const Route = createFileRoute("/checkout")({
  validateSearch: (s: Record<string, unknown>): CheckoutSearch => ({
    propertyId: typeof s.propertyId === "string" ? s.propertyId : undefined,
    roomId: typeof s.roomId === "string" ? s.roomId : undefined,
    from: typeof s.from === "string" ? s.from : undefined,
    to: typeof s.to === "string" ? s.to : undefined,
    guests: typeof s.guests === "number" ? s.guests : s.guests ? Number(s.guests) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Paiement — StayBF" },
      { name: "description", content: "Finalisez votre réservation en toute sécurité avec Orange Money, Moov Money, Visa ou Mastercard." },
    ],
  }),
  component: CheckoutPage,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type PaymentMethodId = "orange_money" | "moov_money" | "visa" | "mastercard";

const methods: { id: PaymentMethodId; label: string; sub: string; icon: typeof Smartphone; badge?: string; color: string }[] = [
  { id: "orange_money", label: "Orange Money", sub: "Paiement mobile instantané", icon: Smartphone, badge: "Populaire", color: "from-orange-500 to-orange-600" },
  { id: "moov_money", label: "Moov Money", sub: "Paiement mobile sécurisé", icon: Smartphone, color: "from-blue-500 to-blue-700" },
  { id: "visa", label: "Visa", sub: "Carte de crédit / débit", icon: CreditCard, color: "from-indigo-600 to-indigo-800" },
  { id: "mastercard", label: "Mastercard", sub: "Carte de crédit / débit", icon: CreditCard, color: "from-rose-600 to-orange-500" },
];

const countries = ["Burkina Faso", "Côte d'Ivoire", "Mali", "Sénégal", "Ghana", "Togo", "Bénin", "Niger", "France", "Canada", "États-Unis", "Autre"];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function CheckoutPage() {
  const search = useSearch({ from: "/checkout" }) as CheckoutSearch;
  const navigate = useNavigate();
  const { data: property, loading: propertyLoading } = usePropertyDetail(search.propertyId);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const fromDate = search.from ? new Date(search.from) : new Date(today.getTime() + 7 * 86400000);
  const toDate = search.to ? new Date(search.to) : new Date(fromDate.getTime() + 3 * 86400000);
  const guests = search.guests ?? 2;
  const nights = Math.max(1, differenceInDays(toDate, fromDate));

  const checkIn = fromDate.toISOString().slice(0, 10);
  const checkOut = toDate.toISOString().slice(0, 10);

  // Resolve roomId: explicit param or first room from property
  const roomId = search.roomId ?? (property?.rooms?.[0]?.id ?? null);

  const { pricing, loading: pricingLoading } = usePricing(roomId, checkIn, checkOut);
  const createBooking = useCreateBooking();

  const loading = propertyLoading || (!!roomId && pricingLoading);

  const [method, setMethod] = useState<PaymentMethodId>("orange_money");
  const [accept, setAccept] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "+226 ",
    country: "Burkina Faso", note: "",
  });
  const [mobileNumber, setMobileNumber] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);

  const isMobileMoney = method === "orange_money" || method === "moov_money";
  const isCard = method === "visa" || method === "mastercard";

  const paymentFieldsValid = isMobileMoney
    ? mobileNumber.trim().replace(/\s/g, "").length >= 8
    : isCard
      ? cardNumber.replace(/\s/g, "").length >= 16 && cardExp.trim().length >= 4 && cardCvc.trim().length >= 3
      : true;

  const valid =
    !loading &&
    !!roomId &&
    accept &&
    form.firstName.trim() !== "" &&
    form.lastName.trim() !== "" &&
    /\S+@\S+\.\S+/.test(form.email) &&
    form.phone.trim().length > 6 &&
    paymentFieldsValid;

  const handlePay = async () => {
    if (!valid || createBooking.isPending || !roomId) return;
    setBookingError(null);

    try {
      const result = await createBooking.mutateAsync({
        room_id: roomId,
        check_in: checkIn,
        check_out: checkOut,
        guests_adults: guests,
        guests_children: 0,
        guests_infants: 0,
        payment_method: method,
        notes: form.note.trim() || undefined,
      });

      navigate({
        to: "/booking/confirmation",
        search: {
          ref: result.booking.reference,
          propertyId: search.propertyId ?? property?.id ?? "",
          total: result.booking.totalAmount,
          method,
          from: checkIn,
          to: checkOut,
          guests,
          email: form.email,
        },
      });
    } catch (e) {
      setBookingError((e as Error).message);
    }
  };

  const location = property
    ? [property.city?.name, property.address].filter(Boolean).join(", ")
    : "";

  const isProcessing = createBooking.isPending;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar solid />

      {/* Processing overlay */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm grid place-items-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="bg-card border border-border rounded-3xl shadow-elevated p-8 max-w-sm w-[90%] text-center"
            >
              <div className="relative mx-auto h-16 w-16 mb-5">
                <div className="absolute inset-0 rounded-full gradient-primary opacity-20 animate-ping" />
                <div className="relative h-16 w-16 rounded-full gradient-primary grid place-items-center">
                  <Loader2 className="h-7 w-7 text-primary-foreground animate-spin" />
                </div>
              </div>
              <h3 className="font-display font-bold text-xl">Traitement de la réservation…</h3>
              <p className="text-sm text-muted-foreground mt-2">Veuillez patienter, ne fermez pas cette page.</p>
              <div className="mt-5 h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 2.5 }} className="h-full gradient-primary" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="container mx-auto px-4 pt-24 pb-16 max-w-7xl flex-1">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/properties/$id"
            params={{ id: search.propertyId ?? property?.id ?? "" }}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Retour à l'hébergement
          </Link>
          <h1 className="mt-3 font-display font-bold text-3xl md:text-4xl tracking-tight">Finaliser votre réservation</h1>
          <p className="text-muted-foreground mt-2">Vous êtes à quelques étapes de votre séjour.</p>
          <Stepper current={2} />
        </div>

        <div className="grid lg:grid-cols-[1fr_400px] gap-10">
          <div className="space-y-8 min-w-0">
            {/* Property summary */}
            <Section>
              {loading ? (
                <PropertySummarySkeleton />
              ) : property ? (
                <div className="flex gap-4">
                  <img
                    src={coverImageUrl(property.images)}
                    alt={property.name}
                    className="h-24 w-28 md:h-28 md:w-36 rounded-2xl object-cover flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    {location && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" /> {location}
                      </div>
                    )}
                    <h3 className="font-display font-semibold text-lg mt-1 truncate">{property.name}</h3>
                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
                      {property.rating_avg !== null && (
                        <span className="flex items-center gap-1 font-medium">
                          <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
                          {property.rating_avg.toFixed(1)}{" "}
                          <span className="text-muted-foreground font-normal">· {property.rating_count} avis</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" /> {nights} nuit{nights > 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Users className="h-3.5 w-3.5" /> {guests} voyageur{guests > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Badge variant="secondary" className="rounded-full">
                        {format(fromDate, "d MMM", { locale: fr })} → {format(toDate, "d MMM yyyy", { locale: fr })}
                      </Badge>
                      <Badge className="bg-primary/10 text-primary border-0 rounded-full">Vérifié StayBF</Badge>
                    </div>
                  </div>
                </div>
              ) : null}
            </Section>

            {/* Price breakdown */}
            <Section title="Détails du prix">
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : pricing ? (
                <>
                  {/* Show per-night breakdown if pricing varies */}
                  {pricing.nightPricing.some((n) => n.priceSource !== "base") ? (
                    <div className="space-y-1.5 mb-3">
                      {pricing.nightPricing.map((n) => (
                        <div key={n.date} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {format(new Date(n.date), "d MMM", { locale: fr })}
                            {n.priceSource === "seasonal" && (
                              <span className="ml-1 text-[10px] bg-secondary/20 text-secondary-foreground px-1.5 py-0.5 rounded-full">saisonnier</span>
                            )}
                            {n.priceSource === "override" && (
                              <span className="ml-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">prix spécial</span>
                            )}
                          </span>
                          <span className="font-medium">{n.priceFcfa.toLocaleString("fr-FR")} FCFA</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Row
                      label={`${pricing.nightPricing[0]?.priceFcfa.toLocaleString("fr-FR")} FCFA × ${nights} nuit${nights > 1 ? "s" : ""}`}
                      value={`${pricing.accommodationAmount.toLocaleString("fr-FR")} FCFA`}
                    />
                  )}
                  <Row label={`Frais de service StayBF (${Math.round(pricing.serviceFeeRate * 100)}%)`} value={`${pricing.serviceFeeAmount.toLocaleString("fr-FR")} FCFA`} />
                  <Separator className="my-3" />
                  <div className="flex items-baseline justify-between">
                    <span className="font-display font-semibold text-lg">Total à payer</span>
                    <span className="font-display font-bold text-2xl text-primary">{pricing.totalAmount.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Sélectionnez des dates pour voir le prix.</p>
              )}
            </Section>

            {/* Payment methods */}
            <Section title="Mode de paiement" subtitle="Choisissez votre moyen de paiement préféré.">
              <div className="grid sm:grid-cols-2 gap-3">
                {methods.map((m) => {
                  const Icon = m.icon;
                  const selected = method === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className={cn(
                        "relative text-left rounded-2xl border-2 p-4 transition-all bg-card",
                        selected ? "border-primary shadow-card -translate-y-0.5" : "border-border hover:border-primary/40",
                      )}
                    >
                      {m.badge && (
                        <span className="absolute -top-2 right-3 text-[10px] font-bold uppercase tracking-wider bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                          {m.badge}
                        </span>
                      )}
                      <div className="flex items-center gap-3">
                        <span className={cn("h-11 w-11 rounded-xl grid place-items-center text-white bg-gradient-to-br", m.color)}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{m.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{m.sub}</p>
                        </div>
                        <span className={cn("h-5 w-5 rounded-full border-2 grid place-items-center flex-shrink-0", selected ? "border-primary bg-primary" : "border-border")}>
                          {selected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {(method === "orange_money" || method === "moov_money") && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl bg-muted/50 border border-border p-4">
                  <Label htmlFor="mobileNumber" className="text-sm">Numéro {method === "orange_money" ? "Orange Money" : "Moov Money"}</Label>
                  <Input id="mobileNumber" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} placeholder="+226 70 00 00 00" className="mt-2 h-11" />
                  <p className="text-xs text-muted-foreground mt-2">Vous recevrez un code USSD pour confirmer le paiement.</p>
                </motion.div>
              )}

              {(method === "visa" || method === "mastercard") && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl bg-muted/50 border border-border p-4 space-y-3">
                  <div>
                    <Label htmlFor="card" className="text-sm">Numéro de carte</Label>
                    <Input id="card" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="1234 5678 9012 3456" className="mt-2 h-11" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="exp" className="text-sm">Expiration</Label>
                      <Input id="exp" value={cardExp} onChange={(e) => setCardExp(e.target.value)} placeholder="MM / AA" className="mt-2 h-11" />
                    </div>
                    <div>
                      <Label htmlFor="cvc" className="text-sm">CVC</Label>
                      <Input id="cvc" value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} placeholder="123" className="mt-2 h-11" />
                    </div>
                  </div>
                </motion.div>
              )}
            </Section>

            {/* Traveler info */}
            <Section title="Informations du voyageur" subtitle="Ces informations seront utilisées pour confirmer votre réservation.">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Prénom" id="fn">
                  <Input id="fn" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Awa" className="h-11" />
                </Field>
                <Field label="Nom" id="ln">
                  <Input id="ln" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Sankara" className="h-11" />
                </Field>
                <Field label="Email" id="em">
                  <Input id="em" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="vous@email.com" className="h-11" />
                </Field>
                <Field label="Téléphone" id="ph">
                  <Input id="ph" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+226 70 00 00 00" className="h-11" />
                </Field>
                <Field label="Pays" id="co">
                  <select
                    id="co"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {countries.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Demandes spéciales (optionnel)" id="nt" className="sm:col-span-2">
                  <Textarea id="nt" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Arrivée tardive, lit bébé, etc." rows={3} />
                </Field>
              </div>
            </Section>

            {/* Policies */}
            <Section title="Politiques et conditions">
              <div className="space-y-4 text-sm">
                <div className="rounded-xl border border-border p-4">
                  <p className="font-semibold">Politique d'annulation</p>
                  <p className="text-muted-foreground mt-1">Annulation gratuite jusqu'à 48h avant l'arrivée. Au-delà, la première nuit est non remboursable.</p>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <p className="font-semibold">Règles de la maison</p>
                  <ul className="text-muted-foreground mt-1 space-y-1 list-disc pl-5">
                    {(property?.house_rules as string[] | null | undefined)?.length ? (
                      (property!.house_rules as string[]).slice(0, 3).map((r, i) => <li key={i}>{r}</li>)
                    ) : (
                      <>
                        <li>Arrivée à partir de 14h00 — Départ avant 11h00</li>
                        <li>Non-fumeur · Pas d'événement</li>
                        <li>Pièce d'identité obligatoire à l'arrivée</li>
                      </>
                    )}
                  </ul>
                </div>
                <label className="flex items-start gap-3 rounded-xl border border-border p-4 cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={accept} onCheckedChange={(c) => setAccept(c === true)} className="mt-0.5" />
                  <span className="text-sm">
                    J'accepte les <a href="#" className="underline text-primary">conditions générales</a>, la politique d'annulation et la <a href="#" className="underline text-primary">politique de confidentialité</a> de StayBF.
                  </span>
                </label>
              </div>
            </Section>

            {bookingError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{bookingError}</p>
              </div>
            )}

            {/* Trust */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <TrustBadge icon={Lock} label="Paiement sécurisé" />
              <TrustBadge icon={ShieldCheck} label="Données protégées" />
              <TrustBadge icon={Headphones} label="Support 24/7" />
              <TrustBadge icon={Zap} label="Confirmation instantanée" />
            </div>
          </div>

          {/* Sidebar */}
          <aside className="lg:block">
            <div className="lg:sticky lg:top-24 space-y-4">
              <div className="rounded-3xl border border-border/60 shadow-elevated bg-card p-6">
                <h3 className="font-display font-semibold text-lg">Récapitulatif</h3>
                <Separator className="my-4" />
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dates</span>
                      <span className="font-medium text-right">{format(fromDate, "d MMM", { locale: fr })} → {format(toDate, "d MMM", { locale: fr })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Voyageurs</span>
                      <span className="font-medium">{guests}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Chambre ({nights} nuit{nights > 1 ? "s" : ""})</span>
                      <span className="font-medium">{pricing?.accommodationAmount.toLocaleString("fr-FR") ?? "—"} FCFA</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Frais de service</span>
                      <span className="font-medium">{pricing?.serviceFeeAmount.toLocaleString("fr-FR") ?? "—"} FCFA</span>
                    </div>
                  </div>
                )}
                <Separator className="my-4" />
                <div className="flex items-baseline justify-between">
                  <span className="font-display font-semibold">Total</span>
                  <span className="font-display font-bold text-2xl text-primary">
                    {pricing ? `${pricing.totalAmount.toLocaleString("fr-FR")} FCFA` : "—"}
                  </span>
                </div>
                <Button
                  size="lg"
                  disabled={!valid || isProcessing}
                  onClick={handlePay}
                  className="w-full mt-5 h-12 gradient-primary text-primary-foreground rounded-xl font-semibold text-base shadow-card"
                >
                  {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin" /> Traitement…</> : "Réserver maintenant"}
                </Button>
                <p className="text-center text-xs text-muted-foreground mt-3 flex items-center justify-center gap-1.5">
                  <Lock className="h-3 w-3" /> Paiement chiffré SSL 256 bits
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Mobile sticky pay bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border shadow-elevated p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Total à payer</p>
            <p className="font-display font-bold text-lg leading-tight">
              {pricing ? `${pricing.totalAmount.toLocaleString("fr-FR")} FCFA` : "—"}
            </p>
          </div>
          <Button
            disabled={!valid || isProcessing}
            onClick={handlePay}
            className="h-12 px-6 gradient-primary text-primary-foreground rounded-xl font-semibold shadow-card"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Réserver"}
          </Button>
        </div>
      </div>

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PropertySummarySkeleton() {
  return (
    <div className="flex gap-4">
      <Skeleton className="h-24 w-28 md:h-28 md:w-36 rounded-2xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-5 w-32 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = ["Hébergement", "Paiement", "Confirmation"];
  return (
    <div className="mt-6 flex items-center gap-2 md:gap-4 overflow-x-auto no-scrollbar">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <div key={label} className="flex items-center gap-2 md:gap-4 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className={cn(
                "h-7 w-7 rounded-full grid place-items-center text-xs font-bold transition-colors",
                done && "bg-primary text-primary-foreground",
                active && "gradient-primary text-primary-foreground shadow-card",
                !done && !active && "bg-muted text-muted-foreground",
              )}>
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
              </span>
              <span className={cn("text-sm font-medium whitespace-nowrap", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            </div>
            {i < steps.length - 1 && <span className={cn("h-px w-8 md:w-16", done ? "bg-primary" : "bg-border")} />}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="rounded-3xl border border-border/60 bg-card p-5 md:p-6 shadow-card"
    >
      {title && <h2 className="font-display font-semibold text-xl">{title}</h2>}
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      <div className={cn(title && "mt-5")}>{children}</div>
    </motion.section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Field({ label, id, children, className }: { label: string; id: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="text-sm">{label}</Label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function TrustBadge({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-center hover-lift">
      <span className="mx-auto h-10 w-10 rounded-full bg-primary/10 text-primary grid place-items-center mb-2">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}
