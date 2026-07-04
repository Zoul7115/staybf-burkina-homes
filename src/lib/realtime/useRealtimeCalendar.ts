import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";

export function useRealtimeCalendar(roomId: string | null, year: number, month: number) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!roomId) return;

    const key = queryKeys.hostCalendar(roomId, year, month);

    const channel = supabase
      .channel(`room_availability:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_availability", filter: `room_id=eq.${roomId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: key });
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [roomId, year, month, queryClient]);
}
