import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { callEdgeFunction } from "@/lib/storage";
import type { AdminPaymentRow } from "./types";

type RawRow = {
  id: string; amount_fcfa: number; currency: string; status: string; payment_method: string | null;
  created_at: string; captured_at: string | null;
  bookings: { reference: string; profiles: { full_name: string | null } | { full_name: string | null }[] | null } | { reference: string; profiles: unknown }[] | null;
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function fetchAdminPayments(): Promise<AdminPaymentRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbErr } = await (supabase as any)
    .from("payments")
    .select(`id,amount_fcfa,currency,status,payment_method,created_at,captured_at,bookings!booking_id(reference,profiles!traveler_id(full_name))`)
    .order("created_at", { ascending: false })
    .limit(300);

  if (dbErr) throw new Error(dbErr.message);

  return ((data ?? []) as RawRow[]).map((p) => {
    const booking = unwrap(p.bookings);
    const payer = booking ? unwrap((booking as { reference: string; profiles: unknown }).profiles as RawRow["bookings"]) : null;
    const payerObj = payer as { full_name: string | null } | null;
    const bookingObj = booking as { reference: string } | null;
    return {
      id: p.id, bookingReference: bookingObj?.reference ?? null, payerName: payerObj?.full_name ?? null,
      method: p.payment_method, amountFcfa: p.amount_fcfa, currency: p.currency ?? "XOF",
      status: p.status, createdAt: p.created_at, capturedAt: p.captured_at,
    };
  });
}

export type UseAdminPaymentsReturn = {
  payments: AdminPaymentRow[];
  loading: boolean;
  error: string | null;
  refundPayment: (paymentId: string, reason: string) => Promise<void>;
  actioning: boolean;
  actionError: string | null;
};

export function useAdminPayments(): UseAdminPaymentsReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.adminPayments();

  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: fetchAdminPayments });

  const refundMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      callEdgeFunction("refund-payment", { payment_id: paymentId, reason }),
    onMutate: async ({ paymentId }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<AdminPaymentRow[]>(KEY);
      queryClient.setQueryData<AdminPaymentRow[]>(KEY, (old) =>
        (old ?? []).map((p) => p.id === paymentId ? { ...p, status: "refund_pending" } : p)
      );
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  return {
    payments: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refundPayment: (paymentId, reason) => refundMutation.mutateAsync({ paymentId, reason }).then(() => undefined),
    actioning: refundMutation.isPending,
    actionError: refundMutation.error?.message ?? null,
  };
}
