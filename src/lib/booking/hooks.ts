// ============================================================
// Booking domain — React Query hooks
// ============================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/storage";
import { queryKeys } from "@/lib/query/keys";
import { computePriceBreakdown } from "./pricingEngine";
import type {
  BookingPriceBreakdown,
  CalculatePriceResponse,
  CreatedBooking,
} from "./types";
import type { PaymentMethod } from "@/lib/host/types";

// ── Room pricing data ─────────────────────────────────────────

type RoomPricingData = {
  basePriceFcfa: number;
  maxGuests: number;
  instantBook: boolean;
  cancellationPolicy: string;
  seasonalPricing: {
    id: string;
    starts_on: string;
    ends_on: string;
    price_fcfa: number;
    min_nights: number;
    priority: number;
    created_at: string;
  }[];
  availabilityOverrides: {
    date: string;
    price_override_fcfa: number | null;
  }[];
};

async function fetchRoomPricingData(
  roomId: string,
  checkIn: string,
  checkOut: string
): Promise<RoomPricingData> {
  const db = supabase as any;

  const [roomRes, seasonalRes, overrideRes] = await Promise.all([
    db.from("rooms")
      .select("base_price_fcfa, max_guests, instant_book, properties!property_id(cancellation_policy)")
      .eq("id", roomId)
      .single(),

    db.from("seasonal_pricing")
      .select("id, starts_on, ends_on, price_fcfa, min_nights, priority, created_at")
      .eq("room_id", roomId)
      .lte("starts_on", checkOut)
      .gte("ends_on", checkIn)
      .order("priority", { ascending: false }),

    db.from("room_availability")
      .select("date, price_override_fcfa")
      .eq("room_id", roomId)
      .gte("date", checkIn)
      .lt("date", checkOut)
      .not("price_override_fcfa", "is", null),
  ]);

  if (roomRes.error || !roomRes.data) throw new Error(roomRes.error?.message ?? "Room not found");

  const prop = Array.isArray(roomRes.data.properties) ? roomRes.data.properties[0] : roomRes.data.properties;

  return {
    basePriceFcfa: roomRes.data.base_price_fcfa,
    maxGuests: roomRes.data.max_guests,
    instantBook: roomRes.data.instant_book,
    cancellationPolicy: prop?.cancellation_policy ?? "moderate",
    seasonalPricing: (seasonalRes.data ?? []) as RoomPricingData["seasonalPricing"],
    availabilityOverrides: (overrideRes.data ?? []) as RoomPricingData["availabilityOverrides"],
  };
}

// ── usePricing ────────────────────────────────────────────────

export type UsePricingResult = {
  pricing: BookingPriceBreakdown | null;
  roomData: RoomPricingData | null;
  loading: boolean;
  error: string | null;
};

export function usePricing(
  roomId: string | null,
  checkIn: string | null,
  checkOut: string | null
): UsePricingResult {
  const enabled = !!roomId && !!checkIn && !!checkOut && checkIn < checkOut;

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.bookingPrice(roomId ?? "", checkIn ?? "", checkOut ?? ""),
    queryFn: () => fetchRoomPricingData(roomId!, checkIn!, checkOut!),
    enabled,
    staleTime: 60_000,
  });

  const pricing = data
    ? computePriceBreakdown({
        basePriceFcfa: data.basePriceFcfa,
        checkIn: checkIn!,
        checkOut: checkOut!,
        seasonalPricing: data.seasonalPricing as any,
        availabilityOverrides: data.availabilityOverrides,
      })
    : null;

  return {
    pricing,
    roomData: data ?? null,
    loading: isLoading && enabled,
    error: error?.message ?? null,
  };
}

// ── useCreateBooking ──────────────────────────────────────────

type CreateBookingInput = {
  room_id: string;
  check_in: string;
  check_out: string;
  guests_adults?: number;
  guests_children?: number;
  guests_infants?: number;
  payment_method: PaymentMethod;
  notes?: string;
};

export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBookingInput) =>
      callEdgeFunction<{ booking: CreatedBooking }>("create-booking", input as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.travelerBookings() });
      queryClient.invalidateQueries({ queryKey: ["traveler", "dashboard", "bookings"] });
    },
  });
}
