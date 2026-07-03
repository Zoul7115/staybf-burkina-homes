import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { AdminReviewRow } from "./types";

type RawRow = {
  id: string;
  status: string;
  overall_rating: number;
  body: string | null;
  published_at: string | null;
  created_at: string;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
  bookings: {
    rooms: {
      name: string;
      properties: { name: string } | { name: string }[] | null;
    } | {
      name: string;
      properties: { name: string } | { name: string }[] | null;
    }[] | null;
  } | {
    rooms: unknown;
  }[] | null;
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type UseAdminReviewsReturn = {
  reviews: AdminReviewRow[];
  loading: boolean;
  error: string | null;
  approveReview: (id: string) => Promise<void>;
  removeReview: (id: string) => Promise<void>;
};

export function useAdminReviews(): UseAdminReviewsReturn {
  const [reviews, setReviews] = useState<AdminReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: dbErr } = await (supabase as any)
        .from("reviews")
        .select(`
          id, status, overall_rating, body, published_at, created_at,
          profiles!reviewer_id(full_name),
          bookings!booking_id(rooms!room_id(name, properties!property_id(name)))
        `)
        .in("status", ["flagged", "under_review", "published", "removed"])
        .order("created_at", { ascending: false })
        .limit(300);

      if (cancelled) return;
      if (dbErr) { setError(dbErr.message); setLoading(false); return; }

      const mapped: AdminReviewRow[] = ((data ?? []) as RawRow[]).map((r) => {
        const reviewer = unwrap(r.profiles);
        const booking = unwrap(r.bookings);
        const room = booking ? unwrap((booking as { rooms: unknown }).rooms as RawRow["bookings"]) : null;
        const roomObj = room as { name: string; properties: unknown } | null;
        const prop = roomObj ? unwrap(roomObj.properties as { name: string } | { name: string }[]) : null;
        return {
          id: r.id,
          status: r.status,
          overallRating: r.overall_rating,
          body: r.body,
          reviewerName: reviewer?.full_name ?? null,
          propertyName: prop?.name ?? null,
          publishedAt: r.published_at,
          createdAt: r.created_at,
        };
      });

      setReviews(mapped);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Reviews: SELECT, INSERT, UPDATE GRANT + admin ALL RLS → mutations allowed
  const approveReview = useCallback(async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any)
      .from("reviews")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", id);
    if (dbErr) throw new Error(dbErr.message);
    setReviews((prev) => prev.map((r) => r.id === id ? { ...r, status: "published" } : r));
  }, []);

  const removeReview = useCallback(async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any)
      .from("reviews")
      .update({ status: "removed" })
      .eq("id", id);
    if (dbErr) throw new Error(dbErr.message);
    setReviews((prev) => prev.map((r) => r.id === id ? { ...r, status: "removed" } : r));
  }, []);

  return { reviews, loading, error, approveReview, removeReview };
}
