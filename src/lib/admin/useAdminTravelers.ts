import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { AdminTravelerRow } from "./types";

type RawProfile = { id: string; full_name: string | null; email: string | null; avatar_url: string | null; account_status: string; created_at: string };
type RawBookingCount = { traveler_id: string };
type RawPaymentSum = { bookings: { traveler_id: string }[] | { traveler_id: string } | null; amount_fcfa: number };
type RawReviewCount = { reviewer_id: string };

async function fetchAdminTravelers(): Promise<AdminTravelerRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [profilesRes, hostIdsRes, bookingsRes, paymentsRes, reviewsRes] = await Promise.all([
    db.from("profiles").select("id,full_name,email,avatar_url,account_status,created_at").order("created_at", { ascending: false }).limit(200),
    db.from("host_profiles").select("id"),
    db.from("bookings").select("traveler_id").limit(5000),
    db.from("payments").select("amount_fcfa,bookings!booking_id(traveler_id)").eq("status", "captured").limit(5000),
    db.from("reviews").select("reviewer_id").eq("direction", "traveler_to_host").limit(5000),
  ]);

  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (hostIdsRes.error) throw new Error(hostIdsRes.error.message);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);
  if (reviewsRes.error) throw new Error(reviewsRes.error.message);

  const hostIds = new Set<string>(((hostIdsRes.data ?? []) as { id: string }[]).map((h) => h.id));

  const bookingCounts: Record<string, number> = {};
  ((bookingsRes.data ?? []) as RawBookingCount[]).forEach((b) => {
    bookingCounts[b.traveler_id] = (bookingCounts[b.traveler_id] ?? 0) + 1;
  });

  const paymentSums: Record<string, number> = {};
  ((paymentsRes.data ?? []) as RawPaymentSum[]).forEach((p) => {
    const bk = Array.isArray(p.bookings) ? p.bookings[0] : p.bookings;
    if (!bk?.traveler_id) return;
    paymentSums[bk.traveler_id] = (paymentSums[bk.traveler_id] ?? 0) + (p.amount_fcfa ?? 0);
  });

  const reviewCounts: Record<string, number> = {};
  ((reviewsRes.data ?? []) as RawReviewCount[]).forEach((r) => {
    reviewCounts[r.reviewer_id] = (reviewCounts[r.reviewer_id] ?? 0) + 1;
  });

  return ((profilesRes.data ?? []) as RawProfile[])
    .filter((p) => !hostIds.has(p.id))
    .map((p) => ({
      id: p.id, name: p.full_name, email: p.email, avatarUrl: p.avatar_url,
      accountStatus: p.account_status ?? "active", createdAt: p.created_at,
      bookingsCount: bookingCounts[p.id] ?? 0,
      totalSpentFcfa: paymentSums[p.id] ?? 0,
      reviewsCount: reviewCounts[p.id] ?? 0,
    }));
}

export type UseAdminTravelersReturn = {
  travelers: AdminTravelerRow[];
  loading: boolean;
  error: string | null;
  toggleStatus: (id: string, current: string) => Promise<void>;
};

export function useAdminTravelers(): UseAdminTravelersReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.adminTravelers();

  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: fetchAdminTravelers });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any).from("profiles").update({ account_status: next }).eq("id", id);
      if (dbErr) throw new Error(dbErr.message);
    },
    onMutate: async ({ id, next }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<AdminTravelerRow[]>(KEY);
      queryClient.setQueryData<AdminTravelerRow[]>(KEY, (old) => (old ?? []).map((t) => t.id === id ? { ...t, accountStatus: next } : t));
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  return {
    travelers: data ?? [], loading: isLoading, error: error?.message ?? null,
    toggleStatus: (id, current) => toggleMutation.mutateAsync({ id, next: current === "active" ? "suspended" : "active" }),
  };
}
