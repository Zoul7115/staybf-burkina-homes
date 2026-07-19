import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { TravelerNotification } from "./types";

type RawNotification = {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  is_read: boolean;
  created_at: string;
};

function mapNotificationType(type: string): TravelerNotification["type"] {
  if (type.startsWith("booking_") || type === "new_review") return "booking";
  if (type.startsWith("payment_")) return "booking";
  if (type.startsWith("review_") || type === "new_review") return "review";
  if (type === "message_received") return "message";
  if (type === "payout_completed" || type === "payout_initiated" || type === "payout_failed") return "booking";
  return "promo";
}

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

async function fetchTravelerNotifications(): Promise<TravelerNotification[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("notifications")
    .select("id, type, title, body, is_read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) return [];

  return (data as RawNotification[]).map((n) => ({
    id: n.id,
    type: mapNotificationType(n.type),
    title: n.title ?? "Notification",
    text: n.body ?? "",
    timeLabel: formatTimeLabel(n.created_at),
    unread: !n.is_read,
  }));
}

export function useTravelerNotifications(): { notifications: TravelerNotification[]; unreadCount: number; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.travelerNotifications(),
    queryFn: fetchTravelerNotifications,
    staleTime: 60_000,
  });

  const notifications = data ?? [];
  const unreadCount = notifications.filter((n) => n.unread).length;
  return { notifications, unreadCount, loading: isLoading };
}
