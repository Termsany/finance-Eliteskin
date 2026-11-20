import { describe, it, expect } from "vitest";
import { reconcile } from "../src/lib/reconcile";

describe("reconcile", () => {
  const inv = [
    { id: 1, no: "1", date: "2026-01-01", total: 100000, refund: 0, unpaid: 60000, status: 1 },
    { id: 2, no: "2", date: "2026-02-01", total: 50000, refund: 5000, unpaid: 45000, status: 0 },
    { id: 3, no: "3", date: "2026-02-05", total: 9999, refund: 0, unpaid: 0, status: 3 },
  ];
  it("balances invoices − refunds − completed payments and flags what's left out", () => {
    const r = reconcile(inv, [
      { id: 10, date: "2026-01-10", amount: 40000, invoice_id: 1, status: "1", method: "" },
      { id: 11, date: "2026-03-01", amount: 30000, invoice_id: null, status: "1", method: "Bank Transfer" },
      { id: 12, date: "2026-03-02", amount: 7000, invoice_id: null, status: "2", method: "" },
      { id: 13, date: "2026-03-03", amount: 1000, invoice_id: 99, status: "1", method: "" },
    ], [{ id: 50, no: "R11", date: "2026-03-05", type: "6", total: 12851.25, draft: false }]);
    expect(r.invoices).toMatchObject({ n: 2, invoiced: 150000, refunds: 5000, paid_on_invoices: 40000, unpaid: 105000 });
    expect(r.payments.received).toBe(71000);
    expect(r.payments.unlinked).toEqual({ n: 1, sum: 30000 });
    expect(r.payments.to_missing).toEqual({ n: 1, sum: 1000 });
    expect(r.payments.skipped).toEqual({ "2": { n: 1, sum: 7000 } });
    expect(r.balance).toBe(74000);
    expect(r.unapplied).toBe(31000);
    expect(r.others["6"]).toEqual({ n: 1, sum: 12851.25 });
    expect(r.hints).toHaveLength(3);
  });
  it("is quiet when everything lines up", () => {
    const r = reconcile(inv.slice(0, 1), [{ id: 1, date: "2026-01-02", amount: 40000, invoice_id: 1, status: "1", method: "" }], []);
    expect(r.balance).toBe(60000); expect(r.unapplied).toBe(0); expect(r.hints).toEqual([]);
  });
});
