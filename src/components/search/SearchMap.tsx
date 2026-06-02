import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { Listing } from "@/lib/staybf-search-data";

type Props = {
  listings: Listing[];
  activeId: number | null;
  city: string;
};

export function SearchMap({ listings, activeId, city }: Props) {
  const navigate = useNavigate();
  return (
    <div className="relative w-full h-full min-h-[400px] rounded-3xl overflow-hidden border border-border/60 shadow-card">
      {/* Stylized map background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, #e8f3ec 0%, #f4f8f3 35%, #f0ede5 70%, #ece6d4 100%)",
        }}
      />
      {/* Faux roads */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <g stroke="#cdd5c8" strokeWidth="0.4" fill="none" opacity="0.7">
          <path d="M0 30 Q 40 25 60 40 T 100 55" />
          <path d="M0 70 Q 30 60 55 72 T 100 80" />
          <path d="M20 0 Q 25 40 40 60 T 55 100" />
          <path d="M70 0 Q 65 35 80 55 T 75 100" />
        </g>
        <g stroke="#b8c4b0" strokeWidth="0.2" fill="none" opacity="0.5">
          <path d="M0 50 L 100 50" />
          <path d="M50 0 L 50 100" />
        </g>
        {/* river */}
        <path d="M-5 85 Q 30 75 55 88 T 105 78" stroke="#9ec5db" strokeWidth="1.4" fill="none" opacity="0.6" />
      </svg>

      {/* City label */}
      <div className="absolute top-4 left-4 bg-card/95 backdrop-blur px-3 py-1.5 rounded-full shadow-card text-xs font-semibold flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 text-primary" />
        {city}
      </div>

      {/* Markers */}
      {listings.map((l) => {
        const isActive = activeId === l.id;
        return (
          <motion.button
            key={l.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.02 * l.id }}
            onClick={() => navigate({ to: "/properties/$id", params: { id: String(l.id) } })}
            whileHover={{ scale: 1.1 }}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 rounded-full text-xs font-bold shadow-card border-2 transition-all",
              isActive
                ? "bg-foreground text-background border-foreground z-20 scale-110"
                : "bg-card text-foreground border-card hover:border-primary z-10",
            )}
            style={{ left: `${l.mapX * 100}%`, top: `${l.mapY * 100}%` }}
          >
            {Math.round(l.price / 1000)}k
          </motion.button>
        );
      })}

      {/* Attribution */}
      <div className="absolute bottom-2 right-3 text-[10px] text-muted-foreground bg-card/70 px-2 py-0.5 rounded">
        Carte StayBF
      </div>
    </div>
  );
}
