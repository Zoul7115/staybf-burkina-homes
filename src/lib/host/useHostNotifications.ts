import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { HostNotification, NotificationType } from "./types";

type RawNotification = {
  id: string; user_id: string; type: string; title: string | null; body: string | null;
  is_read: boolean; read_at: string | null; resource_type: string | null;
  resource_id: string | null; created_at: string;
};

// ── Fetcher ───────────────────────────────────────────────────

async function fetchHostNotifications(): Promise<HostNotification[]> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error(authErr?.message ?? "Non authentifié");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbErr } = await (supabase as any)
    .from("notifications")
    .select("id,user_id,type,title,body,is_read,read_at,resource_type,resource_id,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (dbErr) {
    if (dbErr.code === "42P01") return [];
    throw new Error(dbErr.message);
  }

  return ((data ?? []) as RawNotification[]).map((n) => ({
    id: n.id, user_id: n.user_id, type: n.type as NotificationType,
    title: n.title, body: n.body, is_read: n.is_read, read_at: n.read_at,
    resource_type: n.resource_type, resource_id: n.resource_id, created_at: n.created_at,
  }));
}

// ── Hook ─────────────────────────────────────────────────────

type UseHostNotificationsReturn = {
  notifications: HostNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
};

export function useHostNotifications(): UseHostNotificationsReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.hostNotifications();

  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: fetchHostNotifications,
  });

  const notifications = data ?? [];

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const now = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any)
        .from("notifications")
        .update({ is_read: true, read_at: now })
        .eq("id", id);
      if (dbErr) throw new Error(dbErr.message);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<HostNotification[]>(KEY);
      queryClient.setQueryData<HostNotification[]>(KEY, (old) =>
        (old ?? []).map((n) => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
      );
      return { prev };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const now = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase as any)
        .from("notifications")
        .update({ is_read: true, read_at: now })
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (dbErr) throw new Error(dbErr.message);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<HostNotification[]>(KEY);
      const now = new Date().toISOString();
      queryClient.setQueryData<HostNotification[]>(KEY, (old) =>
        (old ?? []).map((n) => ({ ...n, is_read: true, read_at: now }))
      );
      return { prev };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.is_read).length,
    loading: isLoading,
    error: error?.message ?? null,
    markAsRead: markAsReadMutation.mutateAsync,
    markAllAsRead: markAllAsReadMutation.mutateAsync,
  };
}
