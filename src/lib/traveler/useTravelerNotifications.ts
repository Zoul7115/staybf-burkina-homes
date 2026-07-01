import { useEffect, useState } from "react";
import { differenceInDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/lib/supabase/client";
import type { TravelerNotification } from "./types";

export function useTravelerNotifications(): {
  notifications: TravelerNotification[];
  unreadCount: number;
  loading: boolean;
} {
  const [notifications, setNotifications] = useState<TravelerNotification[]>([]);
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

      // Derive notifications from recent/upcoming bookings — no separate table needed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("bookings")
        .select("id, reference, check_in, status, created_at, properties!property_id(name)")
        .eq("traveler_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12);

      if (cancelled) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const items: TravelerNotification[] = [];
      const seen = new Set<string>();

      type RawBooking = {
        id: string;
        reference: string;
        check_in: string;
        status: string;
        created_at: string;
        properties: { name: string } | null;
      };

      for (const b of (data ?? []) as RawBooking[]) {
        const checkIn = new Date(b.check_in);
        const daysUntil = differenceInDays(checkIn, today);
        const propName = b.properties?.name ?? "";

        // Upcoming stay reminder (within 7 days)
        if (
          (b.status === "confirmed" || b.status === "checked_in") &&
          daysUntil >= 0 &&
          daysUntil <= 7
        ) {
          const key = `stay-${b.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            items.push({
              id: key,
              type: "stay",
              title:
                daysUntil === 0
                  ? "Votre séjour commence aujourd'hui !"
                  : `Séjour à venir dans ${daysUntil} jour${daysUntil > 1 ? "s" : ""}`,
              text: propName
                ? `Préparez votre arrivée — ${propName}`
                : "Préparez votre arrivée",
              timeLabel: format(checkIn, "d MMM", { locale: fr }),
              unread: daysUntil <= 3,
            });
          }
        }

        // Booking confirmation notification
        if (b.status === "confirmed" || b.status === "pending_payment") {
          const key = `booking-${b.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            items.push({
              id: key,
              type: "booking",
              title: "Réservation confirmée",
              text: `${b.reference}${propName ? ` · ${propName}` : ""}`,
              timeLabel: "récemment",
              unread: true,
            });
          }
        }

        // Completed stay — leave a review reminder
        if (b.status === "completed") {
          const key = `review-${b.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            items.push({
              id: key,
              type: "review",
              title: "Partagez votre expérience",
              text: propName ? `Laissez un avis pour ${propName}` : "Laissez un avis pour votre séjour",
              timeLabel: format(new Date(b.check_in), "d MMM", { locale: fr }),
              unread: false,
            });
          }
        }

        if (items.length >= 8) break;
      }

      setNotifications(items);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const unreadCount = notifications.filter((n) => n.unread).length;
  return { notifications, unreadCount, loading };
}
