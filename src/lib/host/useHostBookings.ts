import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { HostBookingItem, BookingStatus, PaymentMethod } from "./types";

type RawPaymentRow = { method: string; status: string };

type RawBookingRow = {
  id: string;
  reference: string;
  status: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests_adults: number;
  guests_children: number;
  guests_infants: number;
  total_amount: number;
  currency: string;
  instant_book: boolean;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  rooms: { name: string } | null;
  properties: { name: string } | null;
  payments: RawPaymentRow[];
};

type UseHostBookingsReturn = {
  bookings: HostBookingItem[];
  loading: boolean;
  error: string | null;
};

export function useHostBookings(): UseHostBookingsReturn {
  const [bookings, setBookings] = useState<HostBookingItem[]>([]);
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

      // Resolve host's property IDs (RLS on bookings uses is_host_of)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: propData, error: propErr } = await (supabase as any)
        .from("properties")
        .select("id")
        .eq("host_id", user.id)
        .is("deleted_at", null);

      if (cancelled) return;
      if (propErr) {
        setError(propErr.message);
        setLoading(false);
        return;
      }

      const propertyIds: string[] = ((propData ?? []) as { id: string }[]).map((p) => p.id);

      if (propertyIds.length === 0) {
        setBookings([]);
        setLoading(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: dbErr } = await (supabase as any)
        .from("bookings")
        .select(
          `
          id,
          reference,
          status,
          check_in,
          check_out,
          nights,
          guests_adults,
          guests_children,
          guests_infants,
          total_amount,
          currency,
          instant_book,
          created_at,
          confirmed_at,
          cancelled_at,
          profiles!traveler_id(full_name, avatar_url),
          rooms!room_id(name),
          properties!property_id(name),
          payments!booking_id(method, status)
          `
        )
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false })
        .limit(200);

      if (cancelled) return;
      if (dbErr) {
        setError(dbErr.message);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as RawBookingRow[];

      const mapped: HostBookingItem[] = rows.map((b) => {
        const capturedPayment = (b.payments ?? []).find((p) => p.status === "captured");
        return {
          id: b.id,
          reference: b.reference,
          status: b.status as BookingStatus,
          check_in: b.check_in,
          check_out: b.check_out,
          nights: b.nights,
          guests_adults: b.guests_adults,
          guests_children: b.guests_children,
          guests_infants: b.guests_infants,
          total_amount: b.total_amount,
          currency: b.currency,
          instant_book: b.instant_book,
          created_at: b.created_at,
          confirmed_at: b.confirmed_at,
          cancelled_at: b.cancelled_at,
          traveler_name: b.profiles?.full_name ?? null,
          traveler_avatar_url: b.profiles?.avatar_url ?? null,
          room_name: b.rooms?.name ?? null,
          property_name: b.properties?.name ?? null,
          payment_method: capturedPayment
            ? (capturedPayment.method as PaymentMethod)
            : null,
        };
      });

      setBookings(mapped);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { bookings, loading, error };
}
