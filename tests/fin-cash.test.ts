import { describe, it, expect } from "vitest";
import { cashForecast } from "@/lib/fin-cash";

type Fin = Parameters<typeof cashForecast>[0];
const apDoc = (party: string, no: string, unpaid: number, due: string, days: number) => ({ id: 1, no, date: due, party, unpaid, due, days });
// minimal finance object: only the fields cashForecast reads
const fin = (apOpen: ReturnType<typeof apDoc>[]): Fin => ({ ar: { open: [] }, ap: { open: apOpen }, baseline: null } as unknown as Fin);
const inp = { fixed: [], today: "2026-11-16" };

describe("cash forecast — supplier offsets", () => {
  it("nets the amount owed to us off what we pay a supplier", () => {
    const ap = [apDoc("مورد أ", "P-1", 5000, "2026-11-20", -4)];
    const base = cashForecast(fin(ap), inp, 100000, { includeNew: false });
    const withOff = cashForecast(fin(ap), inp, 100000, { includeNew: false, offsets: { "مورد أ": 2000 } });
    expect(base.total_out).toBe(5000);
    expect(withOff.total_out).toBe(3000);                 // 5000 − 2000 offset
    expect(withOff.assumptions.offsets_applied).toBe(2000);
    expect(withOff.closing).toBe(base.closing + 2000);
  });
  it("credit is capped at what we owe that supplier and doesn't leak to others", () => {
    const ap = [apDoc("مورد أ", "P-1", 1500, "2026-11-20", -4), apDoc("مورد ب", "P-2", 4000, "2026-11-22", -2)];
    const f = cashForecast(fin(ap), inp, 100000, { includeNew: false, offsets: { "مورد أ": 5000 } });
    // only 1500 of أ's 5000 credit can be used; ب untouched
    expect(f.assumptions.offsets_applied).toBe(1500);
    expect(f.total_out).toBe(4000);
  });
});
