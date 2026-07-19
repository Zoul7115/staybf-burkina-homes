import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { HostThread, HostMessage } from "./types";

type RawThreadRow = {
  id: string; traveler_id: string; room_id: string; booking_id: string | null;
  subject: string | null; last_message_at: string | null; host_unread_count: number; is_frozen: boolean;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  rooms: { name: string; properties: { name: string } | null } | null;
  messages: { body: string | null; sender_id: string | null; created_at: string; is_system_message: boolean }[];
};

type RawMessageRow = {
  id: string; thread_id: string; sender_id: string | null; body: string | null;
  is_read: boolean; is_system_message: boolean; created_at: string;
};

// ── Fetchers ──────────────────────────────────────────────────

async function fetchHostThreads(): Promise<HostThread[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: dbErr } = await (supabase as any)
    .from("threads")
    .select(`id,traveler_id,room_id,booking_id,subject,last_message_at,host_unread_count,is_frozen,profiles!traveler_id(full_name,avatar_url),rooms!room_id(name,properties!property_id(name)),messages(body,sender_id,created_at,is_system_message)`)
    .eq("host_id", user.id)
    .eq("is_archived_host", false)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (dbErr) throw new Error(dbErr.message);

  return ((rows ?? []) as RawThreadRow[]).map((t) => {
    const profile = Array.isArray(t.profiles) ? (t.profiles[0] ?? null) : t.profiles;
    const room = Array.isArray(t.rooms) ? (t.rooms[0] ?? null) : t.rooms;
    const propRaw = room?.properties; const prop = Array.isArray(propRaw) ? (propRaw[0] ?? null) : propRaw;
    const msgs = [...(t.messages ?? [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    return {
      id: t.id, travelerId: t.traveler_id, roomId: t.room_id, bookingId: t.booking_id,
      subject: t.subject, lastMessageAt: t.last_message_at, lastMessageBody: lastMsg?.body ?? null,
      lastMessageSenderId: lastMsg?.sender_id ?? null, hostUnreadCount: t.host_unread_count,
      isFrozen: t.is_frozen, travelerName: profile?.full_name ?? null,
      travelerAvatarUrl: profile?.avatar_url ?? null, roomName: room?.name ?? null, propertyName: prop?.name ?? null,
    };
  });
}

async function fetchHostMessages(threadId: string): Promise<HostMessage[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: dbErr } = await (supabase as any)
    .from("messages")
    .select("id,thread_id,sender_id,body,is_read,is_system_message,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (dbErr) throw new Error(dbErr.message);
  return ((rows ?? []) as RawMessageRow[]).map((m) => ({
    id: m.id, threadId: m.thread_id, senderId: m.sender_id, body: m.body,
    isRead: m.is_read, isSystemMessage: m.is_system_message, createdAt: m.created_at,
  }));
}

// ── Thread list hook ──────────────────────────────────────────

export function useHostThreads(): { threads: HostThread[]; loading: boolean; error: string | null } {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.hostThreads(),
    queryFn: fetchHostThreads,
  });

  return { threads: data ?? [], loading: isLoading, error: error?.message ?? null };
}

// ── Thread messages hook ──────────────────────────────────────

type UseHostThreadMessagesReturn = {
  messages: HostMessage[]; loading: boolean; error: string | null;
  sendMessage: (body: string) => Promise<void>; sending: boolean; sendError: string | null;
  markRead: () => void;
};

export function useHostThreadMessages(threadId: string | null): UseHostThreadMessagesReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.hostMessages(threadId ?? "");

  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: () => fetchHostMessages(threadId!),
    enabled: !!threadId,
  });

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!threadId) throw new Error("Aucun fil sélectionné");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any)
        .from("messages")
        .insert({ thread_id: threadId, sender_id: user.id, body: body.trim(), is_system_message: false });
      if (dbErr) throw new Error(dbErr.message);
    },
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<HostMessage[]>(KEY);
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const tempMsg: HostMessage = {
        id: `temp-${Date.now()}`, threadId: threadId ?? "", senderId: currentUser?.id ?? null,
        body, isRead: false, isSystemMessage: false, createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<HostMessage[]>(KEY, (old) => [...(old ?? []), tempMsg]);
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: queryKeys.hostThreads() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.hostThreads() });
    },
  });

  return {
    messages: data ?? [], loading: isLoading, error: error?.message ?? null,
    sendMessage: sendMutation.mutateAsync,
    sending: sendMutation.isPending, sendError: sendMutation.error?.message ?? null,
    markRead: () => { markReadMutation.mutate(); },
  };
}
