import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { HostNotification } from "@/lib/host/types";

type RealtimeInsert = {
  new: {
    id: string; user_id: string; type: string; title: string | null; body: string | null;
    is_read: boolean; read_at: string | null; resource_type: string | null;
    resource_id: string | null; created_at: string;
  };
};

type RealtimeUpdate = {
  new: { id: string; is_read: boolean; read_at: string | null };
};

export function useRealtimeNotifications(userId: string | null, role: "host" | "traveler" | "admin") {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const key = role === "host"
      ? queryKeys.hostNotifications()
      : role === "admin"
        ? queryKeys.adminNotifications()
        : queryKeys.travelerNotifications();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const raw = (payload as unknown as RealtimeInsert).new;

          if (role === "host" || role === "admin") {
            queryClient.setQueryData<HostNotification[]>(key, (old) => {
              const newNotif: HostNotification = {
                id: raw.id,
                user_id: raw.user_id,
                type: raw.type as HostNotification["type"],
                title: raw.title,
                body: raw.body,
                is_read: raw.is_read,
                read_at: raw.read_at,
                resource_type: raw.resource_type,
                resource_id: raw.resource_id,
                created_at: raw.created_at,
              };
              return [newNotif, ...(old ?? [])];
            });
          } else {
            queryClient.invalidateQueries({ queryKey: key });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const raw = (payload as unknown as RealtimeUpdate).new;

          if (role === "host" || role === "admin") {
            queryClient.setQueryData<HostNotification[]>(key, (old) =>
              (old ?? []).map((n) =>
                n.id === raw.id ? { ...n, is_read: raw.is_read, read_at: raw.read_at } : n
              )
            );
          } else {
            queryClient.invalidateQueries({ queryKey: key });
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId, role, queryClient]);
}
