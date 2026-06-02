import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Mail, MessageCircle, Bell, Send } from "lucide-react";

export const Route = createFileRoute("/admin/notifications")({ component: AdminNotificationsPage });

function AdminNotificationsPage() {
  return (
    <Tabs defaultValue="push" className="space-y-4">
      <TabsList>
        <TabsTrigger value="push"><Bell className="h-4 w-4 mr-1.5" /> Push</TabsTrigger>
        <TabsTrigger value="email"><Mail className="h-4 w-4 mr-1.5" /> Email</TabsTrigger>
        <TabsTrigger value="sms"><MessageCircle className="h-4 w-4 mr-1.5" /> SMS</TabsTrigger>
      </TabsList>

      <TabsContent value="push">
        <Composer label="Notification push" placeholder="Titre court — 50 caractères max" />
      </TabsContent>
      <TabsContent value="email">
        <Composer label="Campagne email" placeholder="Objet de l'email" rich />
      </TabsContent>
      <TabsContent value="sms">
        <Composer label="Campagne SMS" placeholder="Sujet interne" sms />
      </TabsContent>
    </Tabs>
  );
}

function Composer({ label, placeholder, rich, sms }: { label: string; placeholder: string; rich?: boolean; sms?: boolean }) {
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <Card className="p-5 space-y-4">
        <h3 className="font-display font-semibold">{label}</h3>
        <div><Label>Titre</Label><Input className="mt-1.5" placeholder={placeholder} /></div>
        <div>
          <Label>Message</Label>
          <Textarea rows={sms ? 4 : 8} className="mt-1.5" placeholder={sms ? "Max 160 caractères" : rich ? "Contenu HTML autorisé..." : "Votre message"} />
          {sms && <p className="text-[11px] text-muted-foreground mt-1">160 caractères max · 28 FCFA / envoi</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline">Aperçu</Button>
          <Button variant="outline">Programmer</Button>
          <Button className="gradient-primary text-primary-foreground ml-auto"><Send className="h-4 w-4 mr-1.5" /> Envoyer</Button>
        </div>
      </Card>
      <Card className="p-5 h-fit">
        <h3 className="font-display font-semibold mb-3">Audience</h3>
        <div className="space-y-2.5">
          {[
            ["Tous les utilisateurs", "12 724 personnes", true],
            ["Voyageurs actifs", "8 412 personnes", false],
            ["Hôtes vérifiés", "287 personnes", false],
            ["Voyageurs Ouagadougou", "5 812 personnes", false],
            ["Réservations à venir", "1 124 personnes", false],
          ].map(([n, c, d]) => (
            <label key={n as string} className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
              <Checkbox defaultChecked={d as boolean} className="mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-sm">{n as string}</p>
                <p className="text-xs text-muted-foreground">{c as string}</p>
              </div>
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}
