import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { AdminTicketRow } from "@/lib/admin/types";

type TicketUpdate = { new: { id: string; status: string; priority: string; updated_at: string } };

export function useRealtimeSupport(ticketId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const KEY = queryKeys.adminSupport();

    const channel = supabase.channel(ticketId ? `ticket_messages:${ticketId}` : "support_tickets:admin");

    if (ticketId) {
      // Watching a single ticket's messages → invalidate on new message
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticketId}` },
        () => { queryClient.invalidateQueries({ queryKey: KEY }); },
      );
    } else {
      // Watching all tickets for admin — patch status/priority on update
      channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "support_tickets" },
          () => { queryClient.invalidateQueries({ queryKey: KEY }); },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "support_tickets" },
          (payload) => {
            const raw = (payload as unknown as TicketUpdate).new;
            queryClient.setQueryData<AdminTicketRow[]>(KEY, (old) => {
              if (!old) return old;
              return old.map((t) =>
                t.id === raw.id
                  ? { ...t, status: raw.status, priority: raw.priority, updatedAt: raw.updated_at }
                  : t
              );
            });
          },
        );
    }

    channel.subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [ticketId, queryClient]);
}
