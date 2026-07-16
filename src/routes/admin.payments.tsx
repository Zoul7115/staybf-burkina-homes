import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { CreditCard, AlertCircle, RotateCcw, ArrowDownToLine, Loader2, CheckCircle, XCircle, Send, Banknote } from "lucide-react";
import { StatCard, StatusBadge } from "@/components/dashboard/widgets";
import { useAdminPayments } from "@/lib/admin";
import {
  useAdminWithdrawals,
  useApproveWithdrawal,
  useRejectWithdrawal,
  useDispatchWithdrawal,
  useCompleteWithdrawal,
} from "@/lib/wallet";
import type { AdminWithdrawalPayout } from "@/lib/wallet";

export const Route = createFileRoute("/admin/payments")({ component: PaymentsPage });

function fmtFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

// ── Payout status labels ──────────────────────────────────────

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  pending:    "En attente",
  approved:   "Approuvé",
  scheduled:  "Planifié",
  processing: "En cours",
  paid:       "Versé",
  failed:     "Échoué",
  on_hold:    "Suspendu",
  cancelled:  "Annulé",
  reversed:   "Annulé",
};

// ── Payout action dialogs ─────────────────────────────────────

type PayoutAction = "approve" | "reject" | "dispatch" | "complete";

function PayoutActionDialog({
  payout,
  action,
  onClose,
}: {
  payout: AdminWithdrawalPayout | null;
  action: PayoutAction | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [providerRef, setProviderRef] = useState("");

  const approve   = useApproveWithdrawal();
  const reject    = useRejectWithdrawal();
  const dispatch  = useDispatchWithdrawal();
  const complete  = useCompleteWithdrawal();

  if (!payout || !action) return null;

  const isPending = approve.isPending || reject.isPending || dispatch.isPending || complete.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!payout) return;

    const onSuccess = () => { toast.success("Action effectuée"); onClose(); setReason(""); setProviderRef(""); };
    const onError = (e: Error) => toast.error(e.message ?? "Erreur");

    if (action === "approve") {
      approve.mutate({ payoutId: payout.id }, { onSuccess, onError });
    } else if (action === "reject") {
      reject.mutate({ payoutId: payout.id, reason }, { onSuccess, onError });
    } else if (action === "dispatch") {
      dispatch.mutate({ payoutId: payout.id, providerPayoutId: providerRef || undefined }, { onSuccess, onError });
    } else if (action === "complete") {
      complete.mutate({ payoutId: payout.id, providerPayoutId: providerRef || undefined }, { onSuccess, onError });
    }
  }

  const ACTION_CONFIG: Record<PayoutAction, { title: string; description: string; confirmLabel: string; variant?: "destructive" }> = {
    approve:  { title: "Approuver le retrait", description: `Approuver le retrait de ${payout.amountFcfa.toLocaleString("fr-FR")} FCFA ?`, confirmLabel: "Approuver" },
    reject:   { title: "Rejeter le retrait", description: "Cette action annulera la demande et restituera le solde à l'hôte.", confirmLabel: "Rejeter", variant: "destructive" },
    dispatch: { title: "Traiter le retrait", description: "Marquer ce retrait comme en cours de traitement chez le prestataire.", confirmLabel: "Traiter" },
    complete: { title: "Marquer comme payé", description: "Confirmer que le virement a bien été effectué.", confirmLabel: "Confirmer le paiement" },
  };

  const cfg = ACTION_CONFIG[action];

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{cfg.title}</DialogTitle>
          <DialogDescription>{cfg.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          {action === "reject" && (
            <div className="space-y-1.5">
              <Label>Motif <span className="text-muted-foreground text-xs">(min 5 caractères)</span></Label>
              <Textarea
                rows={3}
                placeholder="Motif de rejet..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={5}
              />
            </div>
          )}
          {(action === "dispatch" || action === "complete") && (
            <div className="space-y-1.5">
              <Label>Référence prestataire <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
              <Input
                placeholder="Ex: OM-2026-12345"
                value={providerRef}
                onChange={(e) => setProviderRef(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button
              type="submit"
              variant={cfg.variant ?? "default"}
              disabled={isPending || (action === "reject" && reason.trim().length < 5)}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {cfg.confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Payouts panel ─────────────────────────────────────────────

function PayoutsPanel() {
  const { data: payouts = [], isLoading } = useAdminWithdrawals(["pending", "approved", "processing"]);
  const [selectedPayout, setSelectedPayout] = useState<AdminWithdrawalPayout | null>(null);
  const [action, setAction] = useState<PayoutAction | null>(null);

  function open(p: AdminWithdrawalPayout, a: PayoutAction) {
    setSelectedPayout(p);
    setAction(a);
  }
  function close() {
    setSelectedPayout(null);
    setAction(null);
  }

  if (isLoading) {
    return <Card className="p-5 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</Card>;
  }

  if (payouts.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Aucun retrait en attente de traitement.
      </Card>
    );
  }

  return (
    <>
      <PayoutActionDialog payout={selectedPayout} action={action} onClose={close} />
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-display font-semibold">Retraits à traiter</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hôte</TableHead>
              <TableHead>Méthode</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div>
                    <p className="text-sm font-medium">{p.hostName ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{p.hostEmail ?? "—"}</p>
                  </div>
                </TableCell>
                <TableCell className="text-xs capitalize">{p.method.replace(/_/g, " ")}</TableCell>
                <TableCell className="font-semibold">{fmtFCFA(p.amountFcfa)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(p.createdAt)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{PAYOUT_STATUS_LABELS[p.status] ?? p.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {p.status === "pending" && (
                      <>
                        <Button size="sm" variant="ghost" className="text-green-600" onClick={() => open(p, "approve")}>
                          <CheckCircle className="h-4 w-4 mr-1" /> Approuver
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => open(p, "reject")}>
                          <XCircle className="h-4 w-4 mr-1" /> Rejeter
                        </Button>
                      </>
                    )}
                    {p.status === "approved" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => open(p, "dispatch")}>
                          <Send className="h-4 w-4 mr-1" /> Traiter
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => open(p, "reject")}>
                          <XCircle className="h-4 w-4 mr-1" /> Rejeter
                        </Button>
                      </>
                    )}
                    {p.status === "processing" && (
                      <Button size="sm" variant="ghost" className="text-green-600" onClick={() => open(p, "complete")}>
                        <Banknote className="h-4 w-4 mr-1" /> Marquer payé
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

// ── Main payments page ────────────────────────────────────────

function PaymentsPage() {
  const { payments, loading, error, refundPayment, actioning } = useAdminPayments();
  const [refundTarget, setRefundTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-4"><Skeleton className="h-16 w-full" /></Card>)}
        </div>
        <Card className="p-5 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </Card>
      </div>
    );
  }

  if (error) {
    return <Card className="p-10 text-center text-muted-foreground text-sm">Erreur : {error}</Card>;
  }

  const failed = payments.filter((p) => p.status === "failed").length;
  const refunds = payments.filter((p) => p.status === "refunded").length;
  const total = payments.filter((p) => p.status === "captured").reduce((s, p) => s + p.amountFcfa, 0);

  async function handleRefund() {
    if (!refundTarget) return;
    try {
      await refundPayment(refundTarget, reason);
      toast.success("Remboursement initié");
      setRefundTarget(null);
      setReason("");
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-4 gap-3">
        <StatCard label="Volume traité" value={fmtFCFA(total)} icon={CreditCard} />
        <StatCard label="Paiements" value={payments.length} icon={CreditCard} accent="secondary" />
        <StatCard label="Échecs" value={failed} icon={AlertCircle} accent="destructive" />
        <StatCard label="Remboursements" value={refunds} icon={RotateCcw} accent="muted" />
      </div>

      <PayoutsPanel />

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-semibold">Transactions</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Réservation</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Méthode</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                  Aucun paiement.
                </TableCell>
              </TableRow>
            )}
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.bookingReference ?? "—"}</TableCell>
                <TableCell className="text-sm font-medium">{p.payerName ?? "—"}</TableCell>
                <TableCell className="text-xs">{p.method ?? "—"}</TableCell>
                <TableCell className="text-sm font-semibold">{fmtFCFA(p.amountFcfa)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(p.createdAt)}</TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
                <TableCell className="text-right">
                  {p.status === "captured" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={actioning}
                      onClick={() => setRefundTarget(p.id)}
                    >
                      Rembourser
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={refundTarget !== null} onOpenChange={(v) => { if (!v) { setRefundTarget(null); setReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rembourser le paiement</DialogTitle>
            <DialogDescription>
              Le paiement passera en statut «&nbsp;remboursement en attente&nbsp;». Précisez le motif.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Motif <span className="text-muted-foreground text-xs">(10 caractères min)</span></Label>
            <Textarea rows={3} className="mt-1.5" placeholder="Motif du remboursement..." value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRefundTarget(null); setReason(""); }}>Annuler</Button>
            <Button variant="destructive" disabled={actioning || reason.trim().length < 10} onClick={handleRefund}>
              {actioning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
