import { describe, expect, it } from "vitest";
import { prevRange } from "@/lib/fin-ai";

describe("previous period for the P&L comparison", () => {
  it("shifts back by the number of months in the range", () => {
    // Full month → previous full month
    expect(prevRange("2026-12-01", "2026-12-31")).toEqual(["2026-11-01", "2026-11-30"]);
    // Single day → 1-month shift
    expect(prevRange("2026-12-10", "2026-12-10")).toEqual(["2026-11-10", "2026-11-10"]);
    // Partial month → same days in previous month
    expect(prevRange("2026-11-01", "2026-11-22")).toEqual(["2026-10-01", "2026-10-22"]);
    // Two-month range → shifts by 2
    expect(prevRange("2026-11-01", "2026-12-31")).toEqual(["2026-09-01", "2026-10-31"]);
  });
  it("is skipped when it would start before the books start", () => {
    expect(prevRange("2026-11-01", "2026-11-14", "2026-11-01")).toBeNull();
    expect(prevRange("2026-12-01", "2026-12-14", "2026-11-01")).toEqual(["2026-11-01", "2026-11-14"]);
  });
});
