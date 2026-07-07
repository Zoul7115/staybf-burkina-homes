import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Download, Star, MessageSquare, CalendarCheck } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TravelerShell } from "@/components/traveler/TravelerShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useBookings, type SupabaseBooking, type BookingStatus, UPCOMING_STATUSES } from "@/lib/bookings/useBookings";
import { callEdgeFunction } from "@/lib/storage";
import { coverImageUrl } from "@/lib/shared";
import { queryKeys } from "@/lib/query/keys";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/traveler/bookings")({
  head: () => ({ meta: [{ title: "Mes réservations — StayBF" }] }),
  component: BookingsPage,
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function BookingsPage() {
  const { upcoming, past, loading } = useBookings();
  const queryClient = useQueryClient();
  const [review, setReview] = useState<SupabaseBooking | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const reviewMutation = useMutation({
    mutationFn: async ({ bookingId, overallRating, body }: { bookingId: string; overallRating: number; body: string }) =>
      callEdgeFunction("create-review", { booking_id: bookingId, overall_rating: overallRating, body }),
    onSuccess: () => {
      setReview(null);
      setComment("");
      setRating(5);
      queryClient.invalidateQueries({ queryKey: queryKeys.travelerBookings() });
      queryClient.invalidateQueries({ queryKey: queryKeys.travelerNotifications() });
      queryClient.invalidateQueries({ queryKey: queryKeys.travelerStats() });
    },
  });

  return (
    <TravelerShell title="Mes réservations">
      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="bg-muted">
          <TabsTrigger value="upcoming">
            À venir {!loading && `(${upcoming.length})`}
          </TabsTrigger>
          <TabsTrigger value="past">
            Historique {!loading && `(${past.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-6 space-y-4">
          {loading
            ? <BookingSkeletons />
            : upcoming.length > 0
              ? upcoming.map((b, i) => <BookingRow key={b.id} b={b} idx={i} />)
              : <Empty />}
        </TabsContent>

        <TabsContent value="past" className="mt-6 space-y-4">
          {loading
            ? <BookingSkeletons />
            : past.length > 0
              ? past.map((b, i) => (
                  <BookingRow
                    key={b.id}
                    b={b}
                    idx={i}
                    onReview={() => { setReview(b); setRating(5); setComment(""); }}
                  />
                ))
              : <Empty />}
        </TabsContent>
      </Tabs>

      <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Évaluer votre séjour</DialogTitle>
          </DialogHeader>
          {review && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{review.properties.name}</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRating(n)} aria-label={`${n} étoiles`}>
                    <Star className={cn("h-7 w-7 transition", n <= rating ? "fill-secondary text-secondary" : "text-muted-foreground/40")} />
                  </button>
                ))}
              </div>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Partagez votre expérience…"
                rows={4}
              />
            </div>
          )}
          <DialogFooter className="flex-col items-stretch gap-2">
            {reviewMutation.isError && (
              <p className="text-xs text-destructive text-center">{(reviewMutation.error as Error)?.message}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setReview(null); reviewMutation.reset(); }}>Annuler</Button>
              <Button
                disabled={reviewMutation.isPending || !comment.trim()}
                className="gradient-primary text-primary-foreground"
                onClick={() => {
                  if (!review) return;
                  reviewMutation.mutate({ bookingId: review.id, overallRating: rating, body: comment.trim() });
                }}
              >
                {reviewMutation.isPending ? "Publication…" : "Publier l'avis"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TravelerShell>
  );
}

// ---------------------------------------------------------------------------
// BookingRow
// ---------------------------------------------------------------------------

const STATUS_LABELS: Partial<Record<BookingStatus, string>> = {
  pending_payment:      "En attente de paiement",
  confirmed:            "Confirmée",
  checked_in:           "En cours",
  completed:            "Terminée",
  cancelled_by_traveler: "Annulée",
  cancelled_by_host:    "Annulée par l'hôte",
  cancelled_by_system:  "Annulée",
  no_show:              "Non présenté",
  disputed:             "Litige en cours",
};

function BookingRow({
  b,
  idx,
  onReview,
}: {
  b: SupabaseBooking;
  idx: number;
  onReview?: () => void;
}) {
  const isPast = !UPCOMING_STATUSES.includes(b.status);
  const label = STATUS_LABELS[b.status] ?? b.status;

  const downloadReceipt = () => {
    const text = [
      "STAYBF — REÇU",
      `Réf : ${b.reference}`,
      b.properties.name,
      `${format(new Date(b.check_in), "d MMM yyyy", { locale: fr })} → ${format(new Date(b.check_out), "d MMM yyyy", { locale: fr })}`,
      `Total : ${b.total_amount.toLocaleString("fr-FR")} FCFA`,
    ].join("\n");

    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `recu-${b.reference}.txt`;
    a.click();
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05 }}
      className="rounded-2xl bg-card border border-border overflow-hidden shadow-card flex flex-col md:flex-row"
    >
      <Link to="/properties/$id" params={{ id: b.properties.id }} className="md:w-56 shrink-0">
        <img
          src={coverImageUrl(b.properties.property_images ?? [])}
          alt={b.properties.name}
          className="h-44 md:h-full w-full object-cover"
        />
      </Link>

      <div className="flex-1 p-5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={cn(
            "rounded-full text-[10px] border-0",
            isPast ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
          )}>
            {label}
          </Badge>
          <span className="text-xs font-mono text-muted-foreground">{b.reference}</span>
        </div>

        <h3 className="font-display font-semibold text-lg mt-1.5 truncate">
          {b.properties.name}
        </h3>
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" /> {b.properties.address}
        </p>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Arrivée</p>
            <p className="font-medium">{format(new Date(b.check_in), "d MMM yyyy", { locale: fr })}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Départ</p>
            <p className="font-medium">{format(new Date(b.check_out), "d MMM yyyy", { locale: fr })}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Voyageurs</p>
            <p className="font-medium">{b.guests_adults}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-muted-foreground">Total payé</p>
            <p className="font-semibold text-primary">{b.total_amount.toLocaleString("fr-FR")} FCFA</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="rounded-lg">
            <Link to="/properties/$id" params={{ id: b.properties.id }}>Voir l'hébergement</Link>
          </Button>
          <Button size="sm" variant="outline" className="rounded-lg" onClick={downloadReceipt}>
            <Download className="h-4 w-4" /> Reçu
          </Button>
          {!isPast && (
            <Button asChild size="sm" variant="outline" className="rounded-lg">
              <Link to="/traveler/messages">
                <MessageSquare className="h-4 w-4" /> Contacter
              </Link>
            </Button>
          )}
          {isPast && onReview && (
            <Button
              size="sm"
              className="rounded-lg gradient-primary text-primary-foreground"
              onClick={onReview}
            >
              <Star className="h-4 w-4" /> Laisser un avis
            </Button>
          )}
        </div>
      </div>
    </motion.article>
  );
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

function BookingSkeletons() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl bg-card border border-border overflow-hidden flex flex-col md:flex-row">
          <Skeleton className="h-44 md:h-auto md:w-56 shrink-0" />
          <div className="flex-1 p-5 space-y-3">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-28" />
            </div>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="grid grid-cols-4 gap-3 mt-2">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="space-y-1">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function Empty() {
  return (
    <div className="text-center py-16">
      <div className="mx-auto h-16 w-16 rounded-2xl bg-muted grid place-items-center">
        <CalendarCheck className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="mt-4 font-semibold">Aucune réservation</p>
      <p className="text-sm text-muted-foreground">
        Explorez nos hébergements et planifiez votre prochain séjour.
      </p>
      <Button asChild className="mt-4 gradient-primary text-primary-foreground rounded-xl">
        <Link to="/search">Explorer</Link>
      </Button>
    </div>
  );
}
