import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";

// Note: the `reviews` table has no `property_id` column — reviews are linked
// to bookings → room → property. Realtime subscriptions therefore use only
// `reviewer_id` or `reviewee_id` filters, not a property filter.

export function useRealtimeReviews(opts?: { revieweeId?: string }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channelName = opts?.revieweeId
      ? `reviews:reviewee:${opts.revieweeId}`
      : "reviews:global";

    const filter = opts?.revieweeId
      ? `reviewee_id=eq.${opts.revieweeId}`
      : undefined;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reviews", ...(filter ? { filter } : {}) },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.hostReviews() });
          queryClient.invalidateQueries({ queryKey: queryKeys.adminReviews() });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "review_replies" },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.hostReviews() });
          queryClient.invalidateQueries({ queryKey: queryKeys.adminReviews() });
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [opts?.revieweeId, queryClient]);
}
