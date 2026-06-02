import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Check, X, Search, Phone, MessageSquare, Eye } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/widgets";
import { hostReservations, fmtFCFA, type HostReservation } from "@/lib/staybf-host-data";

export const Route = createFileRoute("/host/reservations")({ component: HostReservationsPage });

function HostReservationsPage() {
  const [items, setItems] = useState(hostReservations);
  const [q, setQ] = useState("");

  const filtered = (status: HostReservation["status"] | "all") =>
    items.filter((r) => (status === "all" || r.status === status) &&
      (r.guest.toLowerCase().includes(q.toLowerCase()) || r.ref.toLowerCase().includes(q.toLowerCase())));

  const updateStatus = (id: string, status: HostReservation["status"]) =>
    setItems((arr) => arr.map((r) => r.id === id ? { ...r, status } : r));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par invité ou référence..." className="pl-9" />
        </div>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="pending">En attente ({filtered("pending").length})</TabsTrigger>
          <TabsTrigger value="confirmed">Confirmées ({filtered("confirmed").length})</TabsTrigger>
          <TabsTrigger value="completed">Terminées ({filtered("completed").length})</TabsTrigger>
          <TabsTrigger value="cancelled">Annulées ({filtered("cancelled").length})</TabsTrigger>
        </TabsList>

        {(["pending", "confirmed", "completed", "cancelled"] as const).map((s) => (
          <TabsContent key={s} value={s}>
            <ReservationList items={filtered(s)} onAccept={(id) => updateStatus(id, "confirmed")} onReject={(id) => updateStatus(id, "cancelled")} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ReservationList({ items, onAccept, onReject }: { items: HostReservation[]; onAccept: (id: string) => void; onReject: (id: string) => void }) {
  if (items.length === 0)
    return <Card className="p-10 text-center text-muted-foreground text-sm">Aucune réservation dans cette catégorie.</Card>;
  return (
    <div className="space-y-3">
      {items.map((r) => (
        <Card key={r.id} className="p-4 hover:shadow-card transition">
          <div className="flex items-start gap-4 flex-col sm:flex-row">
            <div className="h-12 w-12 rounded-full gradient-primary text-primary-foreground grid place-items-center font-bold shrink-0">{r.avatar}</div>
            <div className="flex-1 min-w-0 grid sm:grid-cols-4 gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{r.guest}</p>
                <p className="text-xs text-muted-foreground truncate">{r.ref}</p>
              </div>
              <div className="text-xs"><p className="text-muted-foreground">Chambre</p><p className="font-medium truncate">{r.room}</p></div>
              <div className="text-xs"><p className="text-muted-foreground">Dates</p><p className="font-medium">{r.from} → {r.to}</p><p className="text-muted-foreground">{r.nights} nuits · {r.guests} pers</p></div>
              <div className="text-xs"><p className="text-muted-foreground">Total</p><p className="font-display font-bold">{fmtFCFA(r.total)}</p><StatusBadge status={r.status} /></div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {r.status === "pending" && (
                <>
                  <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => onAccept(r.id)}><Check className="h-4 w-4 mr-1" /> Accepter</Button>
                  <Button size="sm" variant="outline" onClick={() => onReject(r.id)}><X className="h-4 w-4 mr-1" /> Refuser</Button>
                </>
              )}
              <Dialog>
                <DialogTrigger asChild><Button size="icon" variant="ghost"><Eye className="h-4 w-4" /></Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{r.ref} — {r.guest}</DialogTitle></DialogHeader>
                  <Timeline status={r.status} />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-muted-foreground text-xs">Chambre</p><p className="font-medium">{r.room}</p></div>
                    <div><p className="text-muted-foreground text-xs">Invités</p><p className="font-medium">{r.guests}</p></div>
                    <div><p className="text-muted-foreground text-xs">Arrivée</p><p className="font-medium">{r.from}</p></div>
                    <div><p className="text-muted-foreground text-xs">Départ</p><p className="font-medium">{r.to}</p></div>
                    <div className="col-span-2"><p className="text-muted-foreground text-xs">Total</p><p className="font-display font-bold text-lg">{fmtFCFA(r.total)}</p></div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1"><Phone className="h-4 w-4 mr-1.5" /> Appeler</Button>
                    <Button variant="outline" className="flex-1"><MessageSquare className="h-4 w-4 mr-1.5" /> Message</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Timeline({ status }: { status: HostReservation["status"] }) {
  const steps = ["Demande reçue", "Acceptée", "Paiement reçu", "Séjour", "Terminé"];
  const idx = status === "pending" ? 0 : status === "cancelled" ? -1 : status === "confirmed" ? 2 : 4;
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
