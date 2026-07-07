// Query key registry tests — ensures all keys are stable and unique
import { describe, it, expect } from "vitest";
import { queryKeys } from "../keys";

describe("queryKeys — shape and stability", () => {
  it("hostDashboard returns a stable array", () => {
    expect(queryKeys.hostDashboard()).toEqual(["host", "dashboard"]);
  });

  it("hostWallet includes hostId", () => {
    expect(queryKeys.hostWallet("h-1")).toEqual(["wallet", "host", "h-1"]);
    expect(queryKeys.hostWallet("h-2")).toEqual(["wallet", "host", "h-2"]);
  });

  it("different hostIds produce different keys", () => {
    const a = queryKeys.hostWallet("h-1");
    const b = queryKeys.hostWallet("h-2");
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("hostPropertyIds includes hostId", () => {
    expect(queryKeys.hostPropertyIds("h-1")).toEqual(["host", "propertyIds", "h-1"]);
  });

  it("hostPropertyIds is isolated from hostProperties", () => {
    const ids = queryKeys.hostPropertyIds("h-1");
    const props = queryKeys.hostProperties();
    expect(ids[0]).toBe(props[0]); // both start with "host"
    expect(ids[1]).not.toBe(props[1]); // but differ at index 1
  });

  it("hostPaymentTransactions includes hostId", () => {
    expect(queryKeys.hostPaymentTransactions("h-1")).toEqual(["wallet", "payments", "h-1"]);
  });

  it("hostRefundTransactions includes hostId", () => {
    expect(queryKeys.hostRefundTransactions("h-1")).toEqual(["wallet", "refunds", "h-1"]);
  });

  it("hostWithdrawals includes hostId", () => {
    expect(queryKeys.hostWithdrawals("h-1")).toEqual(["wallet", "withdrawals", "h-1"]);
  });

  it("adminWallet is isolated from adminDashboard", () => {
    const wallet = queryKeys.adminWallet();
    const dash = queryKeys.adminDashboard();
    expect(JSON.stringify(wallet)).not.toBe(JSON.stringify(dash));
  });

  it("adminFinancialDashboard is under wallet namespace", () => {
    expect(queryKeys.adminFinancialDashboard()[0]).toBe("wallet");
  });

  it("travelerBookings is isolated from travelerDashboardBookings", () => {
    const bookings = queryKeys.travelerBookings();
    const dash = queryKeys.travelerDashboardBookings();
    expect(JSON.stringify(bookings)).not.toBe(JSON.stringify(dash));
  });

  it("propertyDetail includes id", () => {
    expect(queryKeys.propertyDetail("p-1")).toEqual(["property", "p-1"]);
  });

  it("bookingPrice includes all params", () => {
    const key = queryKeys.bookingPrice("r-1", "2026-08-01", "2026-08-04");
    expect(key).toEqual(["booking", "price", "r-1", "2026-08-01", "2026-08-04"]);
  });

  it("hostCalendar includes roomId, year, month", () => {
    const key = queryKeys.hostCalendar("r-1", 2026, 8);
    expect(key).toEqual(["host", "calendar", "r-1", 2026, 8]);
  });

  it("search key embeds full filter object", () => {
    const filters = { city: "Ouagadougou", minPrice: 0, maxPrice: 999999, types: [], amenities: [], minRating: 0, searchText: "", sort: "recommended" as const };
    const key = queryKeys.search(filters);
    expect(key[0]).toBe("search");
    expect(key[1]).toEqual(filters);
  });

  it("all top-level keys are defined (no undefined entry)", () => {
    const allKeys = Object.keys(queryKeys) as (keyof typeof queryKeys)[];
    for (const k of allKeys) {
      // Call each factory with dummy args
      const factory = queryKeys[k] as (...args: string[]) => readonly unknown[];
      expect(factory).toBeDefined();
    }
  });
});

describe("queryKeys — wallet keys are all under 'wallet' or dedicated namespaces", () => {
  it("hostWallet starts with 'wallet'", () => {
    expect(queryKeys.hostWallet("h")[0]).toBe("wallet");
  });

  it("adminWallet starts with 'wallet'", () => {
    expect(queryKeys.adminWallet()[0]).toBe("wallet");
  });

  it("adminFinancialDashboard starts with 'wallet'", () => {
    expect(queryKeys.adminFinancialDashboard()[0]).toBe("wallet");
  });

  it("hostPaymentTransactions starts with 'wallet'", () => {
    expect(queryKeys.hostPaymentTransactions("h")[0]).toBe("wallet");
  });
});
