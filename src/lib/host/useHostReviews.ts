import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { HostReview, HostReviewReply, HostReviewsData } from "./types";

type RawReviewRow = {
  id: string; booking_id: string; overall_rating: number;
  cleanliness_rating: number | null; accuracy_rating: number | null;
  location_rating: number | null; value_rating: number | null; communication_rating: number | null;
  body: string; published_at: string | null; created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  bookings: { rooms: { name: string } | null; properties: { name: string } | null } | null;
  review_replies: { id: string; body: string; created_at: string }[] | null;
};

// ── Fetcher ───────────────────────────────────────────────────

async function fetchHostReviews(): Promise<HostReviewsData> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: dbErr } = await (supabase as any)
    .from("reviews")
    .select(`id,booking_id,overall_rating,cleanliness_rating,accuracy_rating,location_rating,value_rating,communication_rating,body,published_at,created_at,profiles!reviewer_id(full_name,avatar_url),bookings!booking_id(rooms!room_id(name),properties!property_id(name)),review_replies(id,body,created_at)`)
    .eq("reviewee_id", user.id)
    .eq("direction", "traveler_to_host")
    .eq("is_published", true)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(200);

  if (dbErr) throw new Error(dbErr.message);

  const rawRows = (rows ?? []) as RawReviewRow[];
  const reviews: HostReview[] = rawRows.map((r) => {
    const profile = Array.isArray(r.profiles) ? (r.profiles[0] ?? null) : r.profiles;
    const booking = Array.isArray(r.bookings) ? (r.bookings[0] ?? null) : r.bookings;
    const roomRaw = booking?.rooms; const room = Array.isArray(roomRaw) ? (roomRaw[0] ?? null) : roomRaw;
    const propRaw = booking?.properties; const prop = Array.isArray(propRaw) ? (propRaw[0] ?? null) : propRaw;
    const repliesRaw = Array.isArray(r.review_replies) ? r.review_replies : [];
    const replyRaw = repliesRaw[0] ?? null;
    const reply: HostReviewReply | null = replyRaw ? { id: replyRaw.id, body: replyRaw.body, createdAt: replyRaw.created_at } : null;
    return {
      id: r.id, bookingId: r.booking_id, reviewerName: profile?.full_name ?? null,
      reviewerAvatarUrl: profile?.avatar_url ?? null, overallRating: r.overall_rating,
      cleanlinessRating: r.cleanliness_rating, accuracyRating: r.accuracy_rating,
      locationRating: r.location_rating, valueRating: r.value_rating, communicationRating: r.communication_rating,
      body: r.body, publishedAt: r.published_at, createdAt: r.created_at,
      roomName: room?.name ?? null, propertyName: prop?.name ?? null, reply,
    };
  });

  const totalCount = reviews.length;
  const avgRating = totalCount > 0 ? reviews.reduce((sum, r) => sum + r.overallRating, 0) / totalCount : null;
  const fiveStarCount = reviews.filter((r) => r.overallRating === 5).length;
  const fiveStarPct = totalCount > 0 ? Math.round((fiveStarCount / totalCount) * 100) : null;
  const distribution = [5, 4, 3, 2, 1].map((stars) => {
    const count = reviews.filter((r) => r.overallRating === stars).length;
    return { stars, count, pct: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0 };
  });

  return { reviews, avgRating, totalCount, fiveStarPct, distribution };
}

// ── Hook ─────────────────────────────────────────────────────

type UseHostReviewsReturn = {
  data: HostReviewsData | null;
  loading: boolean;
  error: string | null;
  replyToReview: (reviewId: string, body: string) => Promise<void>;
  replying: boolean;
  replyError: string | null;
};

export function useHostReviews(): UseHostReviewsReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.hostReviews();

  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: fetchHostReviews });

  const replyMutation = useMutation({
    mutationFn: async ({ reviewId, body }: { reviewId: string; body: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row, error: dbErr } = await (supabase as any)
        .from("review_replies")
        .insert({ review_id: reviewId, author_id: user.id, body: body.trim() })
        .select("id,body,created_at")
        .single();
      if (dbErr) throw new Error(dbErr.message);
      return row as { id: string; body: string; created_at: string };
    },
    onMutate: async ({ reviewId, body }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<HostReviewsData>(KEY);
      const tempReply: HostReviewReply = { id: `temp-${Date.now()}`, body, createdAt: new Date().toISOString() };
      queryClient.setQueryData<HostReviewsData>(KEY, (old) => {
        if (!old) return old;
        return { ...old, reviews: old.reviews.map((r) => r.id === reviewId ? { ...r, reply: tempReply } : r) };
      });
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    replyToReview: (reviewId, body) => replyMutation.mutateAsync({ reviewId, body }),
    replying: replyMutation.isPending,
    replyError: replyMutation.error?.message ?? null,
  };
}
