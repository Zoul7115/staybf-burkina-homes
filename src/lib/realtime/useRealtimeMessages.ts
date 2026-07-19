import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { HostMessage } from "@/lib/host/types";
import type { MessageItem } from "@/lib/traveler/types";

type Role = "host" | "traveler";

type RealtimePayload = {
  new: {
    id: string; thread_id: string; sender_id: string; body: string;
    is_read: boolean; is_system_message: boolean; created_at: string;
  };
};

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 86_400_000) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (diffMs < 172_800_000) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function useRealtimeMessages(
  threadId: string | null,
  role: Role,
  currentUserId: string | null,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!threadId) return;

    const messageKey = role === "host"
      ? queryKeys.hostMessages(threadId)
      : queryKeys.travelerMessages(threadId);

    const threadsKey = role === "host" ? queryKeys.hostThreads() : queryKeys.travelerThreads();

    const channel = supabase
      .channel(`messages:${threadId}:${role}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const raw = (payload as unknown as RealtimePayload).new;

          if (role === "host") {
            queryClient.setQueryData<HostMessage[]>(messageKey, (old) => {
              if (!old) return old;
              // Deduplicate: replace optimistic temp message from same sender if body matches
              const alreadyExists = old.some((m) => m.id === raw.id);
              if (alreadyExists) return old;
              const newMsg: HostMessage = {
                id: raw.id,
                threadId: raw.thread_id,
                senderId: raw.sender_id,
                body: raw.body,
                isRead: raw.is_read,
                isSystemMessage: raw.is_system_message,
                createdAt: raw.created_at,
              };
              // Remove any matching temp message (same body, temp id) before appending
              const filtered = old.filter(
                (m) => !(m.id.startsWith("temp-") && m.body === raw.body && m.senderId === raw.sender_id)
              );
              return [...filtered, newMsg];
            });
          } else {
            queryClient.setQueryData<{ messages: MessageItem[]; userId: string | null }>(messageKey, (old) => {
              if (!old) return old;
              const alreadyExists = old.messages.some((m) => m.id === raw.id);
              if (alreadyExists) return old;
              const newMsg: MessageItem = {
                id: raw.id,
                senderId: raw.sender_id,
                isFromMe: raw.sender_id === currentUserId,
                body: raw.body,
                createdAt: raw.created_at,
                timeLabel: formatTimeLabel(raw.created_at),
              };
              const filtered = old.messages.filter(
                (m) => !(m.id.startsWith("temp-") && m.body === raw.body && m.senderId === raw.sender_id)
              );
              return { ...old, messages: [...filtered, newMsg] };
            });
          }

          // Update thread list preview instantly
          queryClient.invalidateQueries({ queryKey: threadsKey });
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [threadId, role, currentUserId, queryClient]);
}
