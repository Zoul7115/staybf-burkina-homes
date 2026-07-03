import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Send } from "lucide-react";
import { useAdminSupport } from "@/lib/admin";
import { cn } from "@/lib/utils";
import type { AdminTicketRow } from "@/lib/admin";

export const Route = createFileRoute("/admin/support")({ component: AdminSupportPage });

const prioColor: Record<string, string> = {
  p1: "bg-destructive/10 text-destructive border-destructive/20",
  p2: "bg-secondary/20 text-secondary-foreground border-secondary/30",
  p3: "bg-primary/10 text-primary border-primary/20",
  p4: "bg-muted text-muted-foreground border-border",
};

const prioLabel: Record<string, string> = { p1: "urgent", p2: "high", p3: "medium", p4: "low" };

const statusColor: Record<string, string> = {
  open: "bg-destructive/10 text-destructive",
  in_progress: "bg-secondary/20 text-secondary-foreground",
  resolved: "bg-primary/10 text-primary",
  closed: "bg-muted text-muted-foreground",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function AdminSupportPage() {
  const { tickets, loading, error, sendReply, sending, sendError } = useAdminSupport();
  const [activeTicket, setActiveTicket] = useState<AdminTicketRow | null>(null);
  const [replyBody, setReplyBody] = useState("Bonjour, nous avons vérifié votre dossier et le paiement sera crédité sous 24h. Merci pour votre patience.");

  async function handleSend() {
    if (!activeTicket || !replyBody.trim()) return;
    await sendReply(activeTicket.id, replyBody);
    if (!sendError) setReplyBody("");
  }

  if (loading) {
    return (
      <div className="grid lg:grid-cols-[1fr_360px] gap-5">
        <Card className="p-5 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </Card>
        <Card className="p-5"><Skeleton className="h-48 w-full" /></Card>
      </div>
    );
  }

  if (error) {
    return <Card className="p-10 text-center text-muted-foreground text-sm">Erreur : {error}</Card>;
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-semibold">Tickets de support</h3>
          <Badge>{tickets.length} ouverts</Badge>
        </div>
        {tickets.length === 0 ? (
          <p className="p-10 text-center text-xs text-muted-foreground">Aucun ticket ouvert.</p>
        ) : (
          <ul className="divide-y divide-border">
            {tickets.map((t) => (
              <li
                key={t.id}
                className={cn("p-4 hover:bg-muted/40 transition cursor-pointer", activeTicket?.id === t.id && "bg-muted/40")}
                onClick={() => setActiveTicket(t)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm truncate">{t.subject}</p>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase", prioColor[t.priority] ?? prioColor.p4)}>
                        {prioLabel[t.priority] ?? t.priority}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      de {t.requesterName ?? t.requesterEmail ?? "—"} · {fmtDate(t.updatedAt)}
                    </p>
                  </div>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", statusColor[t.status] ?? "bg-muted text-muted-foreground")}>
                    {t.status.replace("_", " ")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5 h-fit">
        <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" /> Réponse rapide
        </h3>
        <div className="space-y-3">
          <Input
            placeholder="Sujet"
            value={activeTicket ? `Re: ${activeTicket.subject}` : "Sélectionnez un ticket"}
            readOnly
          />
          <Textarea rows={5} placeholder="Votre réponse..." value={replyBody} onChange={(e) => setReplyBody(e.target.value)} />
          {sendError && <p className="text-xs text-destructive">{sendError}</p>}
          <Button
            className="w-full gradient-primary text-primary-foreground"
            onClick={handleSend}
            disabled={!activeTicket || !replyBody.trim() || sending}
          >
            <Send className="h-4 w-4 mr-1.5" />
            {sending ? "Envoi…" : "Envoyer"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
