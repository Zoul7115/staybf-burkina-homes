import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TravelerStats } from "./types";

const ACTIVE_STATUSES = ["pending_payment", "confirmed", "checked_in"];
const DONE_STATUSES = ["completed"];

export function useTravelerStats(): { stats: TravelerStats; loading: boolean } {
  const [stats, setStats] = useState<TravelerStats>({ active: 0, completed: 0, favorites: 0, reviews: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const [activeRes, completedRes, favRes, reviewRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("traveler_id", user.id)
          .in("status", ACTIVE_STATUSES),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("traveler_id", user.id)
          .in("status", DONE_STATUSES),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("favorites")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .eq("reviewer_id", user.id)
          .eq("is_published", true),
      ]);

      if (!cancelled) {
        setStats({
          active: activeRes.count ?? 0,
          completed: completedRes.count ?? 0,
          favorites: favRes.count ?? 0,
          reviews: reviewRes.count ?? 0,
        });
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { stats, loading };
}
