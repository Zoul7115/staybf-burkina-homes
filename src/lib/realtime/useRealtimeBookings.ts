import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";

type BookingEvent = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: { id: string; status: string; [key: string]: unknown };
  old: { id: string };
};

type Role = "host" | "traveler";

export function useRealtimeBookings(userId: string | null, role: Role) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const column = role === "host" ? "host_id" : "traveler_id";
    const bookingKeys = role === "host"
      ? [queryKeys.hostBookings(), queryKeys.hostDashboard()]
      : [queryKeys.travelerDashboardBookings(), queryKeys.travelerBookings(), queryKeys.travelerStats()];

    const channel = supabase
      .channel(`bookings:${role}:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `${column}=eq.${userId}` },
        (payload) => {
          const ev = payload as unknown as BookingEvent;

          // For status updates, patch each relevant cache key
          if (ev.eventType === "UPDATE") {
            bookingKeys.forEach((key) => {
              queryClient.setQueryData<unknown[]>(key, (old) => {
                if (!Array.isArray(old)) return old;
                return old.map((b) => {
                  const booking = b as { id: string; status?: string };
                  return booking.id === ev.new.id ? { ...booking, ...ev.new } : booking;
                });
              });
            });
          }

          // For inserts and deletes, invalidate (need fresh join data)
          if (ev.eventType === "INSERT" || ev.eventType === "DELETE") {
            bookingKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId, role, queryClient]);
}
