import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { HostBookingItem, BookingStatus, PaymentMethod } from "./types";

type RawPaymentRow = { method: string; status: string };

type RawBookingRow = {
  id: string; reference: string; status: string;
  check_in: string; check_out: string; nights: number;
  guests_adults: number; guests_children: number; guests_infants: number;
  total_amount: number; currency: string; instant_book: boolean;
  created_at: string; confirmed_at: string | null; cancelled_at: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  rooms: { name: string } | null;
  properties: { name: string } | null;
  payments: RawPaymentRow[];
};

// ── Fetcher ───────────────────────────────────────────────────

async function fetchHostBookings(): Promise<HostBookingItem[]> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error(authErr?.message ?? "Non authentifié");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propData, error: propErr } = await (supabase as any)
    .from("properties")
    .select("id")
    .eq("host_id", user.id)
    .is("deleted_at", null);

  if (propErr) throw new Error(propErr.message);

  const propertyIds: string[] = ((propData ?? []) as { id: string }[]).map((p) => p.id);
  if (propertyIds.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbErr } = await (supabase as any)
    .from("bookings")
    .select(`id,reference,status,check_in,check_out,nights,guests_adults,guests_children,guests_infants,total_amount,currency,instant_book,created_at,confirmed_at,cancelled_at,profiles!traveler_id(full_name,avatar_url),rooms!room_id(name),properties!property_id(name),payments!booking_id(method,status)`)
    .in("property_id", propertyIds)
    .order("created_at", { ascending: false })
    .limit(200);

  if (dbErr) throw new Error(dbErr.message);

  return ((data ?? []) as RawBookingRow[]).map((b) => {
    const capturedPayment = (b.payments ?? []).find((p) => p.status === "captured");
    return {
      id: b.id, reference: b.reference, status: b.status as BookingStatus,
      check_in: b.check_in, check_out: b.check_out, nights: b.nights,
      guests_adults: b.guests_adults, guests_children: b.guests_children, guests_infants: b.guests_infants,
      total_amount: b.total_amount, currency: b.currency, instant_book: b.instant_book,
      created_at: b.created_at, confirmed_at: b.confirmed_at, cancelled_at: b.cancelled_at,
      traveler_name: b.profiles?.full_name ?? null, traveler_avatar_url: b.profiles?.avatar_url ?? null,
      room_name: b.rooms?.name ?? null, property_name: b.properties?.name ?? null,
      payment_method: capturedPayment ? (capturedPayment.method as PaymentMethod) : null,
    };
  });
}

// ── Hook ─────────────────────────────────────────────────────

export function useHostBookings(): { bookings: HostBookingItem[]; loading: boolean; error: string | null } {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.hostBookings(),
    queryFn: fetchHostBookings,
  });

  return { bookings: data ?? [], loading: isLoading, error: error?.message ?? null };
}
