import { Star, Quote } from "lucide-react";
import { testimonials } from "@/lib/staybf-data";

export function Testimonials() {
  return (
    <section className="py-16 sm:py-24 bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <p className="text-primary font-semibold text-sm uppercase tracking-wider mb-2">Témoignages</p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl md:text-5xl text-balance">
            Ils nous font confiance
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-7">
          {testimonials.map((t, i) => (
            <figure
              key={t.name}
              className="relative p-7 sm:p-8 rounded-3xl bg-card border border-border shadow-card hover-lift hover:border-secondary/50 transition-colors animate-fade-in-up"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <Quote className="h-8 w-8 text-secondary/30 absolute top-6 right-6" />
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star key={j} className="h-4 w-4 fill-secondary text-secondary" />
                ))}
              </div>
              <blockquote className="text-foreground leading-relaxed">"{t.quote}"</blockquote>
              <figcaption className="mt-6 flex items-center gap-3 pt-5 border-t border-border">
                <div className="h-11 w-11 rounded-full gradient-primary text-primary-foreground grid place-items-center font-bold text-sm shrink-0">
                  {t.avatar}
                </div>
                <div>
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
