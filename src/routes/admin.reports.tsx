import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, FileSpreadsheet, Download, BarChart3, Users, Wallet } from "lucide-react";

export const Route = createFileRoute("/admin/reports")({ component: AdminReportsPage });

const templates = [
  { id: "perf", icon: BarChart3, name: "Performance globale", desc: "KPI complets de la plateforme sur la période choisie." },
  { id: "rev", icon: Wallet, name: "Rapport financier", desc: "Revenus, commissions, frais de service et abonnements." },
  { id: "hosts", icon: Users, name: "Performance des hôtes", desc: "Top hôtes, classements, taux de réponse, occupancy." },
  { id: "city", icon: FileText, name: "Performance par ville", desc: "Activité, revenus et croissance ville par ville." },
];

function AdminReportsPage() {
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <div className="grid sm:grid-cols-2 gap-3">
        {templates.map((t) => (
          <Card key={t.id} className="p-5 hover:shadow-card transition">
            <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center mb-3"><t.icon className="h-5 w-5" /></span>
            <h3 className="font-display font-semibold">{t.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
            <div className="flex items-center gap-2 mt-4">
              <Button size="sm" variant="outline" className="flex-1"><FileText className="h-4 w-4 mr-1.5" /> PDF</Button>
              <Button size="sm" variant="outline" className="flex-1"><FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel</Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5 h-fit space-y-4">
        <h3 className="font-display font-semibold">Rapport personnalisé</h3>
        <div><Label>Période</Label>
          <Select defaultValue="30"><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 derniers jours</SelectItem>
              <SelectItem value="30">30 derniers jours</SelectItem>
              <SelectItem value="90">90 derniers jours</SelectItem>
              <SelectItem value="365">12 mois</SelectItem>
              <SelectItem value="custom">Personnalisée</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Du</Label><Input type="date" className="mt-1.5" /></div>
          <div><Label>Au</Label><Input type="date" className="mt-1.5" /></div>
        </div>
        <div><Label>Format</Label>
          <Select defaultValue="pdf"><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button className="w-full gradient-primary text-primary-foreground"><Download className="h-4 w-4 mr-1.5" /> Générer</Button>
      </Card>
    </div>
  );
}
