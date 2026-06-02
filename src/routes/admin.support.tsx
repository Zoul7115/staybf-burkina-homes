import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send } from "lucide-react";
import { adminTickets } from "@/lib/staybf-admin-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/support")({ component: AdminSupportPage });

const prioColor: Record<string, string> = {
  urgent: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-secondary/20 text-secondary-foreground border-secondary/30",
  medium: "bg-primary/10 text-primary border-primary/20",
  low: "bg-muted text-muted-foreground border-border",
};

const statusColor: Record<string, string> = {
  open: "bg-destructive/10 text-destructive",
  in_progress: "bg-secondary/20 text-secondary-foreground",
  resolved: "bg-primary/10 text-primary",
  closed: "bg-muted text-muted-foreground",
};

function AdminSupportPage() {
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-semibold">Tickets de support</h3>
          <Badge>{adminTickets.length} ouverts</Badge>
        </div>
        <ul className="divide-y divide-border">
          {adminTickets.map((t) => (
            <li key={t.id} className="p-4 hover:bg-muted/40 transition cursor-pointer">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-sm truncate">{t.subject}</p>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase", prioColor[t.priority])}>{t.priority}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">de {t.from} · {t.updated}</p>
                </div>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", statusColor[t.status])}>
                  {t.status.replace("_", " ")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5 h-fit">
        <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /> Réponse rapide</h3>
        <div className="space-y-3">
          <Input placeholder="Sujet" defaultValue="Re: Paiement non reçu" />
          <Textarea rows={5} placeholder="Votre réponse..." defaultValue="Bonjour, nous avons vérifié votre dossier et le paiement sera crédité sous 24h. Merci pour votre patience." />
          <Button className="w-full gradient-primary text-primary-foreground"><Send className="h-4 w-4 mr-1.5" /> Envoyer</Button>
        </div>
      </Card>
    </div>
  );
}
