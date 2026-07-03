import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { AdminTravelerRow } from "./types";

type RawProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  account_status: string;
  created_at: string;
};

type RawBookingCount = { traveler_id: string };
type RawPaymentSum = { bookings: { traveler_id: string }[] | { traveler_id: string } | null; amount_fcfa: number };
type RawReviewCount = { reviewer_id: string };

export type UseAdminTravelersReturn = {
  travelers: AdminTravelerRow[];
  loading: boolean;
  error: string | null;
  toggleStatus: (id: string, current: string) => Promise<void>;
};

export function useAdminTravelers(): UseAdminTravelersReturn {
  const [travelers, setTravelers] = useState<AdminTravelerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      // Fetch host IDs to exclude from traveler list
      const [profilesRes, hostIdsRes, bookingsRes, paymentsRes, reviewsRes] = await Promise.all([
        db.from("profiles").select("id, full_name, email, avatar_url, account_status, created_at").order("created_at", { ascending: false }).limit(200),
        db.from("host_profiles").select("id"),
        db.from("bookings").select("traveler_id").limit(5000),
        db.from("payments").select("amount_fcfa, bookings!booking_id(traveler_id)").eq("status", "captured").limit(5000),
        db.from("reviews").select("reviewer_id").eq("direction", "traveler_to_host").limit(5000),
      ]);

      if (cancelled) return;
      if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return; }

      const hostIds = new Set<string>(((hostIdsRes.data ?? []) as { id: string }[]).map((h) => h.id));

      // Aggregate counts
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

      const mapped: AdminTravelerRow[] = ((profilesRes.data ?? []) as RawProfile[])
        .filter((p) => !hostIds.has(p.id))
        .map((p) => ({
          id: p.id,
          name: p.full_name,
          email: p.email,
          avatarUrl: p.avatar_url,
          accountStatus: p.account_status ?? "active",
          createdAt: p.created_at,
          bookingsCount: bookingCounts[p.id] ?? 0,
          totalSpentFcfa: paymentSums[p.id] ?? 0,
          reviewsCount: reviewCounts[p.id] ?? 0,
        }));

      setTravelers(mapped);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Toggles account_status; may require super_admin RLS depending on profiles policy
  const toggleStatus = useCallback(async (id: string, current: string) => {
    const next = current === "active" ? "suspended" : "active";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any).from("profiles").update({ account_status: next }).eq("id", id);
    if (dbErr) throw new Error(dbErr.message);
    setTravelers((prev) => prev.map((t) => t.id === id ? { ...t, accountStatus: next } : t));
  }, []);

  return { travelers, loading, error, toggleStatus };
}
