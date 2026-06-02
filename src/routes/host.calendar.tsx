import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/host/calendar")({ component: HostCalendarPage });

function HostCalendarPage() {
  const [month, setMonth] = useState(new Date());
  const y = month.getFullYear(); const m = month.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const monthName = month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  // mocked statuses
  const status = (d: number): "free" | "blocked" | "booked" | "premium" => {
    if ([2, 3, 4].includes(d)) return "blocked";
    if ([8, 9, 10, 11].includes(d)) return "booked";
    if ([15, 16, 22, 23, 29, 30].includes(d)) return "premium";
    return "free";
  };

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-lg capitalize">{monthName}</h3>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" onClick={() => setMonth(new Date(y, m - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="icon" variant="outline" onClick={() => setMonth(new Date(y, m + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground mb-2">
          {["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: first }).map((_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const d = i + 1; const s = status(d);
            const colors = {
              free: "bg-background hover:bg-muted border-border",
              blocked: "bg-muted text-muted-foreground line-through border-border",
              booked: "bg-primary text-primary-foreground border-primary",
              premium: "bg-secondary text-secondary-foreground border-secondary",
            };
            return (
              <button key={d} className={cn("aspect-square rounded-lg border text-xs font-semibold transition", colors[s])}>
                {d}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-background border" /> Libre</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary" /> Réservé</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-muted" /> Bloqué</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-secondary" /> Tarif saisonnier</span>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><CalendarIcon className="h-5 w-5 text-primary" /> Actions rapides</h3>
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start">Bloquer une plage</Button>
            <Button variant="outline" className="w-full justify-start">Débloquer une plage</Button>
            <Button variant="outline" className="w-full justify-start">Modifier les prix</Button>
            <Button variant="outline" className="w-full justify-start">Synchroniser iCal</Button>
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h3 className="font-display font-semibold">Tarification saisonnière</h3>
          <div><Label>Du</Label><Input type="date" className="mt-1.5" /></div>
          <div><Label>Au</Label><Input type="date" className="mt-1.5" /></div>
          <div><Label>Prix par nuit (FCFA)</Label><Input type="number" placeholder="85 000" className="mt-1.5" /></div>
          <Button className="w-full gradient-primary text-primary-foreground">Appliquer</Button>
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold mb-3">Vue d'ensemble</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span className="text-muted-foreground">Jours réservés</span><Badge className="bg-primary/10 text-primary border-primary/20">12</Badge></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Jours bloqués</span><Badge variant="outline">3</Badge></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Disponibilité</span><span className="font-semibold">15 nuits</span></li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
