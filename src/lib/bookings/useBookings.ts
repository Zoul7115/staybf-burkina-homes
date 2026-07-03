import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "cancelled_by_traveler"
  | "cancelled_by_host"
  | "cancelled_by_system"
  | "no_show"
  | "disputed";

export interface BookingProperty {
  id: string;
  name: string;
  address: string;
  type: string;
  host_id: string;
}

export interface SupabaseBooking {
  id: string;
  reference: string;
  property_id: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests_adults: number;
  total_amount: number;
  status: BookingStatus;
  properties: BookingProperty;
}

const UPCOMING_STATUSES: BookingStatus[] = ["pending_payment", "confirmed", "checked_in"];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBookings(): {
  upcoming: SupabaseBooking[];
  past: SupabaseBooking[];
  loading: boolean;
  error: string | null;
} {
  const [bookings, setBookings] = useState<SupabaseBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) { setLoading(false); setError("Non authentifié"); }
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: dbErr } = await (supabase as any)
        .from("bookings")
        .select(`
          id,
          reference,
          property_id,
          check_in,
          check_out,
          nights,
          guests_adults,
          total_amount,
          status,
          properties(id, name, address, type, host_id)
        `)
        .eq("traveler_id", user.id)
        .order("check_in", { ascending: false });

      if (!cancelled) {
        if (dbErr) {
          setError(dbErr.message);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setBookings((data ?? []) as any as SupabaseBooking[]);
        }
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const upcoming = bookings.filter((b) => UPCOMING_STATUSES.includes(b.status));
  const past = bookings.filter((b) => !UPCOMING_STATUSES.includes(b.status));

  return { upcoming, past, loading, error };
}

export { UPCOMING_STATUSES };
