import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, MapPin, Users, Search, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cities } from "@/lib/staybf-data";
import { cn } from "@/lib/utils";

export function SearchCard() {
  const [checkIn, setCheckIn] = useState<Date>();
  const [checkOut, setCheckOut] = useState<Date>();
  const [guests, setGuests] = useState(2);

  return (
    <div className="mx-auto w-full max-w-5xl bg-card rounded-3xl shadow-elevated border border-border/60 p-2 sm:p-3">
      <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr_1fr_auto] gap-2">
        {/* City */}
        <Field label="Destination" icon={<MapPin className="h-4 w-4 text-primary" />}>
          <Select>
            <SelectTrigger className="border-0 shadow-none h-auto p-0 font-medium text-foreground focus:ring-0 [&>svg]:hidden">
              <SelectValue placeholder="Choisir une ville" />
            </SelectTrigger>
            <SelectContent>
              {cities.map((c) => (
                <SelectItem key={c.name} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Check-in */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="text-left">
              <Field label="Arrivée" icon={<CalendarIcon className="h-4 w-4 text-primary" />}>
                <span className={cn("text-sm font-medium", !checkIn && "text-muted-foreground font-normal")}>
                  {checkIn ? format(checkIn, "d MMM yyyy", { locale: fr }) : "Choisir"}
                </span>
              </Field>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={checkIn} onSelect={setCheckIn} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>

        {/* Check-out */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="text-left">
              <Field label="Départ" icon={<CalendarIcon className="h-4 w-4 text-primary" />}>
                <span className={cn("text-sm font-medium", !checkOut && "text-muted-foreground font-normal")}>
                  {checkOut ? format(checkOut, "d MMM yyyy", { locale: fr }) : "Choisir"}
                </span>
              </Field>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={checkOut} onSelect={setCheckOut} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>

        {/* Guests */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="text-left">
              <Field label="Voyageurs" icon={<Users className="h-4 w-4 text-primary" />}>
                <span className="text-sm font-medium">{guests} voyageur{guests > 1 ? "s" : ""}</span>
              </Field>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-4" align="start">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Voyageurs</p>
                <p className="text-xs text-muted-foreground">Adultes & enfants</p>
              </div>
              <div className="flex items-center gap-3">
                <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={() => setGuests(Math.max(1, guests - 1))}>
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="w-5 text-center font-medium">{guests}</span>
                <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={() => setGuests(guests + 1)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          size="lg"
          className="h-full min-h-14 md:min-h-16 px-6 rounded-2xl gradient-primary text-primary-foreground hover:opacity-95 shadow-card gap-2 text-base font-semibold"
        >
          <Search className="h-5 w-5" strokeWidth={2.5} />
          <span className="md:hidden lg:inline">Rechercher</span>
        </Button>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 rounded-2xl hover:bg-muted/60 transition-colors h-full">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
