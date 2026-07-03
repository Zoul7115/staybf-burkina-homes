import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { HostReview, HostReviewReply, HostReviewsData } from "./types";

type RawReviewRow = {
  id: string;
  booking_id: string;
  overall_rating: number;
  cleanliness_rating: number | null;
  accuracy_rating: number | null;
  location_rating: number | null;
  value_rating: number | null;
  communication_rating: number | null;
  body: string;
  published_at: string | null;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  bookings: {
    rooms: { name: string } | null;
    properties: { name: string } | null;
  } | null;
  review_replies: { id: string; body: string; created_at: string }[] | null;
};

type UseHostReviewsReturn = {
  data: HostReviewsData | null;
  loading: boolean;
  error: string | null;
};

export function useHostReviews(): UseHostReviewsReturn {
  const [data, setData] = useState<HostReviewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) { setData(null); setLoading(false); }
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error: dbErr } = await (supabase as any)
        .from("reviews")
        .select(`
          id,
          booking_id,
          overall_rating,
          cleanliness_rating,
          accuracy_rating,
          location_rating,
          value_rating,
          communication_rating,
          body,
          published_at,
          created_at,
          profiles!reviewer_id(full_name, avatar_url),
          bookings!booking_id(
            rooms!room_id(name),
            properties!property_id(name)
          ),
          review_replies(id, body, created_at)
        `)
        .eq("reviewee_id", user.id)
        .eq("direction", "traveler_to_host")
        .eq("is_published", true)
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(200);

      if (cancelled) return;

      if (dbErr) {
        setError(dbErr.message);
        setLoading(false);
        return;
      }

      const rawRows = (rows ?? []) as RawReviewRow[];

      const reviews: HostReview[] = rawRows.map((r) => {
        const profile = Array.isArray(r.profiles) ? (r.profiles[0] ?? null) : r.profiles;
        const booking = Array.isArray(r.bookings) ? (r.bookings[0] ?? null) : r.bookings;
        const roomRaw = booking?.rooms;
        const room = Array.isArray(roomRaw) ? (roomRaw[0] ?? null) : roomRaw;
        const propRaw = booking?.properties;
        const prop = Array.isArray(propRaw) ? (propRaw[0] ?? null) : propRaw;
        const repliesRaw = Array.isArray(r.review_replies) ? r.review_replies : [];
        const replyRaw = repliesRaw[0] ?? null;

        const reply: HostReviewReply | null = replyRaw
          ? { id: replyRaw.id, body: replyRaw.body, createdAt: replyRaw.created_at }
          : null;

        return {
          id: r.id,
          bookingId: r.booking_id,
          reviewerName: profile?.full_name ?? null,
          reviewerAvatarUrl: profile?.avatar_url ?? null,
          overallRating: r.overall_rating,
          cleanlinessRating: r.cleanliness_rating,
          accuracyRating: r.accuracy_rating,
          locationRating: r.location_rating,
          valueRating: r.value_rating,
          communicationRating: r.communication_rating,
          body: r.body,
          publishedAt: r.published_at,
          createdAt: r.created_at,
          roomName: room?.name ?? null,
          propertyName: prop?.name ?? null,
          reply,
        };
      });

      const totalCount = reviews.length;
      const avgRating =
        totalCount > 0
          ? reviews.reduce((sum, r) => sum + r.overallRating, 0) / totalCount
          : null;

      const fiveStarCount = reviews.filter((r) => r.overallRating === 5).length;
      const fiveStarPct = totalCount > 0 ? Math.round((fiveStarCount / totalCount) * 100) : null;

      const distribution = [5, 4, 3, 2, 1].map((stars) => {
        const count = reviews.filter((r) => r.overallRating === stars).length;
        return {
          stars,
          count,
          pct: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0,
        };
      });

      setData({ reviews, avgRating, totalCount, fiveStarPct, distribution });
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
