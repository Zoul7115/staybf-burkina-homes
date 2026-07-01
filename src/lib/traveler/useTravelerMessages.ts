import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/lib/supabase/client";
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

// ---------------------------------------------------------------------------
// Thread list hook
// ---------------------------------------------------------------------------

export function useTravelerMessages(): {
  threads: ConversationThread[];
  totalUnread: number;
  loading: boolean;
} {
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("threads")
        .select(`
          id,
          updated_at,
          host_profiles!host_id(
            id,
            profiles!id(full_name, avatar_url)
          ),
          properties!property_id(name),
          messages!thread_id(id, sender_id, body, created_at, is_read)
        `)
        .eq("traveler_id", user.id)
        .order("updated_at", { ascending: false });

      if (cancelled) return;

      // Table may not exist yet — return empty gracefully
      if (error || !data) {
        setLoading(false);
        return;
      }

      type RawMsg = {
        id: string;
        sender_id: string;
        body: string;
        created_at: string;
        is_read: boolean;
      };

      type RawThread = {
        id: string;
        updated_at: string;
        host_profiles: {
          id: string;
          profiles: { full_name: string | null; avatar_url: string | null } | null;
        } | null;
        properties: { name: string } | null;
        messages: RawMsg[];
      };

      const result: ConversationThread[] = (data as RawThread[]).map((t) => {
        const msgs = (t.messages ?? []).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        const last = msgs[0] ?? null;
        const unreadCount = msgs.filter((m) => m.sender_id !== user.id && !m.is_read).length;
        const hostName = t.host_profiles?.profiles?.full_name ?? "Hôte";

        return {
          id: t.id,
          hostId: t.host_profiles?.id ?? "",
          hostName,
          hostInitials: getInitials(hostName),
          hostAvatarUrl: t.host_profiles?.profiles?.avatar_url ?? null,
          propertyName: t.properties?.name ?? null,
          lastMessageBody: last?.body ?? null,
          lastMessageLabel: last ? formatTimeLabel(last.created_at) : "",
          unreadCount,
        };
      });

      setThreads(result);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalUnread = threads.reduce((sum, t) => sum + t.unreadCount, 0);
  return { threads, totalUnread, loading };
}

// ---------------------------------------------------------------------------
// Single thread messages hook
// ---------------------------------------------------------------------------

export function useThreadMessages(threadId: string | undefined): {
  messages: MessageItem[];
  loading: boolean;
  send: (body: string) => Promise<void>;
} {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Resolve current user once
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // Load messages when thread or userId changes
  useEffect(() => {
    if (!threadId || !userId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("messages")
        .select("id, sender_id, body, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error || !data) {
        setLoading(false);
        return;
      }

      type RawMsg = { id: string; sender_id: string; body: string; created_at: string };

      setMessages(
        (data as RawMsg[]).map((m) => ({
          id: m.id,
          senderId: m.sender_id,
          isFromMe: m.sender_id === userId,
          body: m.body,
          createdAt: m.created_at,
          timeLabel: formatTimeLabel(m.created_at),
        })),
      );
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [threadId, userId]);

  const send = useCallback(
    async (body: string) => {
      if (!threadId || !userId || !body.trim()) return;

      const trimmed = body.trim();

      // Optimistic update
      const optimistic: MessageItem = {
        id: `opt-${Date.now()}`,
        senderId: userId,
        isFromMe: true,
        body: trimmed,
        createdAt: new Date().toISOString(),
        timeLabel: "À l'instant",
      };
      setMessages((prev) => [...prev, optimistic]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("messages")
        .insert({ thread_id: threadId, sender_id: userId, body: trimmed });
    },
    [threadId, userId],
  );

  return { messages, loading, send };
}
