import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download, Wallet, TrendingUp, ArrowDownToLine, FileText, Plus, Loader2, AlertCircle } from "lucide-react";
import { StatCard, MiniLineChart, StatusBadge, EmptyState } from "@/components/dashboard/widgets";
import { useHostRevenue } from "@/lib/host";
import { useCreateWithdrawal } from "@/lib/wallet";
import type { PaymentStatus, PayoutStatus, PayoutMethod } from "@/lib/host";

export const Route = createFileRoute("/host/revenue")({ component: HostRevenuePage });

// ── Helpers ──────────────────────────────────────────────────

function fmtFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtPeriod(start: string, end: string): string {
  const s = new Date(start).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const e = new Date(end).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  return `${s} – ${e}`;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  orange_money:  "Orange Money",
  moov_money:    "Moov Money",
  visa:          "Visa",
  mastercard:    "Mastercard",
  wallet_credit: "Crédit portefeuille",
};

const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  orange_money: "Orange Money",
  moov_money:   "Moov Money",
  bank:         "Virement bancaire",
};

const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  pending:    "En attente",
  approved:   "Approuvé",
  scheduled:  "Planifié",
  processing: "En cours",
  paid:       "Versé",
  failed:     "Échoué",
  on_hold:    "Suspendu",
  cancelled:  "Annulé",
  reversed:   "Remboursé",
};

function paymentBadgeKey(status: PaymentStatus): string {
  switch (status) {
    case "captured":             return "paid";
    case "refunded":
    case "partially_refunded":
    case "chargeback":           return "refunded";
    case "failed":               return "cancelled";
    default:                     return "pending";
  }
}

function payoutBadgeKey(status: PayoutStatus): string {
  switch (status) {
    case "paid":                     return "paid";
    case "processing":
    case "approved":                 return "active";
    case "failed":
    case "cancelled":
    case "reversed":                 return "cancelled";
    case "on_hold":                  return "cancelled";
    default:                         return "pending";
  }
}

// ── Withdrawal request dialog ─────────────────────────────────

function WithdrawalDialog({
  open,
  onClose,
  availableBalance,
  payoutMethod,
}: {
  open: boolean;
  onClose: () => void;
  availableBalance: number;
  payoutMethod: string | null;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(payoutMethod ?? "orange_money");
  const createWithdrawal = useCreateWithdrawal();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseInt(amount.replace(/\s/g, ""), 10);
    if (isNaN(amountNum) || amountNum < 5000) {
      toast.error("Le montant minimum est de 5 000 FCFA.");
      return;
    }
    if (amountNum > availableBalance) {
      toast.error(`Solde insuffisant. Disponible : ${availableBalance.toLocaleString("fr-FR")} FCFA`);
      return;
    }
    createWithdrawal.mutate(
      { amountFcfa: amountNum, method, idempotencyKey: `${Date.now()}-${amountNum}` },
      {
        onSuccess: () => {
          toast.success("Demande de retrait envoyée !");
          setAmount("");
          onClose();
        },
        onError: (e: Error) => {
          toast.error(e.message ?? "Erreur lors de la demande de retrait.");
        },
      }
    );
  }

  const amountNum = parseInt(amount.replace(/\s/g, ""), 10);
  const valid = !isNaN(amountNum) && amountNum >= 5000 && amountNum <= availableBalance;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Demande de retrait</DialogTitle>
          <DialogDescription>
            Solde disponible : <strong>{availableBalance.toLocaleString("fr-FR")} FCFA</strong>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Montant (FCFA)</Label>
            <Input
              id="amount"
              type="number"
              min={5000}
              max={availableBalance}
              step={500}
              placeholder="Ex : 50 000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">Minimum : 5 000 FCFA · Maximum journalier : 500 000 FCFA</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="method">Méthode de paiement</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="orange_money">Orange Money</SelectItem>
                <SelectItem value="moov_money">Moov Money</SelectItem>
                <SelectItem value="bank">Virement bancaire</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {createWithdrawal.error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{(createWithdrawal.error as Error).message}</span>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={!valid || createWithdrawal.isPending}>
              {createWithdrawal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Demander le retrait
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Skeleton ──────────────────────────────────────────────────

function RevenueSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[260px] rounded-xl" />
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <Skeleton className="h-5 w-48 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

function HostRevenuePage() {
  const { data, loading, error } = useHostRevenue();
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);

  if (loading) return <RevenueSkeleton />;

  if (error) {
    return (
      <Card className="p-10 text-center text-muted-foreground text-sm">
        Erreur lors du chargement des revenus : {error}
      </Card>
    );
  }

  if (!data || (data.transactions.length === 0 && data.payouts.length === 0)) {
    return (
      <EmptyState
        icon={Wallet}
        title="Aucune donnée financière"
        description="Vos paiements et versements apparaîtront ici dès que vous aurez des réservations confirmées."
      />
    );
  }

  const nextPayoutLabel = data.nextPayoutDate
    ? fmtDate(data.nextPayoutDate)
    : "—";

  // Derive available balance: total paid minus already-paid/processing payouts
  const totalPaid = data?.totalPaidFcfa ?? 0;
  const withdrawnTotal = (data?.payouts ?? [])
    .filter((p) => !["cancelled", "reversed", "failed"].includes(p.status))
    .reduce((s, p) => s + p.amount_fcfa, 0);
  const availableBalance = Math.max(0, totalPaid - withdrawnTotal);
  const payoutMethod = data?.payouts[0]?.method ?? null;

  return (
    <div className="space-y-6">
      <WithdrawalDialog
        open={withdrawalOpen}
        onClose={() => setWithdrawalOpen(false)}
        availableBalance={availableBalance}
        payoutMethod={payoutMethod}
      />

      {/* KPI row */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Revenus totaux"
          value={fmtFCFA(data.totalPaidFcfa)}
          icon={Wallet}
        />
        <StatCard
          label="Ce mois"
          value={fmtFCFA(data.monthlyRevenueFcfa)}
          icon={TrendingUp}
        />
        <StatCard
          label="Annuel projeté"
          value={fmtFCFA(data.yearlyProjectedFcfa)}
          icon={TrendingUp}
          accent="secondary"
        />
        <StatCard
          label="Prochain versement"
          value={data.nextPayoutAmountFcfa !== null ? fmtFCFA(data.nextPayoutAmountFcfa) : "—"}
          hint={nextPayoutLabel}
          icon={ArrowDownToLine}
          accent="muted"
        />
      </div>

      {/* Revenue chart */}
      {data.revenueChart.some((p) => p.value > 0) && (
        <MiniLineChart label="Évolution des revenus" data={data.revenueChart} height={220} />
      )}

      {/* Transactions table */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold">Transactions récentes</h3>
          <Button variant="outline" size="sm" disabled title="À venir">
            <Download className="h-4 w-4 mr-1.5" /> Exporter
          </Button>
        </div>

        {data.transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Aucune transaction.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Date</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Invité</TableHead>
                  <TableHead>Méthode</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right pr-5">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="pl-5 text-xs text-muted-foreground">
                      {fmtDate(t.captured_at ?? t.created_at)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {t.booking_reference ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {t.traveler_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {PAYMENT_METHOD_LABELS[t.method] ?? t.method}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={paymentBadgeKey(t.status)} />
                    </TableCell>
                    <TableCell className="text-right pr-5 font-semibold">
                      {fmtFCFA(t.amount_fcfa)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Payouts history */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold">Historique des versements</h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setWithdrawalOpen(true)}
              disabled={availableBalance < 5000}
            >
              <Plus className="h-4 w-4 mr-1.5" /> Demander un retrait
            </Button>
            <Button variant="outline" size="sm" disabled title="À venir">
              <FileText className="h-4 w-4 mr-1.5" /> Rapport PDF
            </Button>
          </div>
        </div>

        {data.payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Aucun versement.
          </p>
        ) : (
          <ul className="divide-y divide-border -my-2">
            {data.payouts.map((p) => (
              <li key={p.id} className="py-3 flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                  <ArrowDownToLine className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{fmtFCFA(p.amount_fcfa)}</p>
                  <p className="text-xs text-muted-foreground">
                    {PAYOUT_METHOD_LABELS[p.method] ?? p.method}
                    {" · "}
                    {fmtPeriod(p.period_start, p.period_end)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {PAYOUT_STATUS_LABELS[p.status]}
                    {p.paid_at && ` · versé le ${fmtDate(p.paid_at)}`}
                    {p.scheduled_for && p.status !== "paid" && ` · prévu le ${fmtDate(p.scheduled_for)}`}
                  </p>
                </div>
                <StatusBadge status={payoutBadgeKey(p.status)} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
