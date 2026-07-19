// ============================================================
// Client-side pricing engine
// Computes the full price breakdown from room data + seasonal pricing
// + per-night overrides. Mirrors the server-side calculation in
// supabase/functions/calculate-booking-price/index.ts exactly.
// ============================================================

import type {
  BookingPriceBreakdown,
  NightPricing,
  SeasonalPricingRow,
  AvailabilityPriceRow,
} from "./types";

const SERVICE_FEE_RATE = 0.10;
const COMMISSION_RATE_STANDARD = 0.15;
const COMMISSION_RATE_SUBSCRIBED = 0.0;

export function computePriceBreakdown(opts: {
  basePriceFcfa: number;
  checkIn: string;
  checkOut: string;
  seasonalPricing: SeasonalPricingRow[];
  availabilityOverrides: AvailabilityPriceRow[];
  isHostSubscribed?: boolean;
}): BookingPriceBreakdown {
  const { basePriceFcfa, checkIn, checkOut, seasonalPricing, availabilityOverrides, isHostSubscribed = false } = opts;

  const nights = daysInRange(checkIn, checkOut);
  const nightPricing: NightPricing[] = [];

  const overrideMap = new Map<string, number>();
  for (const row of availabilityOverrides) {
    if (row.price_override_fcfa !== null) {
      overrideMap.set(row.date, row.price_override_fcfa);
    }
  }

  for (let i = 0; i < nights; i++) {
    const date = addDays(checkIn, i);
    const override = overrideMap.get(date);

    if (override !== undefined) {
      nightPricing.push({ date, priceSource: "override", priceFcfa: override });
      continue;
    }

    const seasonal = bestSeasonalRate(date, nights, seasonalPricing);
    if (seasonal !== null) {
      nightPricing.push({ date, priceSource: "seasonal", priceFcfa: seasonal });
      continue;
    }

    nightPricing.push({ date, priceSource: "base", priceFcfa: basePriceFcfa });
  }

  const accommodationAmount = nightPricing.reduce((sum, n) => sum + n.priceFcfa, 0);
  const serviceFeeAmount = Math.round(accommodationAmount * SERVICE_FEE_RATE);
  const commissionRate = isHostSubscribed ? COMMISSION_RATE_SUBSCRIBED : COMMISSION_RATE_STANDARD;
  const commissionAmount = Math.round(accommodationAmount * commissionRate);
  const totalAmount = accommodationAmount + serviceFeeAmount;
  const hostPayoutAmount = accommodationAmount - commissionAmount;

  return {
    nights,
    nightPricing,
    accommodationAmount,
    serviceFeeRate: SERVICE_FEE_RATE,
    serviceFeeAmount,
    commissionRate,
    commissionAmount,
    totalAmount,
    hostPayoutAmount,
    currency: "XOF",
  };
}

function bestSeasonalRate(date: string, totalNights: number, rules: SeasonalPricingRow[]): number | null {
  const matching = rules.filter((r) => r.starts_on <= date && r.ends_on >= date && r.min_nights <= totalNights);
  if (matching.length === 0) return null;
  matching.sort((a, b) => b.priority - a.priority);
  return matching[0].price_fcfa;
}

function daysInRange(checkIn: string, checkOut: string): number {
  const inMs = new Date(checkIn).getTime();
  const outMs = new Date(checkOut).getTime();
  return Math.max(1, Math.round((outMs - inMs) / 86_400_000));
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
