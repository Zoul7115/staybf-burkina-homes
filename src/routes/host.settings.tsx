import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Bell, Shield, Globe, CreditCard, Trash2, Loader2, Check } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useHostProfile } from "@/lib/host";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";

export const Route = createFileRoute("/host/settings")({ component: HostSettingsPage });

type NotifPrefs = {
  booking_new: boolean;
  messages: boolean;
  reviews: boolean;
  payouts: boolean;
  newsletter: boolean;
};

function HostSettingsPage() {
  const queryClient = useQueryClient();
  const { profile, loading } = useHostProfile();

  // ── Notification prefs ────────────────────────────────────────
  const [notifs, setNotifs] = useState<NotifPrefs>({
    booking_new: true, messages: true, reviews: true, payouts: true, newsletter: false,
  });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);

  // ── Preferences ───────────────────────────────────────────────
  const [language, setLanguage] = useState("fr");
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefSaved, setPrefSaved] = useState(false);

  // ── Payout account ────────────────────────────────────────────
  const [payoutMethod, setPayoutMethod] = useState("om");
  const [payoutNumber, setPayoutNumber] = useState("");
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutSaved, setPayoutSaved] = useState(false);

  // ── Password change ───────────────────────────────────────────
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Seed from loaded profile
  useEffect(() => {
    if (!profile) return;
    // Notification prefs are stored in host_profiles.notification_prefs (JSONB)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (profile as any).notification_prefs as Partial<NotifPrefs> | null;
    if (raw) {
      setNotifs((prev) => ({ ...prev, ...raw }));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payout = (profile as any).payout_method as string | null;
    if (payout) setPayoutMethod(payout);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payoutAcc = (profile as any).payout_account as string | null;
    if (payoutAcc) setPayoutNumber(payoutAcc);
  }, [profile]);

  async function saveNotifPrefs() {
    setNotifSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("host_profiles")
        .update({ notification_prefs: notifs })
        .eq("id", user.id);
      if (error) throw new Error(error.message);
      toast.success("Préférences de notifications enregistrées");
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 2000);
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur");
    } finally {
      setNotifSaving(false);
    }
  }

  async function savePref() {
    setPrefSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ locale: language })
        .eq("id", user.id);
      if (error) throw new Error(error.message);
      toast.success("Préférences enregistrées");
      setPrefSaved(true);
      setTimeout(() => setPrefSaved(false), 2000);
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur");
    } finally {
      setPrefSaving(false);
    }
  }

  async function savePayoutAccount() {
    setPayoutSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("host_profiles")
        .update({ payout_method: payoutMethod, payout_account: payoutNumber })
        .eq("id", user.id);
      if (error) throw new Error(error.message);
      toast.success("Compte de versement enregistré");
      queryClient.invalidateQueries({ queryKey: queryKeys.hostProfile() });
      setPayoutSaved(true);
      setTimeout(() => setPayoutSaved(false), 2000);
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur");
    } finally {
      setPayoutSaving(false);
    }
  }

  async function changePassword() {
    if (newPw !== confirmPw) { setPwError("Les mots de passe ne correspondent pas."); return; }
    if (newPw.length < 8) { setPwError("Le mot de passe doit contenir au moins 8 caractères."); return; }
    setPwSaving(true);
    setPwError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw new Error(error.message);
      toast.success("Mot de passe mis à jour");
      setPwOpen(false);
      setNewPw("");
      setConfirmPw("");
    } catch (e) {
      setPwError((e as Error).message ?? "Erreur");
    } finally {
      setPwSaving(false);
    }
  }

  const notifRows: { key: keyof NotifPrefs; title: string; desc: string }[] = [
    { key: "booking_new",  title: "Nouvelles réservations",    desc: "Recevoir un email à chaque réservation" },
    { key: "messages",     title: "Messages voyageurs",         desc: "Notifications instantanées des messages" },
    { key: "reviews",      title: "Avis et notes",              desc: "Être alerté des nouveaux avis" },
    { key: "payouts",      title: "Versements",                 desc: "Confirmation lors des paiements" },
    { key: "newsletter",   title: "Newsletter & conseils",      desc: "Recevoir les actualités StayBF" },
  ];

  return (
    <div className="space-y-5 max-w-3xl">
      {/* ── Notifications ── */}
      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" /> Notifications
        </h3>
        <div className="space-y-3">
          {notifRows.map(({ key, title, desc }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
              <div>
                <p className="font-medium text-sm">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch
                checked={notifs[key]}
                onCheckedChange={(v) => setNotifs((p) => ({ ...p, [key]: v }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            className="gradient-primary text-primary-foreground"
            disabled={notifSaving || loading}
            onClick={saveNotifPrefs}
          >
            {notifSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : notifSaved ? <><Check className="h-4 w-4" /> Enregistré</> : "Enregistrer"}
          </Button>
        </div>
      </Card>

      {/* ── Preferences ── */}
      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" /> Préférences
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Langue</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="mo">Mooré</SelectItem>
                <SelectItem value="dy">Dioula</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Devise</Label>
            <Select defaultValue="xof">
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="xof">FCFA (XOF)</SelectItem>
                <SelectItem value="eur">Euro</SelectItem>
                <SelectItem value="usd">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            className="gradient-primary text-primary-foreground"
            disabled={prefSaving}
            onClick={savePref}
          >
            {prefSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : prefSaved ? <><Check className="h-4 w-4" /> Enregistré</> : "Enregistrer"}
          </Button>
        </div>
      </Card>

      {/* ── Security ── */}
      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" /> Sécurité
        </h3>
        <div className="space-y-3">
          <Button variant="outline" onClick={() => setPwOpen(true)}>Changer le mot de passe</Button>
        </div>
      </Card>

      {/* ── Payout account ── */}
      <Card className="p-5">
        <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" /> Compte de versement
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Méthode</Label>
            <Select value={payoutMethod} onValueChange={setPayoutMethod}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="orange_money">Orange Money Business</SelectItem>
                <SelectItem value="moov_money">Moov Money Business</SelectItem>
                <SelectItem value="bank">Virement bancaire</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Numéro / IBAN</Label>
            <Input
              value={payoutNumber}
              onChange={(e) => setPayoutNumber(e.target.value)}
              placeholder="+226 70 XX XX XX"
              className="mt-1.5"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            className="gradient-primary text-primary-foreground"
            disabled={payoutSaving || !payoutNumber.trim()}
            onClick={savePayoutAccount}
          >
            {payoutSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : payoutSaved ? <><Check className="h-4 w-4" /> Enregistré</> : "Enregistrer"}
          </Button>
        </div>
      </Card>

      {/* ── Danger zone ── */}
      <Card className="p-5 border-destructive/30">
        <h3 className="font-display font-semibold text-destructive mb-2">Zone sensible</h3>
        <p className="text-sm text-muted-foreground mb-3">La suppression du compte est définitive et irréversible. Contactez le support pour procéder.</p>
        <Button variant="destructive" disabled title="Contactez support@staybf.bf pour supprimer votre compte">
          <Trash2 className="h-4 w-4 mr-1.5" /> Supprimer mon compte
        </Button>
      </Card>

      {/* ── Password dialog ── */}
      <Dialog open={pwOpen} onOpenChange={(o) => { setPwOpen(o); if (!o) { setNewPw(""); setConfirmPw(""); setPwError(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Changer le mot de passe</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nouveau mot de passe</Label>
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="mt-1.5" placeholder="8 caractères minimum" />
            </div>
            <div>
              <Label>Confirmer</Label>
              <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="mt-1.5" />
            </div>
            {pwError && <p className="text-xs text-destructive">{pwError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)}>Annuler</Button>
            <Button
              className="gradient-primary text-primary-foreground"
              disabled={pwSaving || !newPw || !confirmPw}
              onClick={changePassword}
            >
              {pwSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Modifier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
