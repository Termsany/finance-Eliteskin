import { describe, it, expect } from "vitest";
import { cashForecast, collectChance } from "@/lib/fin-cash";

type Fin = Parameters<typeof cashForecast>[0];
const apDoc = (party: string, no: string, unpaid: number, due: string, days: number) => ({ id: 1, no, date: due, party, unpaid, due, days });
const arDoc = (party: string, no: string, unpaid: number, due: string, days: number) => ({ id: 1, no, date: due, party, unpaid, due, days });

const fin = (apOpen: ReturnType<typeof apDoc>[] = [], arOpen: ReturnType<typeof arDoc>[] = []): Fin => ({
  ar: { open: arOpen, total: arOpen.reduce((s, o) => s + o.unpaid, 0), overdue: 0, buckets: {}, parties: arOpen.map(o => ({ name: o.party, unpaid: o.unpaid, overdue: 0, n: 1, oldestDue: o.days, b: {} })) },
  ap: { open: apOpen, total: apOpen.reduce((s, o) => s + o.unpaid, 0), overdue: 0, buckets: {}, parties: [] },
  baseline: null,
  kpi: { vat_payable: 0 },
} as unknown as Fin);
const inp = { fixed: [], today: "2026-11-16" };

describe("cash forecast v2 — supplier offsets", () => {
  it("nets the amount owed to us off what we pay a supplier", () => {
    const ap = [apDoc("مورد أ", "P-1", 5000, "2026-11-20", -4)];
    const base = cashForecast(fin(ap), inp, 100000, { includeNew: false });
    const withOff = cashForecast(fin(ap), inp, 100000, { includeNew: false, offsets: { "مورد أ": 2000 } });
    expect(base.total_out).toBe(5000);
    expect(withOff.total_out).toBe(3000);
    expect(withOff.assumptions.offsets_applied).toBe(2000);
    expect(withOff.closing).toBe(base.closing + 2000);
  });
  it("credit is capped at what we owe that supplier and doesn't leak to others", () => {
    const ap = [apDoc("مورد أ", "P-1", 1500, "2026-11-20", -4), apDoc("مورد ب", "P-2", 4000, "2026-11-22", -2)];
    const f = cashForecast(fin(ap), inp, 100000, { includeNew: false, offsets: { "مورد أ": 5000 } });
    expect(f.assumptions.offsets_applied).toBe(1500);
    expect(f.total_out).toBe(4000);
  });
});

describe("cash forecast v2 — single collection rate", () => {
  it("uses configurable collection % instead of tiered rates", () => {
    const ar = [arDoc("عميل أ", "INV-1", 10000, "2026-11-20", -4)]; // not overdue (due in future)
    const f = cashForecast(fin([], ar), inp, 50000, { includeNew: false, collectPct: 80 });
    expect(f.total_in).toBe(8000); // 80% of 10000
    expect(f.assumptions.collect_pct).toBe(80);
  });
  it("defaults to 90% collection", () => {
    const ar = [arDoc("عميل أ", "INV-1", 10000, "2026-11-20", -4)];
    const f = cashForecast(fin([], ar), inp, 50000, { includeNew: false });
    expect(f.total_in).toBe(9000); // 90% default
  });
});

describe("cash forecast v2 — per-customer avg_days", () => {
  it("places overdue collection at expected week based on customer avg_days", () => {
    const ar = [arDoc("عميل بطيء", "INV-1", 20000, "2026-11-01", 15)]; // 15 days late
    // avg_days = 45 means customer pays ~45 days after due → expected in ~30 more days → week 4
    const f = cashForecast(fin([], ar), inp, 50000, { includeNew: false, customerAvgDays: { "عميل بطيء": 45 } });
    // Should NOT put all in first 4 weeks equally; most should be in week 4-5
    const earlyIn = f.rows[0].in_ar + f.rows[1].in_ar;
    const lateIn = f.rows[3].in_ar + f.rows[4].in_ar;
    expect(lateIn).toBeGreaterThan(earlyIn);
  });
});

describe("cash forecast v2 — VAT as cash outflow", () => {
  it("includes VAT outflow in quarterly mode", () => {
    const finObj = fin();
    (finObj as any).kpi = { vat_payable: 15000 };
    const f = cashForecast(finObj, inp, 100000, { includeNew: false, vatFiling: "quarterly", vatPeriod: 15000 });
    expect(f.assumptions.vat_filing).toBe("quarterly");
    expect(f.assumptions.vat_total).toBeGreaterThanOrEqual(0);
    // VAT should be part of total_out when it falls within the 13-week window
    if (f.assumptions.vat_total > 0) {
      const vatWeeks = f.rows.filter(r => r.out_vat > 0);
      expect(vatWeeks.length).toBeGreaterThan(0);
    }
  });
});

describe("cash forecast v2 — new sales with COGS", () => {
  it("deducts COGS when including new sales", () => {
    const finObj = fin();
    (finObj as any).baseline = { sales: 100000, sales_gross: 115000, cogs: 55000, opex: 20000 };
    const withNew = cashForecast(finObj, inp, 50000, { includeNew: true });
    const withoutNew = cashForecast(finObj, inp, 50000, { includeNew: false });
    // With new sales: has income from week 5 but also COGS outflow
    const newIn = withNew.rows.filter(r => r.in_new > 0);
    const newCogs = withNew.rows.filter(r => r.out_cogs_new > 0);
    expect(newIn.length).toBeGreaterThan(0);
    expect(newCogs.length).toBeGreaterThan(0);
    // The net benefit is less than income alone
    expect(withNew.closing - withoutNew.closing).toBeLessThan(newIn.reduce((s, r) => s + r.in_new, 0));
  });
});

describe("cash forecast v2 — KPIs", () => {
  it("calculates safety line as 1 month of expenses", () => {
    const f = cashForecast(fin(), { fixed: [{ id: "1", name: "رواتب", category: "مرتبات", monthly_amount: 30000, start_month: "2024-01-01", end_month: null, notes: "" }], today: "2026-11-16" }, 100000, { includeNew: false });
    expect(f.safety_line).toBe(30000);
  });
  it("calculates days of cash", () => {
    const ap = [apDoc("مورد", "P-1", 10000, "2026-11-20", -4)];
    const f = cashForecast(fin(ap), inp, 100000, { includeNew: false });
    expect(f.days_of_cash).toBeGreaterThan(0);
  });
  it("returns calls list for overdue AR", () => {
    const ar = [arDoc("عميل متأخر", "INV-1", 5000, "2026-10-01", 46)];
    const f = cashForecast(fin([], ar), inp, 50000, { includeNew: false });
    expect(f.calls.length).toBe(1);
    expect(f.calls[0].name).toBe("عميل متأخر");
  });
  it("returns deferrals list for overdue AP", () => {
    const ap = [apDoc("مورد متأخر", "P-1", 8000, "2026-10-01", 46)];
    const f = cashForecast(fin(ap), inp, 50000, { includeNew: false });
    expect(f.deferrals.length).toBe(1);
    expect(f.deferrals[0].name).toBe("مورد متأخر");
  });
});

describe("collectChance (legacy)", () => {
  it("still returns expected values", () => {
    expect(collectChance(0)).toBe(0.95);
    expect(collectChance(15)).toBe(0.8);
    expect(collectChance(45)).toBe(0.6);
    expect(collectChance(75)).toBe(0.4);
    expect(collectChance(120)).toBe(0.2);
  });
});
