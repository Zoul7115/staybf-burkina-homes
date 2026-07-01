import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Camera, Check } from "lucide-react";
import { toast } from "sonner";
import { TravelerShell } from "@/components/traveler/TravelerShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTravelerProfile } from "@/lib/traveler/useTravelerProfile";

export const Route = createFileRoute("/traveler/profile")({
  head: () => ({ meta: [{ title: "Profil — StayBF" }] }),
  component: ProfilePage,
});

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
  language: string;
};

function ProfilePage() {
  const { profile, loading, save: saveProfile } = useTravelerProfile();
  const [form, setForm] = useState<FormState>({
    firstName: "", lastName: "", email: "", phone: "", country: "", language: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email ?? "",
        phone: profile.phone ?? "",
        country: profile.country ?? "",
        language: profile.language ?? "Français",
      });
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveProfile({
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone || undefined,
      country: form.country || undefined,
      language: form.language || undefined,
    });
    setSaved(true);
    toast.success("Profil mis à jour");
    setTimeout(() => setSaved(false), 1500);
  };

  if (loading) {
    return (
      <TravelerShell title="Profil">
        <div className="max-w-3xl mx-auto rounded-3xl bg-card border border-border p-6 md:p-8 shadow-card space-y-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <Skeleton className="h-24 w-24 rounded-full shrink-0" />
            <div className="space-y-2 text-center sm:text-left">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-md" />)}
          </div>
        </div>
      </TravelerShell>
    );
  }

  const displayName = `${form.firstName} ${form.lastName}`.trim() || "—";

  return (
    <TravelerShell title="Profil">
      <motion.form
        onSubmit={handleSave}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto rounded-3xl bg-card border border-border p-6 md:p-8 shadow-card"
      >
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative">
            <div className="h-24 w-24 rounded-full gradient-primary text-primary-foreground grid place-items-center font-bold text-3xl overflow-hidden">
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                profile?.initials ?? "?"
              )}
            </div>
            <button type="button" className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full bg-card border border-border grid place-items-center shadow-card hover:scale-110 transition">
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <div className="text-center sm:text-left">
            <h2 className="font-display font-bold text-2xl">{displayName}</h2>
            {profile?.joinedLabel && (
              <p className="text-sm text-muted-foreground">Voyageur depuis {profile.joinedLabel}</p>
            )}
          </div>
        </div>

        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <Field id="fn" label="Prénom"><Input id="fn" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="h-11" /></Field>
          <Field id="ln" label="Nom"><Input id="ln" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="h-11" /></Field>
          <Field id="em" label="Email"><Input id="em" type="email" value={form.email} disabled className="h-11 opacity-60 cursor-not-allowed" /></Field>
          <Field id="ph" label="Téléphone"><Input id="ph" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11" /></Field>
          <Field id="co" label="Pays"><Input id="co" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="h-11" /></Field>
          <Field id="la" label="Langue">
            <select id="la" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option>Français</option><option>English</option><option>Mooré</option><option>Dioula</option>
            </select>
          </Field>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => {
            if (profile) setForm({ firstName: profile.firstName, lastName: profile.lastName, email: profile.email ?? "", phone: profile.phone ?? "", country: profile.country ?? "", language: profile.language ?? "Français" });
          }}>Annuler</Button>
          <Button type="submit" className="rounded-xl gradient-primary text-primary-foreground">
            {saved ? <><Check className="h-4 w-4" /> Enregistré</> : "Enregistrer"}
          </Button>
        </div>
      </motion.form>
    </TravelerShell>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={id} className="text-sm">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
