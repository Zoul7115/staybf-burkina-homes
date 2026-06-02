import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Bell, Mail, Smartphone, Globe, Moon, Lock, LogOut } from "lucide-react";
import { toast } from "sonner";
import { TravelerShell } from "@/components/traveler/TravelerShell";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/traveler/settings")({
  head: () => ({ meta: [{ title: "Paramètres — StayBF" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState({
    push: true, email: true, sms: false, promos: true, dark: false,
  });
  const [language, setLanguage] = useState("Français");

  const toggleDark = (v: boolean) => {
    setPrefs((p) => ({ ...p, dark: v }));
    document.documentElement.classList.toggle("dark", v);
  };

  return (
    <TravelerShell title="Paramètres">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto space-y-6">
        <Card title="Notifications" icon={Bell}>
          <Row icon={Bell} label="Notifications push" desc="Réservations, messages et alertes" checked={prefs.push} onChange={(v) => setPrefs({ ...prefs, push: v })} />
          <Row icon={Mail} label="Email" desc="Confirmations et reçus" checked={prefs.email} onChange={(v) => setPrefs({ ...prefs, email: v })} />
          <Row icon={Smartphone} label="SMS" desc="Code de réservation par SMS" checked={prefs.sms} onChange={(v) => setPrefs({ ...prefs, sms: v })} />
          <Row icon={Mail} label="Offres et promotions" desc="Réductions exclusives" checked={prefs.promos} onChange={(v) => setPrefs({ ...prefs, promos: v })} />
        </Card>

        <Card title="Préférences" icon={Globe}>
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-3">
              <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary grid place-items-center"><Globe className="h-4 w-4" /></span>
              <div>
                <p className="font-medium text-sm">Langue</p>
                <p className="text-xs text-muted-foreground">Langue de l'interface</p>
              </div>
            </div>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option>Français</option><option>English</option><option>Mooré</option><option>Dioula</option>
            </select>
          </div>
          <Separator />
          <Row icon={Moon} label="Mode sombre" desc="Réduire la luminosité" checked={prefs.dark} onChange={toggleDark} />
        </Card>

        <Card title="Sécurité" icon={Lock}>
          <div className="space-y-3 py-3">
            <div>
              <Label htmlFor="cp" className="text-sm">Mot de passe actuel</Label>
              <Input id="cp" type="password" placeholder="••••••••" className="mt-1.5 h-11" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="np" className="text-sm">Nouveau mot de passe</Label>
                <Input id="np" type="password" placeholder="••••••••" className="mt-1.5 h-11" />
              </div>
              <div>
                <Label htmlFor="cn" className="text-sm">Confirmer</Label>
                <Input id="cn" type="password" placeholder="••••••••" className="mt-1.5 h-11" />
              </div>
            </div>
            <Button onClick={() => toast.success("Mot de passe mis à jour")} className="rounded-xl gradient-primary text-primary-foreground">
              Mettre à jour
            </Button>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => { toast.success("Vous êtes déconnecté"); navigate({ to: "/" }); }}
            className="rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> Déconnexion
          </Button>
        </div>
      </motion.div>
    </TravelerShell>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card border border-border p-5 shadow-card">
      <h3 className="font-display font-semibold text-lg flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h3>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function Row({ icon: Icon, label, desc, checked, onChange }: {
  icon: React.ComponentType<{ className?: string }>; label: string; desc: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{desc}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
