import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cog, Percent, CreditCard, Shield, Loader2, Check } from "lucide-react";
import { useAdminSettings } from "@/lib/admin";

export const Route = createFileRoute("/admin/settings")({ component: AdminSettingsPage });

function AdminSettingsPage() {
  const { settings, loading, saveSettings, saving } = useAdminSettings();

  // ── Platform ──────────────────────────────────────────────────
  const [platformName, setPlatformName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [currency, setCurrency] = useState("xof");
  const [locale, setLocale] = useState("fr");
  const [platformSaved, setPlatformSaved] = useState(false);

  // ── Commissions ───────────────────────────────────────────────
  const [discoveryPct, setDiscoveryPct] = useState(15);
  const [growthPct, setGrowthPct] = useState(10);
  const [proPct, setProPct] = useState(8);
  const [travelerFeePct, setTravelerFeePct] = useState(10);
  const [cleaningMin, setCleaningMin] = useState(5000);
  const [tvaPct, setTvaPct] = useState(18);
  const [commissionsSaved, setCommissionsSaved] = useState(false);

  // ── Security ──────────────────────────────────────────────────
  const [require2fa, setRequire2fa] = useState(true);
  const [autoKyc, setAutoKyc] = useState(true);
  const [fraudDetection, setFraudDetection] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [securitySaved, setSecuritySaved] = useState(false);

  useEffect(() => {
    if (loading) return;
    const p = settings.platform;
    setPlatformName(p.name);
    setSupportEmail(p.support_email);
    setCurrency(p.currency);
    setLocale(p.locale);

    const c = settings.commissions;
    setDiscoveryPct(c.discovery_pct);
    setGrowthPct(c.growth_pct);
    setProPct(c.pro_pct);
    setTravelerFeePct(c.traveler_fee_pct);
    setCleaningMin(c.cleaning_min_fcfa);
    setTvaPct(c.tva_pct);

    const s = settings.security;
    setRequire2fa(s.require_2fa_hosts);
    setAutoKyc(s.auto_kyc);
    setFraudDetection(s.fraud_detection);
    setMaintenanceMode(s.maintenance_mode);
  }, [loading, settings]);

  async function savePlatform() {
    try {
      await saveSettings("platform", { name: platformName, support_email: supportEmail, currency, locale });
      toast.success("Paramètres plateforme enregistrés");
      setPlatformSaved(true);
      setTimeout(() => setPlatformSaved(false), 2000);
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur");
    }
  }

  async function saveCommissions() {
    try {
      await saveSettings("commissions", {
        discovery_pct: discoveryPct, growth_pct: growthPct, pro_pct: proPct,
        traveler_fee_pct: travelerFeePct, cleaning_min_fcfa: cleaningMin, tva_pct: tvaPct,
      });
      toast.success("Commissions enregistrées");
      setCommissionsSaved(true);
      setTimeout(() => setCommissionsSaved(false), 2000);
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur");
    }
  }

  async function saveSecurity() {
    try {
      await saveSettings("security", {
        require_2fa_hosts: require2fa, auto_kyc: autoKyc,
        fraud_detection: fraudDetection, maintenance_mode: maintenanceMode,
      });
      toast.success("Paramètres sécurité enregistrés");
      setSecuritySaved(true);
      setTimeout(() => setSecuritySaved(false), 2000);
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur");
    }
  }

  if (loading) {
    return <div className="space-y-5 max-w-4xl animate-pulse">{Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5 h-40" />)}</div>;
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2"><Cog className="h-5 w-5 text-primary" /> Plateforme</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Nom commercial</Label><Input value={platformName} onChange={(e) => setPlatformName(e.target.value)} className="mt-1.5" /></div>
          <div><Label>Email support</Label><Input value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} className="mt-1.5" /></div>
          <div>
            <Label>Devise principale</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="xof">FCFA (XOF)</SelectItem><SelectItem value="eur">EUR</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label>Langue par défaut</Label>
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="fr">Français</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" className="gradient-primary text-primary-foreground" disabled={saving} onClick={savePlatform}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : platformSaved ? <><Check className="h-4 w-4" /> Enregistré</> : "Enregistrer"}
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2"><Percent className="h-5 w-5 text-primary" /> Commissions & frais</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <div><Label>Commission Découverte (%)</Label><Input type="number" value={discoveryPct} onChange={(e) => setDiscoveryPct(+e.target.value)} className="mt-1.5" /></div>
          <div><Label>Commission Croissance (%)</Label><Input type="number" value={growthPct} onChange={(e) => setGrowthPct(+e.target.value)} className="mt-1.5" /></div>
          <div><Label>Commission Pro (%)</Label><Input type="number" value={proPct} onChange={(e) => setProPct(+e.target.value)} className="mt-1.5" /></div>
          <div><Label>Frais voyageur (%)</Label><Input type="number" value={travelerFeePct} onChange={(e) => setTravelerFeePct(+e.target.value)} className="mt-1.5" /></div>
          <div><Label>Frais nettoyage min (FCFA)</Label><Input type="number" value={cleaningMin} onChange={(e) => setCleaningMin(+e.target.value)} className="mt-1.5" /></div>
          <div><Label>TVA (%)</Label><Input type="number" value={tvaPct} onChange={(e) => setTvaPct(+e.target.value)} className="mt-1.5" /></div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" className="gradient-primary text-primary-foreground" disabled={saving} onClick={saveCommissions}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : commissionsSaved ? <><Check className="h-4 w-4" /> Enregistré</> : "Enregistrer"}
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Paiements</h3>
        <div className="space-y-3">
          {[
            ["Orange Money", "API v3 — actif", true],
            ["Moov Money", "API v2 — actif", true],
            ["Visa / Mastercard", "Via CinetPay", true],
            ["Wave", "En attente d'intégration", false],
          ].map(([n, d, on]) => (
            <div key={n as string} className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div><p className="font-semibold text-sm">{n as string}</p><p className="text-xs text-muted-foreground">{d as string}</p></div>
              <Switch defaultChecked={on as boolean} disabled title="Configuration fournisseur — contactez l'équipe technique" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Sécurité</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between"><Label>2FA obligatoire pour les hôtes</Label><Switch checked={require2fa} onCheckedChange={setRequire2fa} /></div>
          <div className="flex items-center justify-between"><Label>Vérification KYC automatique</Label><Switch checked={autoKyc} onCheckedChange={setAutoKyc} /></div>
          <div className="flex items-center justify-between"><Label>Détection de fraude</Label><Switch checked={fraudDetection} onCheckedChange={setFraudDetection} /></div>
          <div className="flex items-center justify-between"><Label className={maintenanceMode ? "text-destructive" : ""}>Mode maintenance</Label><Switch checked={maintenanceMode} onCheckedChange={setMaintenanceMode} /></div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" className="gradient-primary text-primary-foreground" disabled={saving} onClick={saveSecurity}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : securitySaved ? <><Check className="h-4 w-4" /> Enregistré</> : "Enregistrer"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
