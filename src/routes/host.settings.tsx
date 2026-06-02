import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Shield, Globe, CreditCard, Trash2 } from "lucide-react";

export const Route = createFileRoute("/host/settings")({ component: HostSettingsPage });

function HostSettingsPage() {
  return (
    <div className="space-y-5 max-w-3xl">
      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /> Notifications</h3>
        <div className="space-y-3">
          {[
            ["Nouvelles réservations", "Recevoir un email à chaque réservation", true],
            ["Messages voyageurs", "Notifications instantanées des messages", true],
            ["Avis et notes", "Être alerté des nouveaux avis", true],
            ["Versements", "Confirmation lors des paiements", true],
            ["Newsletter & conseils", "Recevoir les actualités StayBF", false],
          ].map(([title, desc, on]) => (
            <div key={title as string} className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
              <div><p className="font-medium text-sm">{title as string}</p><p className="text-xs text-muted-foreground">{desc as string}</p></div>
              <Switch defaultChecked={on as boolean} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2"><Globe className="h-5 w-5 text-primary" /> Préférences</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Langue</Label>
            <Select defaultValue="fr"><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="mo">Mooré</SelectItem>
                <SelectItem value="dy">Dioula</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Devise</Label>
            <Select defaultValue="xof"><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="xof">FCFA (XOF)</SelectItem>
                <SelectItem value="eur">Euro</SelectItem>
                <SelectItem value="usd">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Fuseau horaire</Label><Input defaultValue="GMT+0 (Ouagadougou)" className="mt-1.5" /></div>
          <div className="flex items-center justify-between pt-6"><Label>Mode sombre</Label><Switch /></div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Sécurité</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between"><Label>Authentification à deux facteurs</Label><Switch defaultChecked /></div>
          <div className="flex items-center justify-between"><Label>Alertes de connexion</Label><Switch defaultChecked /></div>
          <Button variant="outline">Changer le mot de passe</Button>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Compte de versement</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Méthode</Label>
            <Select defaultValue="om"><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="om">Orange Money Business</SelectItem>
                <SelectItem value="moov">Moov Money Business</SelectItem>
                <SelectItem value="bank">Virement bancaire</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Numéro / IBAN</Label><Input defaultValue="+226 70 88 12 45" className="mt-1.5" /></div>
        </div>
      </Card>

      <Card className="p-5 border-destructive/30">
        <h3 className="font-display font-semibold text-destructive mb-2">Zone sensible</h3>
        <p className="text-sm text-muted-foreground mb-3">La suppression du compte est définitive.</p>
        <Button variant="destructive"><Trash2 className="h-4 w-4 mr-1.5" /> Supprimer mon compte</Button>
      </Card>
    </div>
  );
}
