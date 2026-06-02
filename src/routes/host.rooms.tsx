import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Users, BedDouble, ImagePlus } from "lucide-react";
import { hostRooms, fmtFCFA, type HostRoom } from "@/lib/staybf-host-data";
import { StatusBadge } from "@/components/dashboard/widgets";

export const Route = createFileRoute("/host/rooms")({ component: HostRoomsPage });

function HostRoomsPage() {
  const [rooms, setRooms] = useState<HostRoom[]>(hostRooms);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rooms.length} types de chambres</p>
        <RoomDialog
          trigger={<Button className="gradient-primary text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> Nouvelle chambre</Button>}
          onSave={(r) => setRooms((rs) => [...rs, { ...r, id: `rm${Date.now()}` }])}
        />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map((r) => (
          <Card key={r.id} className="overflow-hidden hover:shadow-elevated transition-shadow">
            <div className="aspect-video bg-gradient-to-br from-primary/15 to-secondary/15 grid place-items-center text-muted-foreground">
              <BedDouble className="h-10 w-10" />
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display font-semibold truncate">{r.name}</h3>
                  <p className="text-xs text-muted-foreground">{r.type}</p>
                </div>
                <StatusBadge status={r.status === "draft" ? "pending" : r.status === "suspended" ? "suspended" : "active"} />
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {r.capacity} pers</span>
                <span>·</span>
                <span>{r.available}/{r.total} dispo</span>
              </div>
              <div className="flex items-center justify-between">
                <p className="font-display font-bold text-lg">{fmtFCFA(r.price)}<span className="text-xs font-normal text-muted-foreground">/nuit</span></p>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setRooms((rs) => rs.filter((x) => x.id !== r.id))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function RoomDialog({ trigger, onSave }: { trigger: React.ReactNode; onSave: (r: Omit<HostRoom, "id">) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("Suite");
  const [capacity, setCapacity] = useState(2);
  const [price, setPrice] = useState(50000);
  const [total, setTotal] = useState(1);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nouvelle chambre</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nom</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Suite Junior" className="mt-1.5" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Type</Label><Input value={type} onChange={(e) => setType(e.target.value)} className="mt-1.5" /></div>
            <div><Label>Capacité</Label><Input type="number" value={capacity} onChange={(e) => setCapacity(+e.target.value)} className="mt-1.5" /></div>
            <div><Label>Prix (FCFA)</Label><Input type="number" value={price} onChange={(e) => setPrice(+e.target.value)} className="mt-1.5" /></div>
            <div><Label>Quantité</Label><Input type="number" value={total} onChange={(e) => setTotal(+e.target.value)} className="mt-1.5" /></div>
          </div>
          <Button variant="outline" className="w-full"><ImagePlus className="h-4 w-4 mr-1.5" /> Ajouter photos</Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button className="gradient-primary text-primary-foreground" onClick={() => {
            onSave({ name: name || "Nouvelle chambre", type, capacity, price, available: total, total, status: "draft" });
            setOpen(false);
          }}>Créer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
