import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";

export function useRealtimeReviews(propertyId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const filter = propertyId ? `property_id=eq.${propertyId}` : undefined;
    const channelName = propertyId ? `reviews:property:${propertyId}` : "reviews:all";

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reviews", ...(filter ? { filter } : {}) },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.hostReviews() });
          queryClient.invalidateQueries({ queryKey: queryKeys.adminReviews() });
          if (propertyId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.propertyDetail(propertyId) });
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [propertyId, queryClient]);
}
