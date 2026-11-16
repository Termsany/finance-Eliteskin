import { describe, it, expect } from "vitest";
import { computeBudget, monthProgress } from "@/lib/budget";

describe("monthProgress", () => {
  it("day and days of the month", () => {
    expect(monthProgress("2026-11-15")).toMatchObject({ day: 15, days: 30 });
    expect(monthProgress("2026-02-14").days).toBe(28);
    expect(monthProgress("2026-11-30").frac).toBe(1);
  });
});

describe("computeBudget", () => {
  const base = { today: "2026-11-15", grossMarginPct: 40, fixedMonthly: 80000, monthOpex: 80000 };
  it("sales target: pace and projection at mid-month", () => {
    const b = computeBudget({ ...base, monthSales: 300000, monthNet: 0, salesTarget: 500000, profitTarget: null });
    expect(b.sales.pct).toBe(60);                 // 300k of 500k
    expect(b.sales.expected_by_now).toBe(250000); // half the month
    expect(b.sales.on_track).toBe(true);          // 300k >= 250k
    expect(b.sales.projected).toBe(600000);       // run-rate to month end
  });
  it("behind pace flags not on track", () => {
    const b = computeBudget({ ...base, monthSales: 200000, monthNet: 0, salesTarget: 500000, profitTarget: null });
    expect(b.sales.on_track).toBe(false);          // 200k < 250k expected
  });
  it("break-even = fixed / gross-margin ratio", () => {
    const b = computeBudget({ ...base, monthSales: 150000, monthNet: 0, salesTarget: null, profitTarget: null });
    expect(b.breakeven.sales).toBe(200000);        // 80000 / 0.40
    expect(b.breakeven.covered_pct).toBe(75);      // 150k / 200k
    expect(b.breakeven.reached).toBe(false);
    expect(b.breakeven.remaining).toBe(50000);
  });
  it("no target → nulls, no crash", () => {
    const b = computeBudget({ ...base, monthSales: 100000, monthNet: 0, salesTarget: null, profitTarget: null });
    expect(b.sales).toMatchObject({ target: null, actual: 100000, pct: null, on_track: null });
  });
  it("no gross margin → no break-even", () => {
    const b = computeBudget({ ...base, grossMarginPct: null, monthSales: 0, monthNet: 0, salesTarget: null, profitTarget: null });
    expect(b.breakeven.sales).toBe(null);
  });
});
