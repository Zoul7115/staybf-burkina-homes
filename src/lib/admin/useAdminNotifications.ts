import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";

export type AdminNotification = {
  id: string;
  title: string | null;
  body: string | null;
  type: string;
  is_read: boolean;
  created_at: string;
};

type RawRow = {
  id: string; title: string | null; body: string | null; type: string;
  is_read: boolean; created_at: string;
};

async function fetchAdminNotifications(): Promise<AdminNotification[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("notifications")
    .select("id, title, body, type, is_read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return ((data ?? []) as RawRow[]).map((n) => ({
    id: n.id, title: n.title, body: n.body, type: n.type,
    is_read: n.is_read, created_at: n.created_at,
  }));
}

export type UseAdminNotificationsReturn = {
  notifications: AdminNotification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
};

export function useAdminNotifications(): UseAdminNotificationsReturn {
  const queryClient = useQueryClient();
  const KEY = queryKeys.adminNotifications();

  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: fetchAdminNotifications });
  const notifications = data ?? [];

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<AdminNotification[]>(KEY);
      queryClient.setQueryData<AdminNotification[]>(KEY, (old) =>
        (old ?? []).map((n) => n.id === id ? { ...n, is_read: true } : n)
      );
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("user_id", user.id).eq("is_read", false);
      if (error) throw new Error(error.message);
    },
    onMutate: async () => {
      const prev = queryClient.getQueryData<AdminNotification[]>(KEY);
      queryClient.setQueryData<AdminNotification[]>(KEY, (old) => (old ?? []).map((n) => ({ ...n, is_read: true })));
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: KEY }); },
  });

  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.is_read).length,
    loading: isLoading,
    markAsRead: markAsReadMutation.mutateAsync,
    markAllAsRead: markAllAsReadMutation.mutateAsync,
  };
}
