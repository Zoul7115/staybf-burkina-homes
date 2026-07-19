import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, BedDouble } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/widgets";
import { useHostRooms, useHostCalendar } from "@/lib/host";
import type { AvailabilityStatus } from "@/lib/host";

export const Route = createFileRoute("/host/calendar")({ component: HostCalendarPage });

// ── Day cell colours ──────────────────────────────────────────

type DayVariant = "free" | "booked" | "blocked" | "checkin" | "checkout" | "price";

const DAY_COLORS: Record<DayVariant, string> = {
  free:     "bg-background hover:bg-muted border-border",
  booked:   "bg-primary text-primary-foreground border-primary",
  blocked:  "bg-muted text-muted-foreground line-through border-border",
  checkin:  "bg-primary/70 text-primary-foreground border-primary/70 ring-1 ring-primary",
  checkout: "bg-primary/40 text-primary-foreground border-primary/40",
  price:    "bg-secondary text-secondary-foreground border-secondary",
};

function dayVariant(
  status: AvailabilityStatus | undefined,
  dateStr: string,
  checkIn: string | null,
  checkOut: string | null,
  priceOverride: number | null
): DayVariant {
  if (!status) return "free";
  if (status === "blocked") return "blocked";
  if (status === "booked") {
    if (checkIn && dateStr === checkIn) return "checkin";
    if (checkOut) {
      // check_out is the departure day (not a booked night), show as checkout
      const dayAfter = new Date(checkOut);
      dayAfter.setDate(dayAfter.getDate() - 1);
      if (dateStr === dayAfter.toISOString().slice(0, 10)) return "checkout";
    }
    return "booked";
  }
  if (priceOverride) return "price";
  return "free";
}

// ── Skeleton ──────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-36" />
          <div className="flex gap-1">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-4 w-full mb-3" />
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      </Card>
      <div className="space-y-4">
        <Card className="p-5">
          <Skeleton className="h-5 w-32 mb-3" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </Card>
        <Card className="p-5 space-y-3">
          <Skeleton className="h-5 w-40 mb-1" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </Card>
        <Card className="p-5">
          <Skeleton className="h-5 w-32 mb-3" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

function HostCalendarPage() {
  const { rooms, loading: roomsLoading } = useHostRooms();

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [month, setMonth] = useState(new Date());

  // Use first room by default once loaded
  const activeRoomId = selectedRoomId ?? rooms[0]?.id ?? null;

  const y = month.getFullYear();
  const m = month.getMonth() + 1; // 1-indexed for hook

  const { data, loading: calLoading, error, blockDates, unblockDates, setPriceOverride, setSeasonalPricing, mutating, mutationError } = useHostCalendar(activeRoomId, y, m);

  const monthName = month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  // Calendar grid layout
  const calendarMonth = month.getMonth();
  const calendarYear = month.getFullYear();
  const firstDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  // Build YYYY-MM-DD for each day in the month
  function isoDay(day: number): string {
    return `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const [activeAction, setActiveAction] = useState<"block" | "unblock" | "price" | null>(null);
  const [actionStart, setActionStart] = useState("");
  const [actionEnd, setActionEnd] = useState("");
  const [actionPrice, setActionPrice] = useState("");
  const [seasonStart, setSeasonStart] = useState("");
  const [seasonEnd, setSeasonEnd] = useState("");
  const [seasonPrice, setSeasonPrice] = useState("");

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  if (roomsLoading) return <CalendarSkeleton />;

  if (rooms.length === 0) {
    return (
      <EmptyState
        icon={BedDouble}
        title="Aucune chambre"
        description="Créez au moins une chambre pour gérer votre calendrier de disponibilité."
      />
    );
  }

  const loading = calLoading;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      {/* Calendar card */}
      <Card className="p-5">
        {/* Room selector + month nav */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-display font-semibold text-lg capitalize">{monthName}</h3>
            {rooms.length > 1 && (
              <Select
                value={activeRoomId ?? ""}
                onValueChange={(v) => setSelectedRoomId(v)}
              >
                <SelectTrigger className="h-7 text-xs w-44">
                  <SelectValue placeholder="Chambre…" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon"
              variant="outline"
              onClick={() => setMonth(new Date(calendarYear, calendarMonth - 1, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setMonth(new Date(calendarYear, calendarMonth + 1, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Room name sub-header */}
        {activeRoom && rooms.length === 1 && (
          <p className="text-xs text-muted-foreground mb-3">{activeRoom.name}</p>
        )}

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground mb-2">
          {["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        {loading ? (
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {/* Padding before first day */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}

            {/* Month days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = isoDay(day);
              const dayData = data?.days[dateStr];

              const variant = dayVariant(
                dayData?.status,
                dateStr,
                dayData?.bookingCheckIn ?? null,
                dayData?.bookingCheckOut ?? null,
                dayData?.priceOverride ?? null
              );

              const isPast = new Date(dateStr) < new Date(new Date().toDateString());

              return (
                <button
                  key={day}
                  title={
                    dayData?.bookingReference
                      ? `Réserv. ${dayData.bookingReference}`
                      : dayData?.status === "blocked"
                      ? "Bloqué"
                      : dayData?.priceOverride
                      ? `${dayData.priceOverride.toLocaleString("fr-FR")} FCFA`
                      : "Disponible"
                  }
                  className={cn(
                    "aspect-square rounded-lg border text-xs font-semibold transition relative",
                    DAY_COLORS[variant],
                    isPast && variant === "free" && "opacity-40"
                  )}
                >
                  {day}
                  {variant === "checkin" && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary-foreground/80 border border-primary" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 mt-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-background border" /> Libre
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-primary" /> Réservé
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-muted" /> Bloqué
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-secondary" /> Tarif personnalisé
          </span>
        </div>

        {error && (
          <p className="text-xs text-destructive mt-3">
            Erreur : {error}
          </p>
        )}
      </Card>

      {/* Sidebar */}
      <div className="space-y-4">
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" /> Actions rapides
          </h3>
          <div className="space-y-2">
            {(["block", "unblock", "price"] as const).map((action) => (
              <Button
                key={action}
                variant={activeAction === action ? "default" : "outline"}
                className="w-full justify-start"
                onClick={() => setActiveAction(activeAction === action ? null : action)}
              >
                {action === "block" && "Bloquer une plage"}
                {action === "unblock" && "Débloquer une plage"}
                {action === "price" && "Modifier les prix"}
              </Button>
            ))}
            <Button variant="outline" className="w-full justify-start" disabled title="Nécessite une intégration externe">
              Synchroniser iCal
            </Button>
          </div>

          {activeAction && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <div><Label>Du</Label><Input type="date" value={actionStart} onChange={(e) => setActionStart(e.target.value)} className="mt-1.5" /></div>
              <div><Label>Au</Label><Input type="date" value={actionEnd} onChange={(e) => setActionEnd(e.target.value)} className="mt-1.5" /></div>
              {activeAction === "price" && (
                <div>
                  <Label>Prix/nuit (FCFA)</Label>
                  <Input type="number" placeholder="85 000" value={actionPrice} onChange={(e) => setActionPrice(e.target.value)} className="mt-1.5" />
                </div>
              )}
              {mutationError && <p className="text-xs text-destructive">{mutationError}</p>}
              <Button
                className="w-full gradient-primary text-primary-foreground"
                disabled={mutating || !actionStart || !actionEnd || (activeAction === "price" && !actionPrice)}
                onClick={async () => {
                  if (activeAction === "block") await blockDates(actionStart, actionEnd);
                  else if (activeAction === "unblock") await unblockDates(actionStart, actionEnd);
                  else if (activeAction === "price") await setPriceOverride(actionStart, actionEnd, Number(actionPrice));
                  setActiveAction(null);
                  setActionStart("");
                  setActionEnd("");
                  setActionPrice("");
                }}
              >
                {mutating ? "En cours…" : "Appliquer"}
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <h3 className="font-display font-semibold">Tarification saisonnière</h3>
          <div><Label>Du</Label><Input type="date" value={seasonStart} onChange={(e) => setSeasonStart(e.target.value)} className="mt-1.5" /></div>
          <div><Label>Au</Label><Input type="date" value={seasonEnd} onChange={(e) => setSeasonEnd(e.target.value)} className="mt-1.5" /></div>
          <div>
            <Label>Prix par nuit (FCFA)</Label>
            <Input type="number" placeholder="85 000" value={seasonPrice} onChange={(e) => setSeasonPrice(e.target.value)} className="mt-1.5" />
          </div>
          {mutationError && <p className="text-xs text-destructive">{mutationError}</p>}
          <Button
            className="w-full gradient-primary text-primary-foreground"
            disabled={mutating || !seasonStart || !seasonEnd || !seasonPrice}
            onClick={async () => {
              await setSeasonalPricing(seasonStart, seasonEnd, Number(seasonPrice));
              setSeasonStart("");
              setSeasonEnd("");
              setSeasonPrice("");
            }}
          >
            {mutating ? "En cours…" : "Appliquer"}
          </Button>
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold mb-3">Vue d'ensemble — {monthName}</h3>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between">
                <span className="text-muted-foreground">Jours réservés</span>
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  {data?.bookedCount ?? "—"}
                </Badge>
              </li>
              <li className="flex justify-between">
                <span className="text-muted-foreground">Jours bloqués</span>
                <Badge variant="outline">{data?.blockedCount ?? "—"}</Badge>
              </li>
              <li className="flex justify-between">
                <span className="text-muted-foreground">Disponibilité</span>
                <span className="font-semibold">
                  {data ? `${data.openCount} nuit${data.openCount !== 1 ? "s" : ""}` : "—"}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted-foreground">Total du mois</span>
                <span className="font-semibold">{daysInMonth} jours</span>
              </li>
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
