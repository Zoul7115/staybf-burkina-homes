import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download, Wallet, TrendingUp, ArrowDownToLine, FileText } from "lucide-react";
import { StatCard, MiniLineChart, StatusBadge, EmptyState } from "@/components/dashboard/widgets";
import { useHostRevenue } from "@/lib/host";
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
  scheduled:  "Planifié",
  processing: "En cours",
  paid:       "Versé",
  failed:     "Échoué",
  on_hold:    "Suspendu",
  reversed:   "Annulé",
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
    case "paid":        return "paid";
    case "processing":  return "active";
    case "failed":
    case "reversed":    return "cancelled";
    case "on_hold":     return "cancelled";
    default:            return "pending";
  }
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

  return (
    <div className="space-y-6">
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
          <Button variant="outline" size="sm" disabled title="À venir">
            <FileText className="h-4 w-4 mr-1.5" /> Rapport PDF
          </Button>
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
