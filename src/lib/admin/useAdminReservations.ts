import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { callEdgeFunction } from "@/lib/storage";
import type { AdminBookingRow } from "./types";

type RawRow = {
  id: string; reference: string; status: string; check_in: string; check_out: string;
  nights: number; total_amount: number; currency: string; created_at: string;
  payments: { id: string; status: string }[] | null;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
  rooms: { name: string; properties: { name: string; host_profiles: { profiles: { full_name: string | null } | { full_name: string | null }[] | null } | unknown[] | null } | { name: string; host_profiles: unknown }[] | null } | { name: string; properties: unknown }[] | null;
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function fetchAdminReservations(): Promise<AdminBookingRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbErr } = await (supabase as any)
    .from("bookings")
    .select(`id,reference,status,check_in,check_out,nights,total_amount,currency,created_at,payments!booking_id(id,status),profiles!traveler_id(full_name),rooms!room_id(name,properties!property_id(name,host_profiles!host_id(profiles!id(full_name))))`)
    .order("created_at", { ascending: false })
    .limit(300);

  if (dbErr) throw new Error(dbErr.message);

  return ((data ?? []) as RawRow[]).map((b) => {
    const traveler = unwrap(b.profiles);
    const room = unwrap(b.rooms as RawRow["rooms"]);
    const roomObj = room as { name: string; properties: unknown } | null;
    const propRaw = roomObj ? (Array.isArray(roomObj.properties) ? roomObj.properties[0] : roomObj.properties) : null;
    const propObj = propRaw as { name: string; host_profiles: unknown } | null;
    const hpRaw = propObj?.host_profiles;
    const hp = hpRaw ? (Array.isArray(hpRaw) ? hpRaw[0] : hpRaw) as { profiles: unknown } | null : null;
    const hostProfileRaw = hp?.profiles;
    const host = hostProfileRaw ? (Array.isArray(hostProfileRaw) ? hostProfileRaw[0] : hostProfileRaw) as { full_name: string | null } | null : null;
    const capturedPayment = (b.payments ?? []).find((p) => p.status === "captured");
    return {
      id: b.id, reference: b.reference, status: b.status, checkIn: b.check_in, checkOut: b.check_out,
      nights: b.nights, totalAmount: b.total_amount, currency: b.currency,
      paymentStatus: capturedPayment?.status ?? (b.payments ?? [])[0]?.status ?? null,
      capturedPaymentId: capturedPayment?.id ?? null,
      travelerName: traveler?.full_name ?? null, hostName: host?.full_name ?? null,
      propertyName: propObj?.name ?? null, roomName: roomObj?.name ?? null, createdAt: b.created_at,
    };
  });
}

export type UseAdminReservationsReturn = {
  bookings: AdminBookingRow[];
  loading: boolean;
  error: string | null;
  refundPayment: (paymentId: string, reason: string) => Promise<void>;
  actioning: boolean;
  actionError: string | null;
};

export function useAdminReservations(): UseAdminReservationsReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.adminReservations();

  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: fetchAdminReservations });

  const refundMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      callEdgeFunction("refund-payment", { payment_id: paymentId, reason }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: KEY });
      await queryClient.cancelQueries({ queryKey: queryKeys.adminPayments() });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: queryKeys.adminPayments() });
    },
  });

  return {
    bookings: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refundPayment: (paymentId, reason) => refundMutation.mutateAsync({ paymentId, reason }).then(() => undefined),
    actioning: refundMutation.isPending,
    actionError: refundMutation.error?.message ?? null,
  };
}
