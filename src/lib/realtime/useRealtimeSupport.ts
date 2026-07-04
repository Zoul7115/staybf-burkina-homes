import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";

export function useRealtimeSupport(ticketId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channelName = ticketId ? `ticket_messages:${ticketId}` : "support_tickets:all";

    const eventConfig = ticketId
      ? { event: "INSERT" as const, schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticketId}` }
      : { event: "*" as const, schema: "public", table: "support_tickets" };

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", eventConfig, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.adminSupport() });
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [ticketId, queryClient]);
}
