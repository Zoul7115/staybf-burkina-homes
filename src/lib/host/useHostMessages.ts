import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { HostThread, HostMessage } from "./types";

// ── Raw row types ─────────────────────────────────────────────

type RawThreadRow = {
  id: string;
  traveler_id: string;
  room_id: string;
  booking_id: string | null;
  subject: string | null;
  last_message_at: string | null;
  host_unread_count: number;
  is_frozen: boolean;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  rooms: {
    name: string;
    properties: { name: string } | null;
  } | null;
  messages: { body: string | null; sender_id: string | null; created_at: string; is_system_message: boolean }[];
};

type RawMessageRow = {
  id: string;
  thread_id: string;
  sender_id: string | null;
  body: string | null;
  is_read: boolean;
  is_system_message: boolean;
  created_at: string;
};

// ── Thread list hook ──────────────────────────────────────────

type UseHostThreadsReturn = {
  threads: HostThread[];
  loading: boolean;
  error: string | null;
};

export function useHostThreads(): UseHostThreadsReturn {
  const [threads, setThreads] = useState<HostThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) { setThreads([]); setLoading(false); }
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error: dbErr } = await (supabase as any)
        .from("threads")
        .select(
          `
          id,
          traveler_id,
          room_id,
          booking_id,
          subject,
          last_message_at,
          host_unread_count,
          is_frozen,
          profiles!traveler_id(full_name, avatar_url),
          rooms!room_id(name, properties!property_id(name)),
          messages(body, sender_id, created_at, is_system_message)
          `
        )
        .eq("host_id", user.id)
        .eq("is_archived_host", false)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(50);

      if (cancelled) return;
      if (dbErr) { setError(dbErr.message); setLoading(false); return; }

      const rawRows = (rows ?? []) as RawThreadRow[];

      const mapped: HostThread[] = rawRows.map((t) => {
        const profile = Array.isArray(t.profiles) ? (t.profiles[0] ?? null) : t.profiles;
        const room = Array.isArray(t.rooms) ? (t.rooms[0] ?? null) : t.rooms;
        const propRaw = room?.properties;
        const prop = Array.isArray(propRaw) ? (propRaw[0] ?? null) : propRaw;

        // Sort embedded messages by created_at to find the real last one
        const msgs = [...(t.messages ?? [])].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

        return {
          id: t.id,
          travelerId: t.traveler_id,
          roomId: t.room_id,
          bookingId: t.booking_id,
          subject: t.subject,
          lastMessageAt: t.last_message_at,
          lastMessageBody: lastMsg?.body ?? null,
          lastMessageSenderId: lastMsg?.sender_id ?? null,
          hostUnreadCount: t.host_unread_count,
          isFrozen: t.is_frozen,
          travelerName: profile?.full_name ?? null,
          travelerAvatarUrl: profile?.avatar_url ?? null,
          roomName: room?.name ?? null,
          propertyName: prop?.name ?? null,
        };
      });

      setThreads(mapped);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { threads, loading, error };
}

// ── Thread messages hook ──────────────────────────────────────

type UseHostThreadMessagesReturn = {
  messages: HostMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (body: string) => Promise<void>;
  sending: boolean;
  sendError: string | null;
};

export function useHostThreadMessages(
  threadId: string | null
): UseHostThreadMessagesReturn {
  const [messages, setMessages] = useState<HostMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const fetchMessages = useCallback(
    async (id: string, signal: { cancelled: boolean }) => {
      setLoading(true);
      setError(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error: dbErr } = await (supabase as any)
        .from("messages")
        .select("id, thread_id, sender_id, body, is_read, is_system_message, created_at")
        .eq("thread_id", id)
        .order("created_at", { ascending: true })
        .limit(200);

      if (signal.cancelled) return;
      if (dbErr) { setError(dbErr.message); setLoading(false); return; }

      const rawRows = (rows ?? []) as RawMessageRow[];
      setMessages(
        rawRows.map((m) => ({
          id: m.id,
          threadId: m.thread_id,
          senderId: m.sender_id,
          body: m.body,
          isRead: m.is_read,
          isSystemMessage: m.is_system_message,
          createdAt: m.created_at,
        }))
      );
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const signal = { cancelled: false };
    fetchMessages(threadId, signal);
    return () => { signal.cancelled = true; };
  }, [threadId, fetchMessages]);

  const sendMessage = useCallback(
    async (body: string) => {
      if (!threadId || !body.trim()) return;

      setSending(true);
      setSendError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSendError("Non authentifié.");
        setSending(false);
        return;
      }

      // Messages INSERT is allowed for authenticated thread participants via RLS:
      // sender_id = auth.uid() AND is_thread_participant(uid, thread_id) AND NOT is_system_message
      // The host is always a participant (host_id = auth.uid() on the thread).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertErr } = await (supabase as any)
        .from("messages")
        .insert({
          thread_id: threadId,
          sender_id: user.id,
          body: body.trim(),
          is_system_message: false,
        });

      if (insertErr) {
        setSendError(insertErr.message);
        setSending(false);
        return;
      }

      // Refetch to reflect the new message (and any system messages the trigger may add)
      const signal = { cancelled: false };
      await fetchMessages(threadId, signal);
      setSending(false);
    },
    [threadId, fetchMessages]
  );

  return { messages, loading, error, sendMessage, sending, sendError };
}
