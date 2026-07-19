// ============================================================
// useWithdrawals — React Query hooks for the withdrawal engine
//
// Host hooks:
//   useWithdrawals()         — host's payout history
//   useCreateWithdrawal()    — submit a new withdrawal request
//
// Admin hooks:
//   useAdminWithdrawals()    — all pending/approved payouts
//   useApproveWithdrawal()   — pending → approved
//   useRejectWithdrawal()    — pending/approved → cancelled
//   useDispatchWithdrawal()  — approved → processing
//   useCompleteWithdrawal()  — processing → paid
// ============================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/storage";
import { queryKeys } from "@/lib/query/keys";
import type { PayoutStatus } from "./types";

// ── Shared payout shape ───────────────────────────────────────

export type HostPayout = {
  id: string;
  hostId: string;
  status: PayoutStatus;
  amountFcfa: number;
  currency: "XOF";
  method: string;
  payoutAccountSnapshot: string;
  periodStart: string;
  periodEnd: string;
  approvedAt: string | null;
  approvedBy: string | null;
  dispatchedAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  retryCount: number;
  createdAt: string;
};

type RawPayoutRow = {
  id: string; host_id: string; status: string; amount_fcfa: number;
  method: string; payout_account_snapshot: string;
  period_start: string; period_end: string;
  approved_at: string | null; approved_by: string | null;
  dispatched_at: string | null; paid_at: string | null;
  failed_at: string | null; failure_reason: string | null;
  cancelled_at: string | null; cancel_reason: string | null;
  retry_count: number; created_at: string;
};

function mapPayout(r: RawPayoutRow): HostPayout {
  return {
    id: r.id,
    hostId: r.host_id,
    status: r.status as PayoutStatus,
    amountFcfa: r.amount_fcfa,
    currency: "XOF",
    method: r.method,
    payoutAccountSnapshot: r.payout_account_snapshot,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by,
    dispatchedAt: r.dispatched_at,
    paidAt: r.paid_at,
    failedAt: r.failed_at,
    failureReason: r.failure_reason,
    cancelledAt: r.cancelled_at,
    cancelReason: r.cancel_reason && r.cancel_reason.startsWith("idem:") ? null : r.cancel_reason,
    retryCount: r.retry_count,
    createdAt: r.created_at,
  };
}

const PAYOUT_SELECT = [
  "id", "host_id", "status", "amount_fcfa", "method", "payout_account_snapshot",
  "period_start", "period_end", "approved_at", "approved_by",
  "dispatched_at", "paid_at", "failed_at", "failure_reason",
  "cancelled_at", "cancel_reason", "retry_count", "created_at",
].join(", ");

// ── Host: payout history ──────────────────────────────────────

async function fetchHostWithdrawals(): Promise<HostPayout[]> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error("Non authentifié");

  const { data, error } = await (supabase as any)
    .from("payouts")
    .select(PAYOUT_SELECT)
    .eq("host_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return ((data ?? []) as RawPayoutRow[]).map(mapPayout);
}

export function useWithdrawals() {
  return useQuery({
    queryKey: queryKeys.hostRevenue(),
    queryFn: fetchHostWithdrawals,
    staleTime: 30_000,
  });
}

// ── Host: create withdrawal ───────────────────────────────────

type CreateWithdrawalInput = {
  amountFcfa: number;
  method: string;
  idempotencyKey?: string;
};

export function useCreateWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWithdrawalInput) =>
      callEdgeFunction("process-withdrawal", {
        amount_fcfa:      input.amountFcfa,
        method:           input.method,
        idempotency_key:  input.idempotencyKey,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.hostRevenue() });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
  });
}

// ── Admin: all payouts ────────────────────────────────────────

export type AdminPayout = HostPayout & {
  hostName: string | null;
  hostEmail: string | null;
};

type RawAdminPayoutRow = RawPayoutRow & {
  profiles: { full_name: string | null; email: string | null } | null;
};

const ADMIN_PAGE_SIZE = 50;

async function fetchAdminWithdrawals(statusFilter?: PayoutStatus[], page = 0): Promise<AdminPayout[]> {
  const from = page * ADMIN_PAGE_SIZE;
  const to   = from + ADMIN_PAGE_SIZE - 1;

  let q = (supabase as any)
    .from("payouts")
    .select(`${PAYOUT_SELECT}, profiles:host_id ( full_name, email )`)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (statusFilter && statusFilter.length > 0) {
    q = q.in("status", statusFilter);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return ((data ?? []) as RawAdminPayoutRow[]).map((r) => ({
    ...mapPayout(r),
    hostName: r.profiles?.full_name ?? null,
    hostEmail: r.profiles?.email ?? null,
  }));
}

export function useAdminWithdrawals(statusFilter?: PayoutStatus[], page = 0) {
  return useQuery({
    queryKey: [...queryKeys.adminPayouts(), statusFilter ?? "all", page],
    queryFn: () => fetchAdminWithdrawals(statusFilter, page),
    staleTime: 15_000,
  });
}

// ── Admin: approve withdrawal ─────────────────────────────────

export function useApproveWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payoutId, note }: { payoutId: string; note?: string }) =>
      callEdgeFunction("approve-withdrawal", { payout_id: payoutId, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminPayouts() });
    },
  });
}

// ── Admin: reject withdrawal ──────────────────────────────────

export function useRejectWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ payoutId, reason }: { payoutId: string; reason: string }) =>
      callEdgeFunction("reject-withdrawal", { payout_id: payoutId, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminPayouts() });
    },
  });
}

// ── Admin: dispatch withdrawal (approved → processing) ────────

export function useDispatchWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      payoutId,
      providerPayoutId,
      note,
    }: { payoutId: string; providerPayoutId?: string; note?: string }) =>
      callEdgeFunction("dispatch-withdrawal", {
        payout_id:          payoutId,
        provider_payout_id: providerPayoutId,
        note,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminPayouts() });
    },
  });
}

// ── Admin: complete withdrawal (processing → paid) ────────────

export function useCompleteWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      payoutId,
      providerPayoutId,
      note,
    }: { payoutId: string; providerPayoutId?: string; note?: string }) =>
      callEdgeFunction("complete-withdrawal", {
        payout_id:          payoutId,
        provider_payout_id: providerPayoutId,
        note,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminPayouts() });
    },
  });
}
