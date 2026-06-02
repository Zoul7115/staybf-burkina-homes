import heroImg from "@/assets/hero-staybf.jpg";
import { SearchCard } from "./SearchCard";
import { Star } from "lucide-react";

export function Hero() {
  return (
    <section className="relative min-h-[100svh] md:min-h-[92vh] w-full overflow-hidden">
      <img
        src={heroImg}
        alt="Hébergement de luxe au Burkina Faso au coucher du soleil"
        width={1920}
        height={1080}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 gradient-hero-overlay" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/55" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-32 md:pt-40 pb-12 md:pb-20 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-md border border-white/25 px-4 py-1.5 text-white text-xs sm:text-sm font-medium animate-fade-in">
          <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
          La 1ère plateforme dédiée au Burkina Faso
        </div>

        <h1 className="mt-6 max-w-4xl text-white font-display font-bold text-balance text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.05] animate-fade-in-up">
          Trouvez votre hébergement
          <span className="block mt-2 text-secondary">partout au Burkina Faso</span>
        </h1>

        <p
          className="mt-5 max-w-2xl text-white/90 text-base sm:text-lg md:text-xl leading-relaxed animate-fade-in-up"
          style={{ animationDelay: "120ms" }}
        >
          Réservez hôtels, résidences meublées et auberges en quelques minutes.
        </p>

        <div
          className="mt-8 md:mt-12 w-full animate-fade-in-up"
          style={{ animationDelay: "240ms" }}
        >
          <SearchCard />
        </div>

        <div
          className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-white/90 text-sm animate-fade-in-up"
          style={{ animationDelay: "360ms" }}
        >
          <Stat value="500+" label="Hébergements" />
          <span className="hidden sm:inline h-4 w-px bg-white/30" />
          <Stat value="30+" label="Villes couvertes" />
          <span className="hidden sm:inline h-4 w-px bg-white/30" />
          <Stat value="4.9★" label="Note moyenne" />
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-display font-bold text-lg sm:text-xl">{value}</span>
      <span className="text-white/70 text-xs sm:text-sm">{label}</span>
    </div>
  );
}
