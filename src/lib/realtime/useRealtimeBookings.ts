import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";

type Role = "host" | "traveler";

export function useRealtimeBookings(userId: string | null, role: Role) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const column = role === "host" ? "host_id" : "traveler_id";
    const keys = role === "host"
      ? [queryKeys.hostBookings(), queryKeys.hostDashboard()]
      : [queryKeys.travelerDashboardBookings(), queryKeys.travelerBookings(), queryKeys.travelerStats()];

    const channel = supabase
      .channel(`bookings:${role}:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `${column}=eq.${userId}` },
        () => {
          keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId, role, queryClient]);
}
