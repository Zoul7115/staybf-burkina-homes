import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Search, Eye, Loader2 } from "lucide-react";
import { useAdminProperties } from "@/lib/admin";
import { StatusBadge } from "@/components/dashboard/widgets";

export const Route = createFileRoute("/admin/properties")({ component: AdminPropertiesPage });

// ── Reason dialog ─────────────────────────────────────────────

function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = "default",
  onConfirm,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  onConfirm: (reason: string) => Promise<void>;
  saving: boolean;
}) {
  const [reason, setReason] = useState("");

  async function handleConfirm() {
    await onConfirm(reason);
    setReason("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setReason(""); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div>
          <Label>Motif <span className="text-muted-foreground text-xs">(10 caractères min)</span></Label>
          <Textarea
            rows={3}
            className="mt-1.5"
            placeholder="Expliquez la décision..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button
            variant={confirmVariant}
            className={confirmVariant === "default" ? "gradient-primary text-primary-foreground" : ""}
            disabled={saving || reason.trim().length < 10}
            onClick={handleConfirm}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ────────────────────────────────────────────────

function AdminPropertiesPage() {
  const { properties, loading, error, approveProperty, rejectProperty, actioning } = useAdminProperties();
  const [q, setQ] = useState("");
  const [approveTarget, setApproveTarget] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  const filt = (s: string) =>
    properties.filter((p) => (s === "all" || p.status === s) && p.name.toLowerCase().includes(q.toLowerCase()));

  const tabs = [
    { value: "pending_review", label: "En attente" },
    { value: "published", label: "Approuvées" },
    { value: "rejected", label: "Refusées" },
    { value: "suspended", label: "Suspendues" },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="p-4"><Skeleton className="h-36 w-full" /></Card>)}
        </div>
      </div>
    );
  }

  if (error) {
    return <Card className="p-10 text-center text-muted-foreground text-sm">Erreur : {error}</Card>;
  }

  async function handleApprove(propertyId: string, reason: string) {
    try {
      await approveProperty(propertyId, reason);
      toast.success("Propriété approuvée et publiée");
      setApproveTarget(null);
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur");
    }
  }

  async function handleReject(propertyId: string, reason: string) {
    try {
      await rejectProperty(propertyId, reason);
      toast.success("Propriété refusée");
      setRejectTarget(null);
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur");
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher..." className="pl-9" />
      </div>

      <Tabs defaultValue="pending_review">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label} ({filt(t.value).length})
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map(({ value }) => (
          <TabsContent key={value} value={value} className="mt-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filt(value).map((p) => (
                <Card key={p.id} className="p-4 hover:shadow-card transition">
                  <div className="aspect-video rounded-xl bg-gradient-to-br from-primary/15 to-secondary/15 mb-3 grid place-items-center text-xs text-muted-foreground font-semibold">
                    {p.propertyType ?? "Propriété"}
                  </div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-display font-semibold truncate">{p.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.hostName ?? "—"} · {p.cityName ?? "—"}
                      </p>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{p.roomsCount} chambre(s)</p>
                  <div className="flex items-center gap-2">
                    {value === "pending_review" ? (
                      <>
                        <Button
                          size="sm"
                          className="flex-1 gradient-primary text-primary-foreground"
                          disabled={actioning}
                          onClick={() => setApproveTarget(p.id)}
                        >
                          Approuver
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actioning}
                          onClick={() => setRejectTarget(p.id)}
                        >
                          Refuser
                        </Button>
                      </>
                    ) : value === "published" ? (
                      <>
                        <Button size="sm" variant="outline" className="flex-1">
                          <Eye className="h-4 w-4 mr-1" /> Voir
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actioning}
                          onClick={() => setRejectTarget(p.id)}
                        >
                          Dépublier
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="flex-1" disabled title="Contactez le support pour réactiver">
                        Réactiver
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
              {filt(value).length === 0 && (
                <Card className="p-10 text-center text-sm text-muted-foreground col-span-full">
                  Aucune propriété.
                </Card>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <ReasonDialog
        open={approveTarget !== null}
        onOpenChange={(v) => { if (!v) setApproveTarget(null); }}
        title="Approuver la propriété"
        description="La propriété sera publiée et visible par les voyageurs. Précisez le motif d'approbation."
        confirmLabel="Approuver"
        onConfirm={(reason) => handleApprove(approveTarget!, reason)}
        saving={actioning}
      />

      <ReasonDialog
        open={rejectTarget !== null}
        onOpenChange={(v) => { if (!v) setRejectTarget(null); }}
        title="Refuser / Dépublier la propriété"
        description="La propriété sera retirée de la plateforme. L'hôte sera notifié avec le motif."
        confirmLabel="Confirmer"
        confirmVariant="destructive"
        onConfirm={(reason) => handleReject(rejectTarget!, reason)}
        saving={actioning}
      />
    </div>
  );
}
