import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, MapPin, Users, Search, Minus, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cities } from "@/lib/staybf-data";
import { cn } from "@/lib/utils";

type Props = {
  resultCount: number;
  city: string;
  onCityChange: (c: string) => void;
  onOpenFilters: () => void;
};

export function SearchTopBar({ resultCount, city, onCityChange, onOpenFilters }: Props) {
  const [checkIn, setCheckIn] = useState<Date | undefined>(new Date());
  const [checkOut, setCheckOut] = useState<Date | undefined>();
  const [guests, setGuests] = useState(2);

  return (
    <div className="sticky top-16 z-30 bg-background/85 backdrop-blur-xl border-b border-border/60">
      <div className="container mx-auto px-4 py-3">
        <div className="flex flex-col gap-3">
          <div className="bg-card rounded-2xl shadow-card border border-border/60 p-1.5 grid grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-1">
            <Cell label="Destination" icon={<MapPin className="h-3.5 w-3.5 text-primary" />}>
              <Select value={city} onValueChange={onCityChange}>
                <SelectTrigger className="border-0 shadow-none h-auto p-0 font-medium focus:ring-0 [&>svg]:hidden text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((c) => (
                    <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Cell>

            <DateCell label="Arrivée" date={checkIn} onChange={setCheckIn} />
            <DateCell label="Départ" date={checkOut} onChange={setCheckOut} />

            <Popover>
              <PopoverTrigger asChild>
                <button className="text-left">
                  <Cell label="Voyageurs" icon={<Users className="h-3.5 w-3.5 text-primary" />}>
                    <span className="text-sm font-medium">{guests} voyageur{guests > 1 ? "s" : ""}</span>
                  </Cell>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4" align="end">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">Voyageurs</p>
                  <div className="flex items-center gap-3">
                    <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={() => setGuests(Math.max(1, guests - 1))}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-5 text-center font-medium text-sm">{guests}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={() => setGuests(guests + 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Button className="col-span-2 md:col-span-1 h-12 md:h-auto rounded-xl gradient-primary text-primary-foreground gap-2 px-5 font-semibold">
              <Search className="h-4 w-4" strokeWidth={2.5} />
              <span>Rechercher</span>
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm md:text-base font-medium text-foreground">
              <span className="font-display font-bold text-primary">{resultCount}</span> hébergements trouvés à{" "}
              <span className="font-display font-bold">{city}</span>
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenFilters}
              className="md:hidden gap-2 rounded-full"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtres
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Cell({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2 rounded-xl hover:bg-muted/60 transition-colors">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}{label}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function DateCell({ label, date, onChange }: { label: string; date?: Date; onChange: (d?: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="text-left">
          <Cell label={label} icon={<CalendarIcon className="h-3.5 w-3.5 text-primary" />}>
            <span className={cn("text-sm font-medium", !date && "text-muted-foreground font-normal")}>
              {date ? format(date, "d MMM", { locale: fr }) : "Choisir"}
            </span>
          </Cell>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={onChange} initialFocus className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}
