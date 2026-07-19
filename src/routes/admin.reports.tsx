import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, FileSpreadsheet, Download, BarChart3, Users, Wallet, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/admin/reports")({ component: AdminReportsPage });

const ENTITY_MAP: Record<string, string> = {
  perf: "bookings",
  rev: "payments",
  hosts: "hosts",
  city: "travelers",
};

async function downloadCsv(entity: string, since?: string, until?: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Non authentifié");

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-csv`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ entity, since, until }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(json.error ?? `Erreur ${res.status}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${entity}-export.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const templates = [
  { id: "perf", icon: BarChart3, name: "Performance globale", desc: "KPI complets de la plateforme sur la période choisie." },
  { id: "rev", icon: Wallet, name: "Rapport financier", desc: "Revenus, commissions, frais de service et abonnements." },
  { id: "hosts", icon: Users, name: "Performance des hôtes", desc: "Top hôtes, classements, taux de réponse, occupancy." },
  { id: "city", icon: FileText, name: "Performance par ville", desc: "Activité, revenus et croissance ville par ville." },
];

function AdminReportsPage() {
  const [period, setPeriod] = useState("30");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [format, setFormat] = useState("csv");
  const [loading, setLoading] = useState<string | null>(null);

  function dateRange() {
    if (period === "custom") return { since: since || undefined, until: until || undefined };
    const days = parseInt(period);
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    return { since: from.toISOString(), until: now.toISOString() };
  }

  async function handleTemplateExport(templateId: string) {
    const entity = ENTITY_MAP[templateId] ?? "bookings";
    const { since: s, until: u } = dateRange();
    setLoading(templateId);
    try {
      await downloadCsv(entity, s, u);
      toast.success("Export téléchargé");
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur lors de l'export");
    } finally {
      setLoading(null);
    }
  }

  async function handleCustomExport() {
    if (format !== "csv") { toast.info("Seul le format CSV est disponible pour l'instant"); return; }
    const { since: s, until: u } = dateRange();
    setLoading("custom");
    try {
      await downloadCsv("bookings", s, u);
      toast.success("Export téléchargé");
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur lors de l'export");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <div className="grid sm:grid-cols-2 gap-3">
        {templates.map((t) => (
          <Card key={t.id} className="p-5 hover:shadow-card transition">
            <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center mb-3">
              <t.icon className="h-5 w-5" />
            </span>
            <h3 className="font-display font-semibold">{t.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
            <div className="flex items-center gap-2 mt-4">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={loading !== null}
                onClick={() => handleTemplateExport(t.id)}
              >
                {loading === t.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <FileText className="h-4 w-4 mr-1.5" />}
                CSV
              </Button>
              <Button size="sm" variant="outline" className="flex-1" disabled title="Export Excel à venir">
                <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5 h-fit space-y-4">
        <h3 className="font-display font-semibold">Rapport personnalisé</h3>
        <div>
          <Label>Période</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 derniers jours</SelectItem>
              <SelectItem value="30">30 derniers jours</SelectItem>
              <SelectItem value="90">90 derniers jours</SelectItem>
              <SelectItem value="365">12 mois</SelectItem>
              <SelectItem value="custom">Personnalisée</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {period === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Du</Label><Input type="date" className="mt-1.5" value={since} onChange={(e) => setSince(e.target.value)} /></div>
            <div><Label>Au</Label><Input type="date" className="mt-1.5" value={until} onChange={(e) => setUntil(e.target.value)} /></div>
          </div>
        )}
        <div>
          <Label>Format</Label>
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          className="w-full gradient-primary text-primary-foreground"
          disabled={loading !== null}
          onClick={handleCustomExport}
        >
          {loading === "custom"
            ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            : <Download className="h-4 w-4 mr-1.5" />}
          Générer
        </Button>
      </Card>
    </div>
  );
}
