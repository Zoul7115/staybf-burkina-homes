import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Mail, MessageCircle, Bell, Send, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/storage";

export const Route = createFileRoute("/admin/notifications")({ component: AdminNotificationsPage });

// ── Audience segments ─────────────────────────────────────────

type Segment = { id: string; label: string; fetchIds: () => Promise<string[]> };

const SEGMENTS: Segment[] = [
  {
    id: "all",
    label: "Tous les utilisateurs",
    fetchIds: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("profiles").select("id").eq("account_status", "active");
      return ((data ?? []) as { id: string }[]).map((r) => r.id);
    },
  },
  {
    id: "travelers",
    label: "Voyageurs actifs",
    fetchIds: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("user_roles").select("user_id").eq("role", "traveler");
      return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
    },
  },
  {
    id: "hosts",
    label: "Hôtes vérifiés",
    fetchIds: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("host_profiles").select("id").eq("verification_status", "verified");
      return ((data ?? []) as { id: string }[]).map((r) => r.id);
    },
  },
];

// ── Counts hook ───────────────────────────────────────────────

function useSegmentCounts() {
  return useQuery({
    queryKey: ["admin", "segment-counts"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [allRes, travelersRes, hostsRes] = await Promise.all([
        (supabase as any).from("profiles").select("id", { count: "exact", head: true }).eq("account_status", "active"),
        (supabase as any).from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "traveler"),
        (supabase as any).from("host_profiles").select("id", { count: "exact", head: true }).eq("verification_status", "verified"),
      ]);
      return { all: allRes.count ?? 0, travelers: travelersRes.count ?? 0, hosts: hostsRes.count ?? 0 };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── Main page ─────────────────────────────────────────────────

function AdminNotificationsPage() {
  return (
    <Tabs defaultValue="push" className="space-y-4">
      <TabsList>
        <TabsTrigger value="push"><Bell className="h-4 w-4 mr-1.5" /> Push</TabsTrigger>
        <TabsTrigger value="email"><Mail className="h-4 w-4 mr-1.5" /> Email</TabsTrigger>
        <TabsTrigger value="sms"><MessageCircle className="h-4 w-4 mr-1.5" /> SMS</TabsTrigger>
      </TabsList>

      <TabsContent value="push">
        <PushComposer />
      </TabsContent>
      <TabsContent value="email">
        <StaticComposer label="Campagne email" placeholder="Objet de l'email" rich />
      </TabsContent>
      <TabsContent value="sms">
        <StaticComposer label="Campagne SMS" placeholder="Sujet interne" sms />
      </TabsContent>
    </Tabs>
  );
}

// ── Push composer (wired) ─────────────────────────────────────

function PushComposer() {
  const { data: counts } = useSegmentCounts();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedSegment, setSelectedSegment] = useState("all");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!title.trim()) { toast.error("Le titre est requis"); return; }
    const segment = SEGMENTS.find((s) => s.id === selectedSegment);
    if (!segment) return;
    setSending(true);
    try {
      const user_ids = await segment.fetchIds();
      if (user_ids.length === 0) { toast.error("Aucun destinataire dans ce segment"); return; }
      const result = await callEdgeFunction<{ sent: number }>("send-notification", {
        user_ids,
        type: "admin_broadcast",
        title: title.trim(),
        body: body.trim() || null,
      });
      toast.success(`Notification envoyée à ${result.sent} utilisateur(s)`);
      setTitle("");
      setBody("");
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  }

  const countMap: Record<string, number> = {
    all: counts?.all ?? 0,
    travelers: counts?.travelers ?? 0,
    hosts: counts?.hosts ?? 0,
  };

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <Card className="p-5 space-y-4">
        <h3 className="font-display font-semibold">Notification push</h3>
        <div>
          <Label>Titre <span className="text-muted-foreground text-xs">(50 car. max)</span></Label>
          <Input className="mt-1.5" placeholder="Titre court — 50 caractères max" value={title} maxLength={50} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Message</Label>
          <Textarea rows={6} className="mt-1.5" placeholder="Votre message" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button
            className="gradient-primary text-primary-foreground"
            disabled={sending || !title.trim()}
            onClick={handleSend}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
            Envoyer
          </Button>
        </div>
      </Card>
      <Card className="p-5 h-fit">
        <h3 className="font-display font-semibold mb-3">Audience</h3>
        <div className="space-y-2.5">
          {SEGMENTS.map((seg) => (
            <label key={seg.id} className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
              <Checkbox
                checked={selectedSegment === seg.id}
                onCheckedChange={() => setSelectedSegment(seg.id)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <p className="font-semibold text-sm">{seg.label}</p>
                <p className="text-xs text-muted-foreground">
                  {counts ? `${countMap[seg.id].toLocaleString("fr-FR")} personnes` : "Chargement…"}
                </p>
              </div>
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Static composers (email / SMS — no EF yet) ────────────────

function StaticComposer({ label, placeholder, rich, sms }: { label: string; placeholder: string; rich?: boolean; sms?: boolean }) {
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
        <div className="flex gap-2 justify-end">
          <Button disabled title="Canaux email/SMS à venir">
            <Send className="h-4 w-4 mr-1.5" /> Envoyer
          </Button>
        </div>
      </Card>
      <Card className="p-5 h-fit">
        <h3 className="font-display font-semibold mb-3">Audience</h3>
        <p className="text-xs text-muted-foreground">Disponible avec le canal push. Email et SMS à venir.</p>
      </Card>
    </div>
  );
}
