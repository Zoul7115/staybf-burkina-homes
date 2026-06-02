import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Camera, Check } from "lucide-react";
import { toast } from "sonner";
import { TravelerShell } from "@/components/traveler/TravelerShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { traveler } from "@/lib/staybf-traveler-data";

export const Route = createFileRoute("/traveler/profile")({
  head: () => ({ meta: [{ title: "Profil — StayBF" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const [form, setForm] = useState({ ...traveler });
  const [saved, setSaved] = useState(false);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    toast.success("Profil mis à jour");
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <TravelerShell title="Profil">
      <motion.form
        onSubmit={save}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto rounded-3xl bg-card border border-border p-6 md:p-8 shadow-card"
      >
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative">
            <div className="h-24 w-24 rounded-full gradient-primary text-primary-foreground grid place-items-center font-bold text-3xl">
              {form.avatar}
            </div>
            <button type="button" className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full bg-card border border-border grid place-items-center shadow-card hover:scale-110 transition">
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <div className="text-center sm:text-left">
            <h2 className="font-display font-bold text-2xl">{form.firstName} {form.lastName}</h2>
            <p className="text-sm text-muted-foreground">Voyageur depuis {form.joined}</p>
          </div>
        </div>

        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <Field id="fn" label="Prénom"><Input id="fn" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="h-11" /></Field>
          <Field id="ln" label="Nom"><Input id="ln" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="h-11" /></Field>
          <Field id="em" label="Email"><Input id="em" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11" /></Field>
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
          <Button type="button" variant="outline" className="rounded-xl">Annuler</Button>
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
