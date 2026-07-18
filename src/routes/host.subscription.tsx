import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, Crown, Sparkles, Download, Calculator, Mail } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/dashboard/widgets";
import { cn } from "@/lib/utils";

function fmtFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

// ── Subscription plan config (UI configuration, not DB data) ──
const SUBSCRIPTION_PLANS = [
  {
    id: "free",
    name: "Gratuit",
    price: 0,
    period: "FCFA / mois",
    commission: "15%",
    popular: false,
    current: false,
    cta: "Commencer",
    features: ["1 propriété", "Commission 15%", "Support email", "Dashboard basique"],
  },
  {
    id: "starter",
    name: "Démarrage",
    price: 15_000,
    period: "FCFA / mois",
    commission: "0%",
    popular: false,
    current: false,
    cta: "Choisir",
    features: ["3 propriétés", "Commission 0%", "Support prioritaire", "Calendrier avancé"],
  },
  {
    id: "growth",
    name: "Croissance",
    price: 25_000,
    period: "FCFA / mois",
    commission: "0%",
    popular: true,
    current: true,
    cta: "Choisir",
    features: ["10 propriétés", "Commission 0%", "Support dédié", "Analytics avancées", "Paiements accélérés"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 50_000,
    period: "FCFA / mois",
    commission: "0%",
    popular: false,
    current: false,
    cta: "Contacter",
    features: ["Propriétés illimitées", "Commission 0%", "Manager dédié", "API accès", "Contrat sur-mesure"],
  },
];

export const Route = createFileRoute("/host/subscription")({ component: HostSubscriptionPage });

function HostSubscriptionPage() {
  const { data: subscriptions } = useQuery({
    queryKey: ["host", "subscriptions"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from("billing.subscriptions")
        .select("id, status, current_period_start, current_period_end, created_at, billing_subscription_plans(name, price_fcfa)")
        .eq("host_id", user.id)
        .order("created_at", { ascending: false })
        .limit(24);
      if (error) return [];
      return (data ?? []) as any[];
    },
    staleTime: 300_000,
  });

  const currentPlan = SUBSCRIPTION_PLANS.find((p) => p.current);

  return (
    <div className="space-y-6">
      <Card className="p-5 bg-gradient-to-br from-primary/10 via-secondary/5 to-background border-primary/20">
        <div className="flex items-center gap-4 flex-col sm:flex-row">
          <span className="h-14 w-14 rounded-2xl gradient-primary text-primary-foreground grid place-items-center"><Crown className="h-7 w-7" /></span>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Plan actuel</p>
            <h2 className="font-display font-bold text-xl">{currentPlan?.name} · {fmtFCFA(currentPlan?.price ?? 0)} / mois</h2>
            <p className="text-sm text-muted-foreground">Renouvellement automatique le 01 Août 2026</p>
          </div>
          <Button variant="outline" asChild>
            <a href="mailto:support@staybf.com?subject=Annulation%20abonnement">
              <Mail className="h-4 w-4 mr-2" />Annuler l'abonnement
            </a>
          </Button>
        </div>
      </Card>

      <div>
        <h3 className="font-display font-bold text-lg mb-4">Choisissez votre plan</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SUBSCRIPTION_PLANS.map((p) => (
            <Card key={p.id} className={cn("p-5 relative flex flex-col", p.popular && "border-primary shadow-elevated")}>
              {p.popular && <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gradient-primary text-primary-foreground border-0"><Sparkles className="h-3 w-3 mr-1" /> Populaire</Badge>}
              <h4 className="font-display font-bold text-lg">{p.name}</h4>
              <div className="mt-2">
                <span className="font-display text-3xl font-bold">{p.price === 0 ? "—" : p.price.toLocaleString("fr-FR")}</span>
                <span className="text-sm text-muted-foreground ml-1">{p.period}</span>
              </div>
              <ul className="space-y-2 mt-4 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs"><Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" /> {f}</li>
                ))}
              </ul>
              <Button className={cn("mt-5", p.popular ? "gradient-primary text-primary-foreground" : "")} variant={p.popular ? "default" : "outline"} disabled={p.current}>
                {p.current ? "Plan actuel" : p.cta}
              </Button>
            </Card>
          ))}
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <Calculator className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold">Calculez vos économies</h3>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div className="p-4 rounded-xl bg-muted/50">
            <p className="text-xs text-muted-foreground">Plan annuel</p>
            <p className="font-display font-bold text-xl">240 000 FCFA</p>
            <p className="text-xs text-muted-foreground">soit 20 000 / mois</p>
          </div>
          <div className="p-4 rounded-xl bg-muted/50">
            <p className="text-xs text-muted-foreground">12 × mensuel</p>
            <p className="font-display font-bold text-xl">300 000 FCFA</p>
            <p className="text-xs text-muted-foreground">25 000 / mois</p>
          </div>
          <div className="p-4 rounded-xl gradient-primary text-primary-foreground">
            <p className="text-xs opacity-90">Économie</p>
            <p className="font-display font-bold text-xl">60 000 FCFA</p>
            <p className="text-xs opacity-90">soit 20%</p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold">Historique de facturation</h3>
          <Button variant="outline" size="sm" disabled title="À venir"><Download className="h-4 w-4 mr-1.5" /> Tout exporter</Button>
        </div>
        {(!subscriptions || subscriptions.length === 0) ? (
          <p className="text-sm text-muted-foreground text-center py-6">Aucune facture disponible.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((s) => {
                const plan = Array.isArray(s.billing_subscription_plans) ? s.billing_subscription_plans[0] : s.billing_subscription_plans;
                const date = new Date(s.current_period_start).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{date}</TableCell>
                    <TableCell className="text-sm">{plan?.name ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={s.status === "active" ? "active" : s.status === "cancelled" ? "cancelled" : "pending"} /></TableCell>
                    <TableCell className="text-right font-semibold">{plan?.price_fcfa ? fmtFCFA(plan.price_fcfa) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
