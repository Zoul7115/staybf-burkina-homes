import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { HostNotification } from "./types";

type RawNotification = {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  body: string | null;
  is_read: boolean;
  read_at: string | null;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
};

type UseHostNotificationsReturn = {
  notifications: HostNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
};

export function useHostNotifications(): UseHostNotificationsReturn {
  const [notifications, setNotifications] = useState<HostNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr || !user) {
        if (!cancelled) {
          setError(authErr?.message ?? "Non authentifié");
          setLoading(false);
        }
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: dbErr } = await (supabase as any)
        .from("notifications")
        .select(
          "id, user_id, type, title, body, is_read, read_at, resource_type, resource_id, created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (cancelled) return;

      if (dbErr) {
        // Graceful degradation: notifications table may not be seeded
        if (dbErr.code === "42P01") {
          setNotifications([]);
          setLoading(false);
          return;
        }
        setError(dbErr.message);
        setLoading(false);
        return;
      }

      setNotifications(
        ((data ?? []) as RawNotification[]).map((n) => ({
          id: n.id,
          user_id: n.user_id,
          type: n.type as HostNotification["type"],
          title: n.title,
          body: n.body,
          is_read: n.is_read,
          read_at: n.read_at,
          resource_type: n.resource_type,
          resource_id: n.resource_id,
          created_at: n.created_at,
        }))
      );
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      )
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any)
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);

    if (dbErr) {
      // Rollback
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: false, read_at: null } : n))
      );
      throw new Error(dbErr.message);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const now = new Date().toISOString();

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: now }))
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any)
      .from("notifications")
      .update({ is_read: true, read_at: now })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (dbErr) throw new Error(dbErr.message);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return { notifications, unreadCount, loading, error, markAsRead, markAllAsRead };
}
