import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";

export function useRealtimeNotifications(userId: string | null, role: "host" | "traveler") {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const key = role === "host" ? queryKeys.hostNotifications() : queryKeys.travelerNotifications();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: key });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: key });
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId, role, queryClient]);
}
