import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { getInitials } from "@/lib/shared";
import type { ConversationThread, MessageItem } from "./types";

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return format(d, "HH:mm");
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return format(d, "EEE", { locale: fr });
  return format(d, "d MMM", { locale: fr });
}

type RawMsg = { id: string; sender_id: string; body: string; created_at: string; is_read: boolean };
type RawThread = {
  id: string;
  updated_at: string;
  host_profiles: { id: string; profiles: { full_name: string | null; avatar_url: string | null } | null } | null;
  properties: { name: string } | null;
  messages: RawMsg[];
};

// ── Thread list ───────────────────────────────────────────────

async function fetchTravelerThreads(): Promise<ConversationThread[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Fetch threads without inline messages to avoid unbounded payload;
  // unread count and last message preview come from dedicated columns/aggregates.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("threads")
    .select(`id,updated_at,traveler_unread_count,last_message_body,last_message_at,host_profiles!host_id(id,profiles!id(full_name,avatar_url)),properties!property_id(name)`)
    .eq("traveler_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return ((data as (Omit<RawThread, "messages"> & { traveler_unread_count: number; last_message_body: string | null; last_message_at: string | null })[]))
    .map((t) => {
    const hp = Array.isArray(t.host_profiles) ? (t.host_profiles[0] ?? null) : t.host_profiles;
    const prof = hp?.profiles ? (Array.isArray(hp.profiles) ? (hp.profiles[0] ?? null) : hp.profiles) : null;
    const prop = Array.isArray(t.properties) ? (t.properties[0] ?? null) : t.properties;
    const unreadCount = t.traveler_unread_count ?? 0;
    const last = t.last_message_at ? { body: t.last_message_body, created_at: t.last_message_at } : null;
    const hostName = prof?.full_name ?? "Hôte";
    return {
      id: t.id,
      hostId: hp?.id ?? "",
      hostName,
      hostInitials: getInitials(hostName),
      hostAvatarUrl: prof?.avatar_url ?? null,
      propertyName: prop?.name ?? null,
      lastMessageBody: last?.body ?? null,
      lastMessageLabel: last ? formatTimeLabel(last.created_at) : "",
      unreadCount,
    };
  });

}

export function useTravelerMessages(): { threads: ConversationThread[]; totalUnread: number; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.travelerThreads(),
    queryFn: fetchTravelerThreads,
  });

  const threads = data ?? [];
  const totalUnread = threads.reduce((sum, t) => sum + t.unreadCount, 0);
  return { threads, totalUnread, loading: isLoading };
}

// ── Single thread messages ────────────────────────────────────

type RawSingleMsg = { id: string; sender_id: string; body: string; created_at: string };

async function fetchThreadMessages(threadId: string): Promise<{ messages: MessageItem[]; userId: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error || !data) return { messages: [], userId };

  const messages: MessageItem[] = ((data as RawSingleMsg[])).map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    isFromMe: m.sender_id === userId,
    body: m.body,
    createdAt: m.created_at,
    timeLabel: formatTimeLabel(m.created_at),
  }));

  return { messages, userId };
}

export function useThreadMessages(threadId: string | undefined): {
  messages: MessageItem[];
  loading: boolean;
  send: (body: string) => Promise<void>;
  markRead: () => void;
} {
  const queryClient = useQueryClient();
  const KEY = queryKeys.travelerMessages(threadId ?? "");

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => fetchThreadMessages(threadId!),
    enabled: !!threadId,
  });

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!threadId || !body.trim()) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("messages")
        .insert({ thread_id: threadId, sender_id: user.id, body: body.trim() });
    },
    onMutate: async (body) => {
      if (!threadId) return;
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<{ messages: MessageItem[]; userId: string | null }>(KEY);
      const userId = prev?.userId ?? null;
      const tempMsg: MessageItem = {
        id: `temp-${Date.now()}`,
        senderId: userId ?? "",
        isFromMe: true,
        body: body.trim(),
        createdAt: new Date().toISOString(),
        timeLabel: "À l'instant",
      };
      queryClient.setQueryData<{ messages: MessageItem[]; userId: string | null }>(KEY, (old) =>
        old ? { ...old, messages: [...old.messages, tempMsg] } : old
      );
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: queryKeys.travelerThreads() });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async () => {
      if (!threadId) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("thread_id", threadId)
        .neq("sender_id", user.id)
        .eq("is_read", false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.travelerThreads() });
    },
  });

  return {
    messages: data?.messages ?? [],
    loading: isLoading,
    send: async (body: string) => { await sendMutation.mutateAsync(body); },
    markRead: () => { markReadMutation.mutate(); },
  };
}
