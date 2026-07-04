import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { toPublicUrl, PLACEHOLDER_IMG } from "@/lib/shared";
import type { DashboardBooking } from "./types";

const UPCOMING_STATUSES = ["pending_payment", "confirmed", "checked_in"];

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

async function fetchDashboardBookings(): Promise<DashboardBooking[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("bookings")
    .select(`id,reference,check_in,check_out,status,properties!property_id(id,name,address,cities!city_id(name),property_images(storage_path,is_cover,position))`)
    .eq("traveler_id", user.id)
    .in("status", UPCOMING_STATUSES)
    .order("check_in", { ascending: true })
    .limit(3);

  return ((data ?? []) as RawRow[]).map((r) => {
    const prop = Array.isArray(r.properties) ? (r.properties[0] ?? null) : r.properties;
    const imgs = (prop?.property_images ?? []).sort((a, b) => a.position - b.position);
    const cover = imgs.find((i) => i.is_cover) ?? imgs[0] ?? null;
    const cities = prop?.cities ? (Array.isArray(prop.cities) ? (prop.cities[0] ?? null) : prop.cities) : null;
    return {
      id: r.id,
      reference: r.reference,
      propertyId: prop?.id ?? "",
      propertyName: prop?.name ?? "",
      cityName: cities?.name ?? null,
      coverImageUrl: cover ? toPublicUrl(cover.storage_path) : PLACEHOLDER_IMG,
      checkIn: r.check_in,
      checkOut: r.check_out,
      status: r.status,
    };
  });
}

export function useDashboardBookings(): { bookings: DashboardBooking[]; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.travelerDashboardBookings(),
    queryFn: fetchDashboardBookings,
    staleTime: 30_000,
  });

  return { bookings: data ?? [], loading: isLoading };
}
