import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { AdminBookingRow } from "./types";

type RawRow = {
  id: string; reference: string; status: string; check_in: string; check_out: string;
  nights: number; total_amount: number; currency: string; payment_status: string | null; created_at: string;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
  rooms: { name: string; properties: { name: string; profiles: { full_name: string | null } | { full_name: string | null }[] | null } | { name: string; profiles: unknown }[] | null } | { name: string; properties: unknown }[] | null;
};

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function fetchAdminReservations(): Promise<AdminBookingRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbErr } = await (supabase as any)
    .from("bookings")
    .select(`id,reference,status,check_in,check_out,nights,total_amount,currency,payment_status,created_at,profiles!traveler_id(full_name),rooms!room_id(name,properties!property_id(name,profiles!host_id(full_name)))`)
    .order("created_at", { ascending: false })
    .limit(300);

  if (dbErr) throw new Error(dbErr.message);

  return ((data ?? []) as RawRow[]).map((b) => {
    const traveler = unwrap(b.profiles);
    const room = unwrap(b.rooms as RawRow["rooms"]);
    const roomObj = room as { name: string; properties: unknown } | null;
    const prop = roomObj ? unwrap(roomObj.properties as RawRow["rooms"]) : null;
    const propObj = prop as { name: string; profiles: unknown } | null;
    const host = propObj ? unwrap(propObj.profiles as RawRow["profiles"]) : null;
    return {
      id: b.id, reference: b.reference, status: b.status, checkIn: b.check_in, checkOut: b.check_out,
      nights: b.nights, totalAmount: b.total_amount, currency: b.currency, paymentStatus: b.payment_status,
      travelerName: traveler?.full_name ?? null, hostName: host?.full_name ?? null,
      propertyName: propObj?.name ?? null, roomName: roomObj?.name ?? null, createdAt: b.created_at,
    };
  });
}

export type UseAdminReservationsReturn = {
  bookings: AdminBookingRow[];
  loading: boolean;
  error: string | null;
};

export function useAdminReservations(): UseAdminReservationsReturn {
  const { data, isLoading, error } = useQuery({ queryKey: queryKeys.adminReservations(), queryFn: fetchAdminReservations });
  return { bookings: data ?? [], loading: isLoading, error: error?.message ?? null };
}
