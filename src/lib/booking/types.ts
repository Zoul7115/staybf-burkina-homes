// ============================================================
// Booking domain — canonical TypeScript types
// All shapes mirror the real Supabase schema (migrations 0004–0006).
// No fields are invented — every field maps to a real DB column.
// ============================================================

import type { BookingStatus, CancellationPolicy, PaymentMethod } from "@/lib/host/types";

export type { BookingStatus, CancellationPolicy, PaymentMethod };

// ── Pricing ──────────────────────────────────────────────────

export type NightPricing = {
  date: string;
  priceSource: "override" | "seasonal" | "base";
  priceFcfa: number;
};

export type BookingPriceBreakdown = {
  nights: number;
  nightPricing: NightPricing[];
  accommodationAmount: number;
  serviceFeeRate: number;
  serviceFeeAmount: number;
  commissionRate: number;
  commissionAmount: number;
  totalAmount: number;
  hostPayoutAmount: number;
  currency: "XOF";
};

// ── Checkout session ─────────────────────────────────────────

export type CheckoutParams = {
  propertyId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  guestsAdults: number;
  guestsChildren: number;
  guestsInfants: number;
  paymentMethod: PaymentMethod;
};

// ── Created booking ──────────────────────────────────────────

export type CreatedBooking = {
  id: string;
  reference: string;
  status: BookingStatus;
  totalAmount: number;
};

// ── Price calculation request/response ───────────────────────

export type CalculatePriceRequest = {
  room_id: string;
  check_in: string;
  check_out: string;
};

export type CalculatePriceResponse = {
  room_id: string;
  room_name: string;
  base_price_fcfa: number;
  nights: number;
  night_pricing: NightPricing[];
  accommodation_amount: number;
  service_fee_rate: number;
  service_fee_amount: number;
  commission_rate: number;
  commission_amount: number;
  total_amount: number;
  host_payout_amount: number;
  currency: "XOF";
};

// ── DB row types for pricing queries ─────────────────────────

export type SeasonalPricingRow = {
  id: string;
  room_id: string;
  label: string;
  starts_on: string;
  ends_on: string;
  price_fcfa: number;
  min_nights: number;
  priority: number;
};

export type AvailabilityPriceRow = {
  date: string;
  price_override_fcfa: number | null;
};
