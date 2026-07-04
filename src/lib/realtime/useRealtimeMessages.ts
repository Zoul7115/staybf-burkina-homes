import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";

type Role = "host" | "traveler";

export function useRealtimeMessages(threadId: string | null, role: Role) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!threadId) return;

    const key = role === "host"
      ? queryKeys.hostMessages(threadId)
      : queryKeys.travelerMessages(threadId);

    const channel = supabase
      .channel(`messages:${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: key });
          // Also invalidate threads list to update last_message_at preview
          queryClient.invalidateQueries({ queryKey: role === "host" ? queryKeys.hostThreads() : queryKeys.travelerThreads() });
          void payload;
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [threadId, role, queryClient]);
}
