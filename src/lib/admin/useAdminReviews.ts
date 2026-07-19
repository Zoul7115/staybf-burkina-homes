import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { AdminReviewRow } from "./types";

type RawRow = {
  id: string; status: string; overall_rating: number; body: string | null;
  published_at: string | null; created_at: string;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
  bookings: { rooms: { name: string; properties: { name: string } | { name: string }[] | null } | { name: string; properties: unknown }[] | null } | { rooms: unknown }[] | null;
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function fetchAdminReviews(): Promise<AdminReviewRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbErr } = await (supabase as any)
    .from("reviews")
    .select(`id,status,overall_rating,body,published_at,created_at,profiles!reviewer_id(full_name),bookings!booking_id(rooms!room_id(name,properties!property_id(name)))`)
    .in("status", ["flagged", "under_review", "published", "removed"])
    .order("created_at", { ascending: false })
    .limit(300);

  if (dbErr) throw new Error(dbErr.message);

  return ((data ?? []) as RawRow[]).map((r) => {
    const reviewer = unwrap(r.profiles);
    const booking = unwrap(r.bookings as RawRow["bookings"]);
    const room = booking ? unwrap((booking as { rooms: unknown }).rooms as RawRow["bookings"]) : null;
    const roomObj = room as { name: string; properties: unknown } | null;
    const prop = roomObj ? unwrap(roomObj.properties as { name: string } | { name: string }[]) : null;
    return {
      id: r.id, status: r.status, overallRating: r.overall_rating, body: r.body,
      reviewerName: reviewer?.full_name ?? null, propertyName: prop?.name ?? null,
      publishedAt: r.published_at, createdAt: r.created_at,
    };
  });
}

export type UseAdminReviewsReturn = {
  reviews: AdminReviewRow[];
  loading: boolean;
  error: string | null;
  approveReview: (id: string) => Promise<void>;
  removeReview: (id: string) => Promise<void>;
};

export function useAdminReviews(): UseAdminReviewsReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.adminReviews();

  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: fetchAdminReviews });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any).from("reviews").update({ status: "published", published_at: new Date().toISOString() }).eq("id", id);
      if (dbErr) throw new Error(dbErr.message);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<AdminReviewRow[]>(KEY);
      queryClient.setQueryData<AdminReviewRow[]>(KEY, (old) => (old ?? []).map((r) => r.id === id ? { ...r, status: "published" } : r));
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any).from("reviews").update({ status: "removed" }).eq("id", id);
      if (dbErr) throw new Error(dbErr.message);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<AdminReviewRow[]>(KEY);
      queryClient.setQueryData<AdminReviewRow[]>(KEY, (old) => (old ?? []).map((r) => r.id === id ? { ...r, status: "removed" } : r));
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  return {
    reviews: data ?? [], loading: isLoading, error: error?.message ?? null,
    approveReview: approveMutation.mutateAsync,
    removeReview: removeMutation.mutateAsync,
  };
}
