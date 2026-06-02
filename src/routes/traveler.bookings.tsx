import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Download, Star, MessageSquare, CalendarCheck } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { TravelerShell } from "@/components/traveler/TravelerShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { upcomingBookings, pastBookings, getBookingProperty, type TravelerBooking } from "@/lib/staybf-traveler-data";

export const Route = createFileRoute("/traveler/bookings")({
  head: () => ({ meta: [{ title: "Mes réservations — StayBF" }] }),
  component: BookingsPage,
});

function BookingsPage() {
  const [review, setReview] = useState<TravelerBooking | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  return (
    <TravelerShell title="Mes réservations">
      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="bg-muted">
          <TabsTrigger value="upcoming">À venir ({upcomingBookings.length})</TabsTrigger>
          <TabsTrigger value="past">Historique ({pastBookings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-6 space-y-4">
          {upcomingBookings.map((b, i) => <BookingRow key={b.id} b={b} idx={i} />)}
          {upcomingBookings.length === 0 && <Empty />}
        </TabsContent>

        <TabsContent value="past" className="mt-6 space-y-4">
          {pastBookings.map((b, i) => (
            <BookingRow key={b.id} b={b} idx={i} onReview={() => { setReview(b); setRating(5); setComment(""); }} />
          ))}
          {pastBookings.length === 0 && <Empty />}
        </TabsContent>
      </Tabs>

      <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Évaluer votre séjour</DialogTitle>
          </DialogHeader>
          {review && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{getBookingProperty(review).name}</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRating(n)} aria-label={`${n} étoiles`}>
                    <Star className={cn("h-7 w-7 transition", n <= rating ? "fill-secondary text-secondary" : "text-muted-foreground/40")} />
                  </button>
                ))}
              </div>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Partagez votre expérience…" rows={4} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>Annuler</Button>
            <Button onClick={() => setReview(null)} className="gradient-primary text-primary-foreground">Publier l'avis</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TravelerShell>
  );
}

function BookingRow({ b, idx, onReview }: { b: TravelerBooking; idx: number; onReview?: () => void }) {
  const p = getBookingProperty(b);
  const past = b.status === "completed";

  const downloadReceipt = () => {
    const text = `STAYBF — REÇU\nRéf : ${b.ref}\n${p.name}\n${format(new Date(b.from), "d MMM yyyy", { locale: fr })} → ${format(new Date(b.to), "d MMM yyyy", { locale: fr })}\nTotal : ${b.total.toLocaleString("fr-FR")} FCFA\nPaiement : ${b.method}`;
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `recu-${b.ref}.txt`; a.click();
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
      className="rounded-2xl bg-card border border-border overflow-hidden shadow-card flex flex-col md:flex-row"
    >
      <Link to="/properties/$id" params={{ id: p.id }} className="md:w-56 shrink-0">
        <img src={p.images[0]} alt={p.name} className="h-44 md:h-full w-full object-cover" />
      </Link>
      <div className="flex-1 p-5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={cn("rounded-full text-[10px] border-0",
            past ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
            {past ? "Terminé" : "Confirmée"}
          </Badge>
          <span className="text-xs font-mono text-muted-foreground">{b.ref}</span>
        </div>
        <h3 className="font-display font-semibold text-lg mt-1.5 truncate">{p.name}</h3>
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" /> {p.city}, {p.neighborhood}
        </p>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><p className="text-[11px] uppercase text-muted-foreground">Arrivée</p><p className="font-medium">{format(new Date(b.from), "d MMM yyyy", { locale: fr })}</p></div>
          <div><p className="text-[11px] uppercase text-muted-foreground">Départ</p><p className="font-medium">{format(new Date(b.to), "d MMM yyyy", { locale: fr })}</p></div>
          <div><p className="text-[11px] uppercase text-muted-foreground">Voyageurs</p><p className="font-medium">{b.guests}</p></div>
          <div><p className="text-[11px] uppercase text-muted-foreground">Total payé</p><p className="font-semibold text-primary">{b.total.toLocaleString("fr-FR")} FCFA</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="rounded-lg">
            <Link to="/properties/$id" params={{ id: p.id }}>Voir l'hébergement</Link>
          </Button>
          <Button size="sm" variant="outline" className="rounded-lg" onClick={downloadReceipt}>
            <Download className="h-4 w-4" /> Reçu
          </Button>
          {!past && (
            <Button asChild size="sm" variant="outline" className="rounded-lg">
              <Link to="/traveler/messages"><MessageSquare className="h-4 w-4" /> Contacter</Link>
            </Button>
          )}
          {past && !b.reviewed && onReview && (
            <Button size="sm" className="rounded-lg gradient-primary text-primary-foreground" onClick={onReview}>
              <Star className="h-4 w-4" /> Laisser un avis
            </Button>
          )}
          {past && b.reviewed && (
            <Badge variant="secondary" className="rounded-full text-[10px]">Avis publié ✓</Badge>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function Empty() {
  return (
    <div className="text-center py-16">
      <div className="mx-auto h-16 w-16 rounded-2xl bg-muted grid place-items-center">
        <CalendarCheck className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="mt-4 font-semibold">Aucune réservation</p>
      <p className="text-sm text-muted-foreground">Explorez nos hébergements et planifiez votre prochain séjour.</p>
      <Button asChild className="mt-4 gradient-primary text-primary-foreground rounded-xl"><Link to="/search">Explorer</Link></Button>
    </div>
  );
}
