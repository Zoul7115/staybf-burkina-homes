// Wallet utilities unit tests — pure logic (no DB calls)
import { describe, it, expect } from "vitest";
import { groupByMonth, isThisMonth, formatFcfa, formatFcfaShort, percentOf } from "../utils";

// ── formatFcfa ────────────────────────────────────────────────

describe("formatFcfa", () => {
  it("formats zero correctly", () => {
    expect(formatFcfa(0)).toBe("0 FCFA");
  });

  it("formats thousands with French locale separators", () => {
    const result = formatFcfa(100_000);
    expect(result).toContain("FCFA");
    expect(result).toContain("100");
  });
});

// ── formatFcfaShort ───────────────────────────────────────────

describe("formatFcfaShort", () => {
  it("formats values below 1 000 as plain FCFA", () => {
    expect(formatFcfaShort(500)).toBe("500 FCFA");
  });

  it("formats thousands as k FCFA", () => {
    expect(formatFcfaShort(50_000)).toBe("50 k FCFA");
  });

  it("formats millions as M FCFA", () => {
    expect(formatFcfaShort(1_500_000)).toBe("1,5 M FCFA");
  });

  it("rounds millions to 1 decimal", () => {
    expect(formatFcfaShort(2_000_000)).toBe("2,0 M FCFA");
  });
});

// ── percentOf ────────────────────────────────────────────────

describe("percentOf", () => {
  it("returns 0 when whole is 0", () => {
    expect(percentOf(100, 0)).toBe(0);
  });

  it("computes correct percentage", () => {
    expect(percentOf(25, 100)).toBe(25);
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
  });

  it("returns 100 when part equals whole", () => {
    expect(percentOf(50, 50)).toBe(100);
  });
});

// ── isThisMonth ───────────────────────────────────────────────

describe("isThisMonth", () => {
  it("returns true for current month ISO string", () => {
    const now = new Date().toISOString();
    expect(isThisMonth(now)).toBe(true);
  });

  it("returns false for last year's date", () => {
    expect(isThisMonth("2020-01-15T00:00:00.000Z")).toBe(false);
  });

  it("returns false for a date 2 years ago", () => {
    expect(isThisMonth("2023-06-01T00:00:00.000Z")).toBe(false);
  });
});

// ── groupByMonth ──────────────────────────────────────────────

describe("groupByMonth", () => {
  it("returns empty array for empty input", () => {
    expect(groupByMonth([])).toEqual([]);
  });

  it("groups entries by month and sums amounts", () => {
    const entries = [
      { createdAt: "2026-01-10T00:00:00Z", amountFcfa: 10_000 },
      { createdAt: "2026-01-20T00:00:00Z", amountFcfa: 5_000 },
      { createdAt: "2026-02-05T00:00:00Z", amountFcfa: 20_000 },
    ];
    const result = groupByMonth(entries);
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(15_000); // Jan
    expect(result[1].value).toBe(20_000); // Feb
  });

  it("sorts by month ascending", () => {
    const entries = [
      { createdAt: "2026-03-01T00:00:00Z", amountFcfa: 1_000 },
      { createdAt: "2026-01-01T00:00:00Z", amountFcfa: 2_000 },
      { createdAt: "2026-02-01T00:00:00Z", amountFcfa: 3_000 },
    ];
    const result = groupByMonth(entries);
    expect(result[0].label).toMatch(/Jan/);
    expect(result[1].label).toMatch(/Fév/);
    expect(result[2].label).toMatch(/Mar/);
  });

  it("produces labels with month abbreviation and year", () => {
    const entries = [{ createdAt: "2026-08-01T00:00:00Z", amountFcfa: 5_000 }];
    const result = groupByMonth(entries);
    expect(result[0].label).toContain("2026");
    expect(result[0].label).toMatch(/Aoû|Aug/); // French abbreviation
  });

  it("single month — sums all entries correctly", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      createdAt: `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      amountFcfa: 1_000,
    }));
    const result = groupByMonth(entries);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(10_000);
  });

  it("multiple years produce separate groups", () => {
    const entries = [
      { createdAt: "2025-01-01T00:00:00Z", amountFcfa: 1_000 },
      { createdAt: "2026-01-01T00:00:00Z", amountFcfa: 2_000 },
    ];
    const result = groupByMonth(entries);
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(1_000);
    expect(result[1].value).toBe(2_000);
  });
});
