import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Check, X, Search, Phone, MessageSquare, Eye, Receipt } from "lucide-react";
import { StatusBadge, EmptyState } from "@/components/dashboard/widgets";
import { useHostBookings } from "@/lib/host";
import { getInitials } from "@/lib/shared";
import type { HostBookingItem, BookingStatus } from "@/lib/host";

export const Route = createFileRoute("/host/reservations")({ component: HostReservationsPage });

// ── Helpers ──────────────────────────────────────────────────

function fmtFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
}

type TabKey = "pending" | "confirmed" | "completed" | "cancelled";

function tabOf(status: BookingStatus): TabKey {
  if (
    status === "pending_payment" ||
    status === "payment_processing" ||
    status === "awaiting_host"
  ) return "pending";
  if (status === "confirmed" || status === "checked_in") return "confirmed";
  if (status === "completed") return "completed";
  return "cancelled";
}

function badgeKey(status: BookingStatus): string {
  switch (status) {
    case "awaiting_host":       return "pending";
    case "pending_payment":     return "pending";
    case "payment_processing":  return "pending";
    case "confirmed":           return "confirmed";
    case "checked_in":          return "active";
    case "completed":           return "completed";
    case "disputed":            return "pending";
    case "no_show":             return "cancelled";
    default:                    return "cancelled";
  }
}

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending_payment:       "Paiement en attente",
  payment_processing:    "Paiement en cours",
  awaiting_host:         "À valider",
  confirmed:             "Confirmée",
  checked_in:            "En cours",
  completed:             "Terminée",
  cancelled_by_traveler: "Annulée (voyageur)",
  cancelled_by_host:     "Annulée (hôte)",
  cancelled_by_system:   "Annulée (système)",
  no_show:               "Non-présentation",
  disputed:              "En litige",
};

const PAYMENT_LABELS: Record<string, string> = {
  orange_money:  "Orange Money",
  moov_money:    "Moov Money",
  visa:          "Visa",
  mastercard:    "Mastercard",
  wallet_credit: "Crédit portefeuille",
};

// ── Timeline ─────────────────────────────────────────────────

function Timeline({ status }: { status: BookingStatus }) {
  const steps = ["Demande", "Acceptée", "Paiement", "Séjour", "Terminé"];
  const idx =
    status === "pending_payment" || status === "payment_processing" ? 0
    : status === "awaiting_host" ? 1
    : status === "confirmed" ? 2
    : status === "checked_in" ? 3
    : status === "completed" ? 4
    : -1;

  return (
    <ol className="flex items-center gap-1 my-2">
      {steps.map((s, i) => (
        <li key={s} className="flex-1 flex flex-col items-center text-center gap-1">
          <div className={`h-2 w-full rounded-full ${i <= idx ? "bg-primary" : "bg-muted"}`} />
          <span className="text-[10px] text-muted-foreground">{s}</span>
        </li>
      ))}
    </ol>
  );
}

// ── Detail dialog ─────────────────────────────────────────────

function BookingDialog({ booking: r }: { booking: HostBookingItem }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost"><Eye className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{r.reference} — {r.traveler_name ?? "Voyageur"}</DialogTitle>
        </DialogHeader>
        <Timeline status={r.status} />
        <div className="grid grid-cols-2 gap-3 text-sm">
          {r.property_name && (
            <div className="col-span-2">
              <p className="text-muted-foreground text-xs">Hébergement</p>
              <p className="font-medium">{r.property_name}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs">Chambre</p>
            <p className="font-medium">{r.room_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Statut</p>
            <p className="font-medium">{STATUS_LABELS[r.status]}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Arrivée</p>
            <p className="font-medium">{fmtDate(r.check_in)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Départ</p>
            <p className="font-medium">{fmtDate(r.check_out)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Nuits</p>
            <p className="font-medium">{r.nights}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Invités</p>
            <p className="font-medium">
              {r.guests_adults} adulte{r.guests_adults > 1 ? "s" : ""}
              {r.guests_children > 0 && ` · ${r.guests_children} enfant${r.guests_children > 1 ? "s" : ""}`}
              {r.guests_infants > 0 && ` · ${r.guests_infants} bébé${r.guests_infants > 1 ? "s" : ""}`}
            </p>
          </div>
          {r.payment_method && (
            <div>
              <p className="text-muted-foreground text-xs">Mode de paiement</p>
              <p className="font-medium">{PAYMENT_LABELS[r.payment_method] ?? r.payment_method}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs">Créée le</p>
            <p className="font-medium">{fmtDateLong(r.created_at)}</p>
          </div>
          <div className="col-span-2">
            <p className="text-muted-foreground text-xs">Total</p>
            <p className="font-display font-bold text-lg">{fmtFCFA(r.total_amount)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1"><Phone className="h-4 w-4 mr-1.5" /> Appeler</Button>
          <Button variant="outline" className="flex-1"><MessageSquare className="h-4 w-4 mr-1.5" /> Message</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── List ──────────────────────────────────────────────────────

function ReservationList({ items }: { items: HostBookingItem[] }) {
  if (items.length === 0) {
    return (
      <Card className="p-10 text-center text-muted-foreground text-sm">
        Aucune réservation dans cette catégorie.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((r) => {
        const isAwaitingHost = r.status === "awaiting_host";
        const totalGuests = r.guests_adults + r.guests_children;

        return (
          <Card key={r.id} className="p-4 hover:shadow-card transition">
            <div className="flex items-start gap-4 flex-col sm:flex-row">
              <div className="h-12 w-12 rounded-full gradient-primary text-primary-foreground grid place-items-center font-bold text-sm shrink-0">
                {getInitials(r.traveler_name)}
              </div>

              <div className="flex-1 min-w-0 grid sm:grid-cols-4 gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{r.traveler_name ?? "Voyageur"}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.reference}</p>
                  {r.property_name && (
                    <p className="text-xs text-muted-foreground truncate">{r.property_name}</p>
                  )}
                </div>

                <div className="text-xs">
                  <p className="text-muted-foreground">Chambre</p>
                  <p className="font-medium truncate">{r.room_name ?? "—"}</p>
                </div>

                <div className="text-xs">
                  <p className="text-muted-foreground">Dates</p>
                  <p className="font-medium">
                    {fmtDate(r.check_in)} → {fmtDate(r.check_out)}
                  </p>
                  <p className="text-muted-foreground">
                    {r.nights} nuit{r.nights > 1 ? "s" : ""} · {totalGuests} pers
                  </p>
                </div>

                <div className="text-xs">
                  <p className="text-muted-foreground">Total</p>
                  <p className="font-display font-bold">{fmtFCFA(r.total_amount)}</p>
                  <StatusBadge status={badgeKey(r.status)} />
                  {r.payment_method && (
                    <p className="text-muted-foreground mt-1">
                      {PAYMENT_LABELS[r.payment_method] ?? r.payment_method}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {isAwaitingHost && (
                  <>
                    <Button
                      size="sm"
                      className="gradient-primary text-primary-foreground"
                      disabled
                      title="Requiert une Edge Function — à venir"
                    >
                      <Check className="h-4 w-4 mr-1" /> Accepter
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      title="Requiert une Edge Function — à venir"
                    >
                      <X className="h-4 w-4 mr-1" /> Refuser
                    </Button>
                  </>
                )}
                <BookingDialog booking={r} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────

function ReservationsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-md" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start gap-4">
              <Skeleton className="h-12 w-12 rounded-full shrink-0" />
              <div className="flex-1 grid sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

function HostReservationsPage() {
  const { bookings, loading, error } = useHostBookings();
  const [q, setQ] = useState("");

  const byTab = useMemo<Record<TabKey, HostBookingItem[]>>(() => {
    const pending: HostBookingItem[] = [];
    const confirmed: HostBookingItem[] = [];
    const completed: HostBookingItem[] = [];
    const cancelled: HostBookingItem[] = [];

    for (const b of bookings) {
      if (q) {
        const lq = q.toLowerCase();
        const matches =
          b.traveler_name?.toLowerCase().includes(lq) ||
          b.reference.toLowerCase().includes(lq) ||
          b.room_name?.toLowerCase().includes(lq) ||
          b.property_name?.toLowerCase().includes(lq);
        if (!matches) continue;
      }

      switch (tabOf(b.status)) {
        case "pending":   pending.push(b);   break;
        case "confirmed": confirmed.push(b); break;
        case "completed": completed.push(b); break;
        default:          cancelled.push(b); break;
      }
    }

    return { pending, confirmed, completed, cancelled };
  }, [bookings, q]);

  if (loading) return <ReservationsSkeleton />;

  if (error) {
    return (
      <Card className="p-10 text-center text-muted-foreground text-sm">
        Erreur lors du chargement des réservations : {error}
      </Card>
    );
  }

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Aucune réservation"
        description="Vous n'avez pas encore reçu de réservation. Elles apparaîtront ici dès que des voyageurs réserveront vos chambres."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher par voyageur, référence ou chambre..."
            className="pl-9"
          />
        </div>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="pending">
            En attente{byTab.pending.length > 0 ? ` (${byTab.pending.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="confirmed">
            Confirmées{byTab.confirmed.length > 0 ? ` (${byTab.confirmed.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="completed">
            Terminées{byTab.completed.length > 0 ? ` (${byTab.completed.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            Annulées{byTab.cancelled.length > 0 ? ` (${byTab.cancelled.length})` : ""}
          </TabsTrigger>
        </TabsList>

        {(["pending", "confirmed", "completed", "cancelled"] as const).map((tab) => (
          <TabsContent key={tab} value={tab}>
            <ReservationList items={byTab[tab]} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
