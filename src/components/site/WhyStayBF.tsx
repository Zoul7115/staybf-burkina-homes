import { Zap, Smartphone, BadgeCheck, Headset } from "lucide-react";

const features = [
  { icon: Zap, title: "Réservation rapide", desc: "Confirmez votre séjour en moins de 2 minutes, sans paperasse." },
  { icon: Smartphone, title: "Paiement Mobile Money", desc: "Orange Money, Moov Money ou carte. Paiement 100 % sécurisé." },
  { icon: BadgeCheck, title: "Hébergements vérifiés", desc: "Chaque adresse est inspectée par notre équipe locale." },
  { icon: Headset, title: "Support local 24/7", desc: "Une équipe burkinabè à votre écoute, en français et en langues locales." },
];

export function WhyStayBF() {
  return (
    <section className="py-16 sm:py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <p className="text-primary font-semibold text-sm uppercase tracking-wider mb-2">Pourquoi StayBF</p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl md:text-5xl text-balance">
            Conçu pour le Burkina Faso
          </h2>
          <p className="mt-3 text-muted-foreground">
            Une expérience pensée pour les voyageurs locaux, les ONG et les professionnels.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group relative p-7 rounded-3xl border border-border bg-card hover-lift shadow-card animate-fade-in-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="h-14 w-14 rounded-2xl gradient-primary grid place-items-center text-primary-foreground shadow-card group-hover:scale-110 transition-transform">
                <f.icon className="h-7 w-7" strokeWidth={2} />
              </div>
              <h3 className="mt-5 font-display font-bold text-xl">{f.title}</h3>
              <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
