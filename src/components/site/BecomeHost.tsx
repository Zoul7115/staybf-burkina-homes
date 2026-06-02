import hostImg from "@/assets/host-cta.jpg";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const points = [
  "Listez votre bien gratuitement",
  "Recevez vos paiements via Mobile Money",
  "Accompagnement par notre équipe locale",
];

export function BecomeHost() {
  return (
    <section className="py-16 sm:py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] gradient-primary text-primary-foreground shadow-elevated">
          <div className="grid md:grid-cols-2 items-center">
            <div className="p-8 sm:p-12 lg:p-16 relative z-10">
              <p className="text-secondary font-semibold text-sm uppercase tracking-wider mb-3">
                Devenir hôte
              </p>
              <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-balance leading-tight">
                Mettez votre bien en location, simplement.
              </h2>
              <p className="mt-4 text-primary-foreground/85 text-base sm:text-lg leading-relaxed">
                Rejoignez des centaines d'hôtes au Burkina Faso et générez un revenu complémentaire dès cette semaine.
              </p>

              <ul className="mt-6 space-y-3">
                {points.map((p) => (
                  <li key={p} className="flex items-center gap-3 text-primary-foreground/95">
                    <CheckCircle2 className="h-5 w-5 text-secondary shrink-0" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                className="mt-8 bg-secondary text-secondary-foreground hover:bg-secondary/90 font-bold rounded-full px-8 h-12 shadow-glow gap-2"
              >
                Commencer gratuitement
                <ArrowRight className="h-5 w-5" />
              </Button>
            </div>

            <div className="relative h-64 md:h-full min-h-[360px]">
              <img
                src={hostImg}
                alt="Hôte burkinabè accueillant ses invités"
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-primary/60 via-transparent to-transparent md:from-primary/40" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
