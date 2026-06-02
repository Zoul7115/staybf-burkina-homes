import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, Crown, Sparkles, Download, Calculator } from "lucide-react";
import { subscriptionPlans, hostInvoices, fmtFCFA } from "@/lib/staybf-host-data";
import { StatusBadge } from "@/components/dashboard/widgets";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/host/subscription")({ component: HostSubscriptionPage });

function HostSubscriptionPage() {
  return (
    <div className="space-y-6">
      <Card className="p-5 bg-gradient-to-br from-primary/10 via-secondary/5 to-background border-primary/20">
        <div className="flex items-center gap-4 flex-col sm:flex-row">
          <span className="h-14 w-14 rounded-2xl gradient-primary text-primary-foreground grid place-items-center"><Crown className="h-7 w-7" /></span>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Plan actuel</p>
            <h2 className="font-display font-bold text-xl">Croissance · 25 000 FCFA / mois</h2>
            <p className="text-sm text-muted-foreground">Renouvellement automatique le 01 Juillet 2026</p>
          </div>
          <Button variant="outline">Annuler l'abonnement</Button>
        </div>
      </Card>

      <div>
        <h3 className="font-display font-bold text-lg mb-4">Choisissez votre plan</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {subscriptionPlans.map((p) => (
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
          <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" /> Tout exporter</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>N°</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hostInvoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="text-xs">{inv.date}</TableCell>
                <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                <TableCell className="text-sm">{inv.plan}</TableCell>
                <TableCell><StatusBadge status="paid" /></TableCell>
                <TableCell className="text-right font-semibold">{fmtFCFA(inv.amount)}</TableCell>
                <TableCell className="text-right"><Button size="icon" variant="ghost"><Download className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
