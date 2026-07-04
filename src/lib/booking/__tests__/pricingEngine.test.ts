import { describe, it, expect } from "vitest";
import { computePriceBreakdown } from "../pricingEngine";
import type { SeasonalPricingRow, AvailabilityPriceRow } from "../types";

const BASE_PRICE = 50_000;
const CHECK_IN = "2026-08-01";
const CHECK_OUT = "2026-08-04"; // 3 nights

describe("computePriceBreakdown — base pricing", () => {
  it("uses base price when no seasonal rules or overrides", () => {
    const result = computePriceBreakdown({
      basePriceFcfa: BASE_PRICE,
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      seasonalPricing: [],
      availabilityOverrides: [],
    });

    expect(result.nights).toBe(3);
    expect(result.accommodationAmount).toBe(150_000);
    expect(result.nightPricing.every((n) => n.priceSource === "base")).toBe(true);
    expect(result.nightPricing.every((n) => n.priceFcfa === BASE_PRICE)).toBe(true);
  });

  it("computes fees with correct formula", () => {
    const result = computePriceBreakdown({
      basePriceFcfa: BASE_PRICE,
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      seasonalPricing: [],
      availabilityOverrides: [],
    });

    expect(result.serviceFeeAmount).toBe(Math.round(150_000 * 0.10));
    expect(result.commissionAmount).toBe(Math.round(150_000 * 0.15));
    expect(result.totalAmount).toBe(150_000 + result.serviceFeeAmount);
    expect(result.hostPayoutAmount).toBe(150_000 - result.commissionAmount);
  });

  it("uses 0% commission when host is subscribed", () => {
    const result = computePriceBreakdown({
      basePriceFcfa: BASE_PRICE,
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      seasonalPricing: [],
      availabilityOverrides: [],
      isHostSubscribed: true,
    });

    expect(result.commissionRate).toBe(0);
    expect(result.commissionAmount).toBe(0);
    expect(result.hostPayoutAmount).toBe(result.accommodationAmount);
  });
});

describe("computePriceBreakdown — seasonal pricing", () => {
  const seasonal: SeasonalPricingRow[] = [
    { id: "s1", room_id: "r1", label: "High season", starts_on: "2026-07-01", ends_on: "2026-08-31", price_fcfa: 75_000, min_nights: 1, priority: 10 },
  ];

  it("applies seasonal rate when date falls in range", () => {
    const result = computePriceBreakdown({
      basePriceFcfa: BASE_PRICE,
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      seasonalPricing: seasonal,
      availabilityOverrides: [],
    });

    expect(result.nightPricing.every((n) => n.priceSource === "seasonal")).toBe(true);
    expect(result.accommodationAmount).toBe(75_000 * 3);
  });

  it("respects min_nights requirement — skips seasonal if stay too short", () => {
    const longStaySeasonal: SeasonalPricingRow[] = [
      { id: "s2", room_id: "r1", label: "Week deal", starts_on: "2026-07-01", ends_on: "2026-08-31", price_fcfa: 60_000, min_nights: 7, priority: 5 },
    ];
    const result = computePriceBreakdown({
      basePriceFcfa: BASE_PRICE,
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      seasonalPricing: longStaySeasonal,
      availabilityOverrides: [],
    });
    expect(result.nightPricing[0].priceSource).toBe("base");
  });

  it("picks highest priority when multiple seasonal rules overlap", () => {
    const overlapping: SeasonalPricingRow[] = [
      { id: "s3", room_id: "r1", label: "Low", starts_on: "2026-08-01", ends_on: "2026-08-31", price_fcfa: 55_000, min_nights: 1, priority: 1 },
      { id: "s4", room_id: "r1", label: "High", starts_on: "2026-08-01", ends_on: "2026-08-31", price_fcfa: 80_000, min_nights: 1, priority: 20 },
    ];
    const result = computePriceBreakdown({ basePriceFcfa: BASE_PRICE, checkIn: CHECK_IN, checkOut: CHECK_OUT, seasonalPricing: overlapping, availabilityOverrides: [] });
    expect(result.nightPricing[0].priceFcfa).toBe(80_000);
  });
});

describe("computePriceBreakdown — price overrides", () => {
  const overrides: AvailabilityPriceRow[] = [
    { date: "2026-08-01", price_override_fcfa: 100_000 },
    { date: "2026-08-02", price_override_fcfa: null },
  ];

  it("override takes precedence over seasonal and base", () => {
    const seasonal: SeasonalPricingRow[] = [
      { id: "s1", room_id: "r1", label: "H", starts_on: "2026-07-01", ends_on: "2026-08-31", price_fcfa: 75_000, min_nights: 1, priority: 10 },
    ];
    const result = computePriceBreakdown({
      basePriceFcfa: BASE_PRICE,
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      seasonalPricing: seasonal,
      availabilityOverrides: overrides,
    });

    expect(result.nightPricing[0].priceSource).toBe("override");
    expect(result.nightPricing[0].priceFcfa).toBe(100_000);
    expect(result.nightPricing[1].priceSource).toBe("seasonal"); // null override → falls through
  });
});
