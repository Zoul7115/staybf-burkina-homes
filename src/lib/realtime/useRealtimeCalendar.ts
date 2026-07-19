import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";

type AvailabilityRow = {
  room_id: string; date: string; status: string; price_override_fcfa: number | null;
};

export function useRealtimeCalendar(roomId: string | null, year: number, month: number) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!roomId) return;

    const key = queryKeys.hostCalendar(roomId, year, month);

    const channel = supabase
      .channel(`room_availability:${roomId}:${year}:${month}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_availability", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const raw = (payload as unknown as { eventType: string; new: AvailabilityRow }).new;

          // Only patch if the changed date belongs to the currently displayed month
          if (raw?.date) {
            const d = new Date(raw.date);
            if (d.getFullYear() === year && d.getMonth() + 1 === month) {
              queryClient.setQueryData<AvailabilityRow[]>(key, (old) => {
                if (!old) return old;
                const idx = old.findIndex((r) => r.date === raw.date);
                if (idx === -1) return [...old, raw];
                const next = [...old];
                next[idx] = raw;
                return next;
              });
              return;
            }
          }
          queryClient.invalidateQueries({ queryKey: key });
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [roomId, year, month, queryClient]);
}
