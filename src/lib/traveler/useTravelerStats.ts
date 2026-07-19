import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { TravelerStats } from "./types";

const ACTIVE_STATUSES = ["pending_payment", "confirmed", "checked_in"];
const DONE_STATUSES = ["completed"];

async function fetchTravelerStats(): Promise<TravelerStats> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { active: 0, completed: 0, favorites: 0, reviews: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [activeRes, completedRes, favRes, reviewRes] = await Promise.all([
    db.from("bookings").select("id", { count: "exact", head: true }).eq("traveler_id", user.id).in("status", ACTIVE_STATUSES),
    db.from("bookings").select("id", { count: "exact", head: true }).eq("traveler_id", user.id).in("status", DONE_STATUSES),
    db.from("favorites").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    db.from("reviews").select("id", { count: "exact", head: true }).eq("reviewer_id", user.id).eq("is_published", true),
  ]);

  return {
    active: activeRes.count ?? 0,
    completed: completedRes.count ?? 0,
    favorites: favRes.count ?? 0,
    reviews: reviewRes.count ?? 0,
  };
}

export function useTravelerStats(): { stats: TravelerStats; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.travelerStats(),
    queryFn: fetchTravelerStats,
    staleTime: 60_000,
  });

  return { stats: data ?? { active: 0, completed: 0, favorites: 0, reviews: 0 }, loading: isLoading };
}
