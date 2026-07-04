import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";

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

export const UPCOMING_STATUSES: BookingStatus[] = ["pending_payment", "confirmed", "checked_in"];

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchBookings(): Promise<SupabaseBooking[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbErr } = await (supabase as any)
    .from("bookings")
    .select(`id,reference,property_id,check_in,check_out,nights,guests_adults,total_amount,status,properties(id,name,address,type,host_id)`)
    .eq("traveler_id", user.id)
    .order("check_in", { ascending: false });

  if (dbErr) throw new Error(dbErr.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any) as SupabaseBooking[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBookings(): {
  upcoming: SupabaseBooking[];
  past: SupabaseBooking[];
  loading: boolean;
  error: string | null;
} {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.travelerBookings(),
    queryFn: fetchBookings,
    staleTime: 30_000,
  });

  const bookings = data ?? [];
  const upcoming = bookings.filter((b) => UPCOMING_STATUSES.includes(b.status));
  const past = bookings.filter((b) => !UPCOMING_STATUSES.includes(b.status));

  return { upcoming, past, loading: isLoading, error: error?.message ?? null };
}
