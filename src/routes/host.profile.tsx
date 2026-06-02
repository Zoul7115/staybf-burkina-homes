import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Award, CheckCircle2 } from "lucide-react";
import { host } from "@/lib/staybf-host-data";

export const Route = createFileRoute("/host/profile")({ component: HostProfilePage });

function HostProfilePage() {
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-2xl gradient-primary text-primary-foreground grid place-items-center font-display text-2xl font-bold">{host.avatar}</div>
            <div className="flex-1">
              <h2 className="font-display font-bold text-xl">{host.name}</h2>
              <p className="text-sm text-muted-foreground">{host.company}</p>
              <div className="flex items-center gap-2 mt-2">
                {host.superhost && <Badge className="bg-secondary/20 text-secondary-foreground border-secondary/30"><Award className="h-3 w-3 mr-1" /> Superhôte</Badge>}
                <Badge className="bg-primary/10 text-primary border-primary/20"><CheckCircle2 className="h-3 w-3 mr-1" /> Vérifié</Badge>
              </div>
            </div>
            <Button variant="outline">Changer la photo</Button>
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h3 className="font-display font-semibold">Informations personnelles</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Nom complet</Label><Input defaultValue={host.name} className="mt-1.5" /></div>
            <div><Label>Société</Label><Input defaultValue={host.company} className="mt-1.5" /></div>
            <div><Label>Email</Label><Input defaultValue={host.email} className="mt-1.5" /></div>
            <div><Label>Téléphone</Label><Input defaultValue={host.phone} className="mt-1.5" /></div>
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h3 className="font-display font-semibold">Bio publique</h3>
          <Textarea rows={4} defaultValue="Hôte passionnée depuis 2023, je gère la Résidence Laongo à Ouagadougou. Notre objectif : offrir une expérience authentique et chaleureuse du Burkina Faso." />
        </Card>

        <Button className="gradient-primary text-primary-foreground">Enregistrer</Button>
      </div>

      <aside>
        <Card className="p-5 space-y-3">
          <h3 className="font-display font-semibold">Statistiques hôte</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span className="text-muted-foreground">Membre depuis</span><span className="font-semibold">{host.since}</span></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Réservations totales</span><span className="font-semibold">412</span></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Avis reçus</span><span className="font-semibold">187</span></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Note moyenne</span><span className="font-semibold">4.91 ★</span></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Taux de réponse</span><span className="font-semibold">98%</span></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Temps de réponse</span><span className="font-semibold">{"< 1h"}</span></li>
          </ul>
        </Card>
      </aside>
    </div>
  );
}
