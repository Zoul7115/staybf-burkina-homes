import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cog, Percent, CreditCard, Shield } from "lucide-react";

export const Route = createFileRoute("/admin/settings")({ component: AdminSettingsPage });

function AdminSettingsPage() {
  return (
    <div className="space-y-5 max-w-4xl">
      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2"><Cog className="h-5 w-5 text-primary" /> Plateforme</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Nom commercial</Label><Input defaultValue="StayBF" className="mt-1.5" /></div>
          <div><Label>Email support</Label><Input defaultValue="support@staybf.com" className="mt-1.5" /></div>
          <div><Label>Devise principale</Label>
            <Select defaultValue="xof"><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="xof">FCFA (XOF)</SelectItem><SelectItem value="eur">EUR</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Langue par défaut</Label>
            <Select defaultValue="fr"><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="fr">Français</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2"><Percent className="h-5 w-5 text-primary" /> Commissions & frais</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <div><Label>Commission Découverte (%)</Label><Input type="number" defaultValue={15} className="mt-1.5" /></div>
          <div><Label>Commission Croissance (%)</Label><Input type="number" defaultValue={10} className="mt-1.5" /></div>
          <div><Label>Commission Pro (%)</Label><Input type="number" defaultValue={8} className="mt-1.5" /></div>
          <div><Label>Frais voyageur (%)</Label><Input type="number" defaultValue={10} className="mt-1.5" /></div>
          <div><Label>Frais nettoyage min (FCFA)</Label><Input type="number" defaultValue={5000} className="mt-1.5" /></div>
          <div><Label>TVA (%)</Label><Input type="number" defaultValue={18} className="mt-1.5" /></div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Paiements</h3>
        <div className="space-y-3">
          {[
            ["Orange Money", "API v3 — actif", true],
            ["Moov Money", "API v2 — actif", true],
            ["Visa / Mastercard", "Via Stripe", true],
            ["Wave", "En attente d'intégration", false],
          ].map(([n, d, on]) => (
            <div key={n as string} className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div><p className="font-semibold text-sm">{n as string}</p><p className="text-xs text-muted-foreground">{d as string}</p></div>
              <Switch defaultChecked={on as boolean} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Sécurité</h3>
        <div className="space-y-3">
          <Row label="2FA obligatoire pour les hôtes" defaultChecked />
          <Row label="Vérification KYC automatique" defaultChecked />
          <Row label="Détection de fraude" defaultChecked />
          <Row label="Mode maintenance" />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline">Annuler</Button>
        <Button className="gradient-primary text-primary-foreground">Enregistrer la configuration</Button>
      </div>
    </div>
  );
}

function Row({ label, defaultChecked }: { label: string; defaultChecked?: boolean }) {
  return <div className="flex items-center justify-between"><Label>{label}</Label><Switch defaultChecked={defaultChecked} /></div>;
}
