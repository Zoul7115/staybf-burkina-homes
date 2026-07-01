import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { toPublicUrl, PLACEHOLDER_IMG } from "@/lib/property/usePropertyDetail";
import type { DashboardBooking } from "./types";

const UPCOMING_STATUSES = ["pending_payment", "confirmed", "checked_in"];

export function useDashboardBookings(): { bookings: DashboardBooking[]; loading: boolean } {
  const [bookings, setBookings] = useState<DashboardBooking[]>([]);
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
      const { data } = await (supabase as any)
        .from("bookings")
        .select(`
          id,
          reference,
          check_in,
          check_out,
          status,
          properties!property_id(
            id,
            name,
            address,
            cities!city_id(name),
            property_images(storage_path, is_cover, position)
          )
        `)
        .eq("traveler_id", user.id)
        .in("status", UPCOMING_STATUSES)
        .order("check_in", { ascending: true })
        .limit(3);

      if (!cancelled) {
        type RawRow = {
          id: string;
          reference: string;
          check_in: string;
          check_out: string;
          status: string;
          properties: {
            id: string;
            name: string;
            address: string | null;
            cities: { name: string } | null;
            property_images: { storage_path: string; is_cover: boolean; position: number }[];
          } | null;
        };

        setBookings(
          ((data ?? []) as RawRow[]).map((r) => {
            const imgs = (r.properties?.property_images ?? []).sort(
              (a, b) => a.position - b.position,
            );
            const cover = imgs.find((i) => i.is_cover) ?? imgs[0] ?? null;
            return {
              id: r.id,
              reference: r.reference,
              propertyId: r.properties?.id ?? "",
              propertyName: r.properties?.name ?? "",
              cityName: r.properties?.cities?.name ?? null,
              coverImageUrl: cover ? toPublicUrl(cover.storage_path) : PLACEHOLDER_IMG,
              checkIn: r.check_in,
              checkOut: r.check_out,
              status: r.status,
            };
          }),
        );
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { bookings, loading };
}
