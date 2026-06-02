import { Leaf, Facebook, Instagram, Twitter, Linkedin } from "lucide-react";

const cols = [
  { title: "StayBF", links: ["À propos", "Carrières", "Presse", "Blog"] },
  { title: "Support", links: ["Centre d'aide", "Contact", "FAQ", "Annulation"] },
  { title: "Hébergement", links: ["Devenir hôte", "Ressources hôtes", "Forum communauté", "Hospitalité responsable"] },
  { title: "Légal", links: ["Conditions générales", "Confidentialité", "Cookies", "Mentions légales"] },
];

export function Footer() {
  return (
    <footer className="bg-foreground text-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-12">
          <div className="col-span-2">
            <a href="#" className="flex items-center gap-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl gradient-primary text-primary-foreground">
                <Leaf className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <span className="font-display font-bold text-2xl">
                Stay<span className="text-secondary">BF</span>
              </span>
            </a>
            <p className="mt-4 text-background/70 text-sm leading-relaxed max-w-sm">
              La 1ère plateforme de réservation d'hébergements dédiée au Burkina Faso. Hôtels, résidences et auberges, vérifiés.
            </p>
            <div className="mt-6 flex items-center gap-2">
              {[Facebook, Instagram, Twitter, Linkedin].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  aria-label="Réseau social"
                  className="h-10 w-10 rounded-full border border-background/15 grid place-items-center hover:bg-secondary hover:border-secondary hover:text-secondary-foreground transition-colors"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-background mb-4">
                {col.title}
              </h4>
              <ul className="space-y-3">
                {col.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-background/70 hover:text-secondary text-sm transition-colors">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 pt-8 border-t border-background/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-background/60 text-sm">
          <p>© {new Date().getFullYear()} StayBF. Tous droits réservés. Fait avec ❤️ à Ouagadougou.</p>
          <p className="flex items-center gap-2">
            <span>🇧🇫</span> Burkina Faso · Français (FCFA)
          </p>
        </div>
      </div>
    </footer>
  );
}
