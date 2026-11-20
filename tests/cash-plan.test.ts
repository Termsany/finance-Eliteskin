import { describe, it, expect } from "vitest";
import { simulate, financeTerm, planRows, cashPlan, annuity, unitNet, manualFinance, type PlanInputs, type PlanOpts } from "@/lib/cash-plan";

// 16 Nov: 15 of 30 days left → this month's expenses are half
const p: PlanInputs = {
  today: "2026-11-16", opening: 10000, opening_as_of: "2026-11-16",
  ar: [{ unpaid: 20000, due: "2026-10-01" }],                 // overdue
  ap: [{ party: "مورد", unpaid: 50000, due: "2026-11-20" }],  // due this month
  offsets: {}, vat_due: 0,
  base: { sales: 100000, cogs_ratio: 0.5, opex: 30000, months: 12 },
  lag_in: 1, lag_out: 1, dso: 45,
  plan_cogs_ratio: 0.5, products: [],
};
const o: PlanOpts = { sales: 100000, collect: 0.9, cut: 0, deferAp: 0, lagIn: 1, buffer: 0, rate: 10, grace: 0, cogsRatio: 0.5, financing: null };

describe("simulate", () => {
  it("collects 90% of overdue, half now and half next month; this month's expenses pro rata", () => {
    const s = simulate(p, o, 0, 12);
    expect(s.ar[0]).toBe(9000); expect(s.ar[1]).toBe(9000);
    expect(s.opex[0]).toBe(15000); expect(s.opex[1]).toBe(30000);
    expect(s.bal[0]).toBe(10000 + 9000 - 50000 - 15000);   // −46,000
  });
  it("offsets owed by a supplier reduce what is paid to them", () => {
    const s = simulate({ ...p, offsets: { "مورد": 20000 } }, o, 0, 12);
    expect(s.ap[0]).toBe(30000);
  });
  it("new sales are collected after the lag, restocked at cost, VAT on the margin", () => {
    const d = simulate(p, o, 1000, 12), z = simulate(p, o, 0, 12);
    expect(d.nin[2]).toBeCloseTo(1000 * 1.15);               // sold in month 1, collected in full in month 2
    expect(d.nout[2]).toBeCloseTo(1000 * 1.15 * 0.5);
    expect(d.vat[2] - z.vat[2]).toBeCloseTo(1000 * 0.15 * 0.5);
  });
});

describe("smallest financing", () => {
  it("keeps every month at or above zero, and a little less would not", () => {
    const f = financeTerm(p, o, 12);
    expect(f.needed).toBe(true); expect(f.feasible).toBe(true);
    expect(f.f0).toBe(0); expect(f.start).toBe("2026-11");
    const rows = planRows(p, o, o.sales, { F: f.F, n: 12, f0: f.f0 }, f.H);
    expect(Math.min(...rows.map(r => r.balance))).toBeGreaterThanOrEqual(-1);
    const less = planRows(p, o, o.sales, { F: f.F - 2000, n: 12, f0: f.f0 }, f.H);
    expect(Math.min(...less.map(r => r.balance))).toBeLessThan(0);
    expect(f.installment).toBe(Math.round(f.F * annuity(10, 12)));
  });
  it("no gap → no financing", () => {
    const f = financeTerm({ ...p, opening: 500000 }, o, 12);
    expect(f.needed).toBe(false); expect(f.F).toBe(0);
  });
  it("a business that loses money every month can't repay: infeasible, and says what sales would fix it", () => {
    const weak: PlanInputs = { ...p, base: { ...p.base, opex: 60000 } };
    const plan = cashPlan(weak, { ...o, sales: 20000 });
    const t = plan.terms.find(x => x.n === 6)!;
    expect(t.feasible).toBe(false);
    expect(t.min_sales).toBeGreaterThan(20000);
    expect(financeTerm(weak, { ...o, sales: t.min_sales! }, 6, t.min_sales!).feasible).toBe(true);
    // the suggested plan raises the sales to the lowest level that works, with its smallest financing
    expect(plan.suggestion?.raised).toBe(true);
    expect(plan.suggestion!.sales).toBe(Math.min(...plan.terms.map(x => x.fix?.sales ?? Infinity)));
    expect(plan.suggestion!.sales).toBeGreaterThanOrEqual(plan.sustain_sales!);   // never below break-even
    expect(plan.suggestion!.F).toBeGreaterThan(0);
  });
});

describe("cashPlan", () => {
  it("diagnoses the gap and says sales alone can't fix a gap this month", () => {
    const plan = cashPlan(p, o);
    expect(plan.needs_help).toBe(true);
    expect(plan.gap).toBeGreaterThan(0);
    expect(plan.no_finance.possible).toBe(false);          // month 0 is short before any new sale is collected
    expect(plan.no_finance.blocked[0]).toBe("2026-11");
    expect(plan.recommended).not.toBeNull();
    expect(plan.suggestion).toMatchObject({ raised: false, sales: o.sales });
  });
  it("cash a riyal of sales leaves after cost and VAT = the gross margin", () => {
    expect(unitNet(p, o.cogsRatio)).toBeCloseTo(0.5);
  });
  it("annuity: zero rate is a straight split", () => {
    expect(annuity(0, 12)).toBeCloseTo(1 / 12);
    expect(annuity(12, 12)).toBeCloseTo(0.08885, 4);
  });
});

describe("editable cost ratio and manual financing", () => {
  it("a lower cost ratio means smaller supplier payments for new sales", () => {
    const hi = simulate(p, o, 1000, 12).nout[2];
    const lo = simulate(p, { ...o, cogsRatio: 0.3 }, 1000, 12).nout[2];
    expect(hi).toBeCloseTo(1000 * 1.15 * 0.5);
    expect(lo).toBeCloseTo(1000 * 1.15 * 0.3);
    expect(lo).toBeLessThan(hi);
  });
  it("manual financing: the owner's amount is placed at the first short month and keeps the floor if big enough", () => {
    const small = manualFinance(p, o, o.sales, 5000, 12);
    expect(small.ok).toBe(false);                 // 5,000 is too little
    const auto = financeTerm(p, o, 12);
    const big = manualFinance(p, o, o.sales, auto.F, 12);
    expect(big.ok).toBe(true);                    // the computed smallest works
    expect(big.installment).toBe(Math.round(auto.F * annuity(10, 12)));
    expect(big.f0).toBe(auto.f0);
  });
});
