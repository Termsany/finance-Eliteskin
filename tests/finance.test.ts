import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
import { computeFinance, treatment, costBasis, planning, bucket, type Input, type Doc } from "@/lib/finance";
import { mapCash } from "@/lib/daftra";

const doc = (o: Partial<Doc>): Doc => ({ id: 1, no: "1", date: "2026-09-10", due_days: 30, party_id: 1, party: "عميل", city: "", branch: "", payment_status: 2, net: 0, tax: 0, total: 0, paid: 0, unpaid: 0, refund: 0, lines: [], ...o });
const base = (o: Partial<Input> = {}): Input => ({
  sales: [], purchases: [], products: [{ id: 15, name: "AMI 200", code: "", list_price: 900, buy_price: 0, average_cost: 0, min_price: null, stock: 10, active: true }],
  payments: [], entries: [], accounts: [{ id: 1, code: "5214", name: "رواتب" }, { id: 2, code: "120101", name: "الخزينة" }, { id: 3, code: "33", name: "جارى الشريك" }, { id: 4, code: "5101", name: "شحن مشتريات" }, { id: 5, code: "42", name: "إيرادات أخرى" }],
  overrides: {}, fixed: [], settings: { target_gross_margin: 45, target_net_margin: 15 }, today: "2026-10-31", ...o });

describe("chart-of-accounts treatment", () => {
  it("treats 5xxx as operating expense, 51xx as cost of sales and everything else as non-P&L", () => {
    const acc = base().accounts;
    expect(treatment(acc[0], {})).toBe("opex"); expect(treatment(acc[3], {})).toBe("cogs");
    expect(treatment(acc[1], {})).toBe("exclude"); expect(treatment(acc[2], {})).toBe("exclude");
    expect(treatment(acc[1], { 2: "opex" })).toBe("opex"); expect(treatment(undefined, {})).toBe("opex");
  });
});

describe("cost basis", () => {
  it("uses the weighted average purchase cost net of returns, and falls back to the product card", () => {
    const purchases = [doc({ id: 1, date: "2026-01-01", total: 1000, lines: [{ product_id: 15, item: "AMI 200", quantity: 10, net: 1000, tax: 0 }] }),
      doc({ id: 2, date: "2026-02-01", total: 3000, lines: [{ product_id: 15, item: "AMI 200", quantity: 10, net: 3000, tax: 0 }] })];
    const cb = costBasis(purchases, base().products, "2026-12-31");
    expect(cb.cost({ product_id: 15, item: "", quantity: 1, net: 0, tax: 0 })).toBe(200);
    expect(cb.byKey.get("p15")?.last?.unit).toBe(300);
    // name match when the sales line has no product id
    expect(cb.cost({ product_id: null, item: "ami  200", quantity: 1, net: 0, tax: 0 })).toBe(200);
    // purchases after the period end are ignored
    expect(costBasis(purchases, base().products, "2026-01-15").cost({ product_id: 15, item: "", quantity: 1, net: 0, tax: 0 })).toBe(100);
    const p2 = [{ ...base().products[0], average_cost: 50 }];
    expect(costBasis([], p2, "2026-12-31").cost({ product_id: 15, item: "", quantity: 1, net: 0, tax: 0 })).toBe(50);
  });
});

describe("profit and loss", () => {
  const inp = base({
    purchases: [doc({ id: 9, date: "2026-08-01", party: "مورد", total: 2000, net: 2000, unpaid: 500, payment_status: 1, due_days: 30, lines: [{ product_id: 15, item: "AMI 200", quantity: 20, net: 2000, tax: 0 }] })],
    sales: [
      doc({ id: 1, date: "2026-09-10", net: 900, tax: 135, total: 1035, unpaid: 1035, payment_status: 0, due_days: 30, lines: [{ product_id: 15, item: "AMI 200", quantity: 3, net: 900, tax: 135 }] }),
      doc({ id: 2, date: "2026-09-20", net: 600, tax: 90, total: 690, refund: 690, payment_status: 3, lines: [{ product_id: 15, item: "AMI 200", quantity: 2, net: 600, tax: 90 }] }),
    ],
    entries: [
      { id: 1, kind: "expense", date: "2026-09-05", amount: 200, tax: 0, account_id: 1, vendor: "", note: "رواتب" },
      { id: 2, kind: "expense", date: "2026-09-06", amount: 5000, tax: 0, account_id: 2, vendor: "", note: "سحب للخزينة" },
      { id: 3, kind: "expense", date: "2026-09-07", amount: 50, tax: 0, account_id: 4, vendor: "", note: "شحن" },
      { id: 4, kind: "income", date: "2026-09-08", amount: 30, tax: 0, account_id: 5, vendor: "", note: "استرداد" },
      { id: 5, kind: "income", date: "2026-09-08", amount: 200000, tax: 0, account_id: 3, vendor: "", note: "دعم من جاري الشريك" },
    ],
  });
  const f = computeFinance(inp, "2026-09-01", "2026-09-30");
  it("recognises net sales after refunds and costs only what was kept", () => {
    expect(f.kpi.sales).toBe(900); expect(f.kpi.sales_tax).toBe(135);
    expect(f.kpi.cogs).toBe(3 * 100 + 50);             // 3 units × 100 avg cost + shipping booked to 51xx
    expect(f.kpi.gross).toBe(550); expect(f.kpi.opex).toBe(200); expect(f.kpi.other_income).toBe(30);
    expect(f.kpi.net).toBe(380);
  });
  it("profit per customer: net minus the cost of what they bought", () => {
    const c = f.salesByClient[0];
    expect(c.net).toBe(900); expect(c.gross).toBe(600); expect(c.margin).toBe(66.67); expect(c.cost_known).toBe(true);
  });
  it("never counts treasury transfers or partner money as expense or revenue", () => {
    expect(f.expensesByAccount.find(a => a.account_id === 2)?.treatment).toBe("exclude");
    expect(f.kpi.other_income).toBe(30);
  });
  it("ages receivables and payables from the due date", () => {
    expect(f.kpi.ar).toBe(1035); expect(f.ar.buckets["1-30"]).toBe(1035);   // due 10/10 → 21 days late on 31/10
    expect(f.kpi.ap).toBe(500); expect(f.ap.buckets["61-90"]).toBe(500);
  });
  it("prices from cost: break-even covers overheads, suggestion hits the target margin", () => {
    const p = f.pricing.find(x => x.product_id === 15)!;
    expect(p.avg_cost).toBe(100); expect(p.realized_price).toBe(300); expect(p.status).toBe("healthy");
    expect(p.suggested_price).toBeGreaterThanOrEqual(p.avg_cost! / (1 - 0.45) - 0.01);
  });
});

describe("planning", () => {
  it("computes break-even, target sales and the allowed spending", () => {
    const B = { months_count: 6, sales: 100000, sales_gross: 115000, cogs: 50000, gross: 50000, opex: 30000, other: 0, net: 20000, gm: 0.5 };
    const p = planning(B, 0, { target_gross_margin: 45, target_net_margin: 15 });
    expect(p.break_even_sales).toBe(60000); expect(p.target_sales).toBe(85714.29); expect(p.allowed_opex).toBe(35000);
    expect(planning(B, 40000, { target_gross_margin: 45, target_net_margin: 15 }).break_even_sales).toBe(80000);
  });
  it("buckets days past due", () => { expect([bucket(0), bucket(5), bucket(45), bucket(75), bucket(200)]).toEqual(["current", "1-30", "31-60", "61-90", "90+"]); });
});

describe("Daftra cash entries", () => {
  it("strips included VAT from expenses", () => {
    expect(mapCash({ id: "1", amount: "115", tax1_amount: "15", tax1_included: "1", date: "2026-01-01", journal_account_id: "398" }, "expense")).toMatchObject({ amount: 100, tax: 15, account_id: 398, entry_date: "2026-01-01" });
    expect(mapCash({ id: "2", amount: "41", date: "01/04/2025" }, "expense")).toMatchObject({ amount: 41, tax: 0, account_id: null, entry_date: "2025-04-01" });
  });
});

import { unallocatedCredit } from "@/lib/finance";
describe("customer unapplied credit", () => {
  const sales = [
    { id: 1, no: "A", date: "2026-01-01", due_days: 30, party_id: 7, party: "عميل", city: "", branch: "", payment_status: 0, net: 1000, tax: 150, total: 1150, paid: 0, unpaid: 1150, refund: 0, lines: [] },
    { id: 2, no: "B", date: "2026-02-01", due_days: 30, party_id: 7, party: "عميل", city: "", branch: "", payment_status: 1, net: 1000, tax: 150, total: 1150, paid: 1150, unpaid: 0, refund: 0, lines: [] },
  ];
  it("counts payments beyond what Daftra applied to invoices", () => {
    // Daftra applied 1150 (invoice B). The customer actually paid 2300, so 1150 is unapplied credit.
    const c = unallocatedCredit(sales as never, [{ amount: 1150, client_id: 7 }, { amount: 1150, client_id: 7 }]);
    expect(c.get("عميل")).toBe(1150);
  });
  it("no credit when payments match the applied amount", () => {
    const c = unallocatedCredit(sales as never, [{ amount: 1150, client_id: 7 }]);
    expect(c.size).toBe(0);
  });
  it("ignores payments with no customer id", () => {
    const c = unallocatedCredit(sales as never, [{ amount: 5000, client_id: null }]);
    expect(c.size).toBe(0);
  });
});

describe("receivables net unapplied customer credit", () => {
  const inp = base({
    sales: [
      doc({ id: 1, no: "A", date: "2026-09-01", due_days: 30, party_id: 7, party: "عميل", payment_status: 0, net: 1000, tax: 0, total: 1000, unpaid: 1000 }),
      doc({ id: 2, no: "B", date: "2026-09-02", due_days: 30, party_id: 7, party: "عميل", payment_status: 0, net: 1000, tax: 0, total: 1000, unpaid: 1000 }),
    ],
  });
  it("a recorded-but-unapplied payment drops the balance and clears the oldest invoice", () => {
    const f = computeFinance({ ...inp, payments: [{ date: "2026-10-01", amount: 1000, client_id: 7 }] }, "2026-09-01", "2026-09-30");
    expect(f.ar.total).toBe(1000);                       // 2000 invoiced − 1000 paid
    expect(f.ar.open.length).toBe(1);                    // oldest invoice fully covered
    expect(f.ar.parties[0]).toMatchObject({ name: "عميل", unpaid: 1000 });
  });
  it("without the payment the full balance stands", () => {
    const f = computeFinance(inp, "2026-09-01", "2026-09-30");
    expect(f.ar.total).toBe(2000);
  });
});

describe("unapplied credit clears the oldest invoice by date (not by due date)", () => {
  const inp = base({
    sales: [
      // A is the older invoice by date, but B falls due sooner (shorter terms)
      doc({ id: 1, no: "A", date: "2026-09-01", due_days: 90, party_id: 7, party: "عميل", payment_status: 0, net: 1000, tax: 0, total: 1000, unpaid: 1000 }),
      doc({ id: 2, no: "B", date: "2026-09-15", due_days: 10, party_id: 7, party: "عميل", payment_status: 0, net: 1000, tax: 0, total: 1000, unpaid: 1000 }),
    ],
  });
  it("applies to invoice A first", () => {
    const f = computeFinance({ ...inp, payments: [{ date: "2026-10-01", amount: 1000, client_id: 7 }] }, "2026-09-01", "2026-09-30");
    expect(f.ar.open.map(o => o.no)).toEqual(["B"]);   // A cleared, B remains
  });
});
