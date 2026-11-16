import { describe, it, expect } from "vitest";
import { rateCustomer } from "@/lib/fin-rating";

describe("rateCustomer", () => {
  it("averages days-to-pay for linked payments", () => {
    const r = rateCustomer(
      [{ id: 1, date: "2026-01-01", total: 1000 }, { id: 2, date: "2026-02-01", total: 1000 }],
      [{ date: "2026-01-11", amount: 1000, invoice_id: 1 }, { date: "2026-02-21", amount: 1000, invoice_id: 2 }],
    );
    expect(r.avg_days).toBe(15);          // (10 + 20) / 2, weighted equally
    expect(r.paid_invoices).toBe(2);
    expect(r.label).toBe("ممتاز");
  });
  it("matches an unlinked payment to the oldest open invoice (FIFO)", () => {
    const r = rateCustomer(
      [{ id: 1, date: "2026-01-01", total: 1000 }, { id: 2, date: "2026-01-20", total: 1000 }],
      [{ date: "2026-02-20", amount: 1500, invoice_id: null }],
    );
    // 1000 settles inv1 (50 days), 500 settles part of inv2 (31 days) → weighted ~(50*1000+31*500)/1500
    expect(r.avg_days).toBe(44);
  });
  it("weights by amount and labels a slow payer", () => {
    const r = rateCustomer(
      [{ id: 1, date: "2026-01-01", total: 10000 }],
      [{ date: "2026-04-01", amount: 10000, invoice_id: 1 }],
    );
    expect(r.avg_days).toBe(90);
    expect(r.label).toBe("متعثر");
    expect(r.suggested_credit).toBe(10000);
  });
  it("a customer with no payments yet is 'new'", () => {
    const r = rateCustomer([{ id: 1, date: "2026-01-01", total: 1000 }], []);
    expect(r).toMatchObject({ avg_days: null, label: "جديد", suggested_credit: null });
  });
});
