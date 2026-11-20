import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  pool: { connect: vi.fn() },
}));

import { query } from "@/lib/db";
import { productUnitsSold, ensureBudget, repMonthSummary, PROMO_LABELS } from "@/lib/samples";

const mockQuery = vi.mocked(query);

describe("samples — productUnitsSold", () => {
  it("sums units from invoice items net of refund ratio", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ units: "150.000", sales: "45000.00" }], command: "", rowCount: 1, oid: 0, fields: [] });
    const r = await productUnitsSold(1, "2026-10");
    expect(r.units).toBe(150);
    expect(r.sales).toBe(45000);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("daftra_invoice_items"), [1, "2026-10"]);
  });
});

describe("samples — ensureBudget", () => {
  it("returns existing budget if already frozen", async () => {
    const existing = { id: 1, rep_id: 1, month: "2026-11", prev_units: 100, sample_budget: 3, promo_budget: 450, sample_pct: 3, promo_pct: 5, unit_cost: 300, prev_sales: 30000 };
    mockQuery.mockResolvedValueOnce({ rows: [existing], command: "", rowCount: 1, oid: 0, fields: [] });
    const b = await ensureBudget(1, "2026-11");
    expect(b).toEqual(existing);
  });

  it("creates budget from previous month sales when none exists", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] }); // no existing budget
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "أحمد", product_id: 42, sample_pct: null, promo_pct: null }], command: "", rowCount: 1, oid: 0, fields: [] }); // rep
    mockQuery.mockResolvedValueOnce({ rows: [{ sample_pct: 3, promo_pct: 5 }], command: "", rowCount: 1, oid: 0, fields: [] }); // globals
    mockQuery.mockResolvedValueOnce({ rows: [{ units: "200.000", sales: "60000.00" }], command: "", rowCount: 1, oid: 0, fields: [] }); // prev month units
    mockQuery.mockResolvedValueOnce({ rows: [{ average_cost: "300.0000" }], command: "", rowCount: 1, oid: 0, fields: [] }); // product cost
    const created = { id: 2, rep_id: 1, month: "2026-11", prev_units: 200, sample_budget: 6, promo_budget: 3000, sample_pct: 3, promo_pct: 5, unit_cost: 300, prev_sales: 60000 };
    mockQuery.mockResolvedValueOnce({ rows: [created], command: "", rowCount: 1, oid: 0, fields: [] }); // insert

    const b = await ensureBudget(1, "2026-11");
    expect(b.sample_budget).toBe(6); // 200 * 3% = 6 units
    expect(b.promo_budget).toBe(3000); // 200 * 300 * 5% = 3000
  });
});

describe("samples — repMonthSummary", () => {
  it("returns budget with used amounts", async () => {
    const budget = { id: 1, rep_id: 1, month: "2026-11", prev_units: 100, sample_budget: 3, promo_budget: 1500, sample_pct: 3, promo_pct: 5, unit_cost: 300, prev_sales: 30000 };
    mockQuery.mockResolvedValueOnce({ rows: [budget], command: "", rowCount: 1, oid: 0, fields: [] }); // ensureBudget
    mockQuery.mockResolvedValueOnce({ rows: [{ total: "2.000" }], command: "", rowCount: 1, oid: 0, fields: [] }); // samples used units
    mockQuery.mockResolvedValueOnce({ rows: [{ total: "600.00" }], command: "", rowCount: 1, oid: 0, fields: [] }); // samples used cost
    mockQuery.mockResolvedValueOnce({ rows: [{ total: "800.00" }], command: "", rowCount: 1, oid: 0, fields: [] }); // promo used

    const s = await repMonthSummary(1, "2026-11");
    expect(s.samples.budget_units).toBe(3);
    expect(s.samples.used_units).toBe(2);
    expect(s.samples.used_cost).toBe(600);
    expect(s.promo.budget_amount).toBe(1500);
    expect(s.promo.used_amount).toBe(800);
  });
});

describe("samples — PROMO_LABELS", () => {
  it("has all four types", () => {
    expect(Object.keys(PROMO_LABELS)).toEqual(["pms", "lunch", "rtd", "other"]);
    expect(PROMO_LABELS.lunch).toBe("دعوة غداء");
  });
});
