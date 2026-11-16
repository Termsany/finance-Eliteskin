import { describe, it, expect } from "vitest";
import { lineAmount, orderAmount, openAmount, shortBy, summarize, openBySupplier, priceFor, allocate, cleanOrder, offsetMessage, type OffsetOrder } from "@/lib/offsets";

const ord = (p: Partial<OffsetOrder>): OffsetOrder => ({
  id: 1, supplier: "مورد", client: "عميل", order_date: "2026-10-01", ref: "", status: "printed",
  collected_at: null, settled_at: null, settled_amount: null, short_closed: false, note: "",
  items: [{ item: "صنف", product_id: null, qty: 10, client_price: 100, my_price: 80 }], ...p,
});

describe("offset amounts", () => {
  it("line and order amount = (client − my) × qty", () => {
    expect(lineAmount({ qty: 10, client_price: 100, my_price: 80 })).toBe(200);
    expect(orderAmount(ord({}))).toBe(200);
    expect(orderAmount(ord({ items: [{ item: "a", product_id: null, qty: 3, client_price: 50, my_price: 30 }, { item: "b", product_id: null, qty: 2, client_price: 10, my_price: 5 }] }))).toBe(70);
  });
  it("open = full amount until settled", () => {
    expect(openAmount(ord({ status: "printed" }))).toBe(200);
    expect(openAmount(ord({ status: "collected" }))).toBe(200);
    expect(openAmount(ord({ status: "settled", settled_amount: 200 }))).toBe(0);
  });
  it("a short settlement stays open by the shortfall, zero once closed", () => {
    const short = ord({ status: "settled", settled_amount: 150 });
    expect(shortBy(short)).toBe(50);
    expect(openAmount(short)).toBe(50);
    expect(openAmount({ ...short, short_closed: true })).toBe(0);
    expect(shortBy({ ...short, short_closed: true })).toBe(0);
  });
});

describe("summarize", () => {
  const orders = [
    ord({ id: 1, supplier: "أ", status: "printed", order_date: "2026-11-10" }),                       // open 200
    ord({ id: 2, supplier: "أ", status: "collected", order_date: "2026-09-01" }),                      // open 200, late
    ord({ id: 3, supplier: "ب", status: "settled", settled_amount: 200, order_date: "2026-11-01" }),   // closed
    ord({ id: 4, supplier: "ب", status: "settled", settled_amount: 120, order_date: "2026-11-05" }),   // short 80
  ];
  it("totals, per-supplier, late and short", () => {
    const s = summarize(orders, "2026-11-15");
    expect(s.totals.open).toBe(480);
    expect(s.totals.printed).toBe(200);
    expect(s.totals.collected).toBe(200);
    expect(s.totals.short).toBe(80);
    expect(s.totals.late).toBe(1);               // order 2 is >30 days and not settled
    expect(s.totals.late_amount).toBe(200);
    expect(s.suppliers[0]).toMatchObject({ supplier: "أ", open: 400, orders: 2, late: 1 });
    expect(s.suppliers.find(x => x.supplier === "ب")).toMatchObject({ open: 80, short: 80 });
  });
  it("openBySupplier only counts what is owed", () => {
    expect(openBySupplier(orders)).toEqual({ "أ": 400, "ب": 80 });
  });
});

describe("prices and allocation", () => {
  const prices = [
    { id: 1, supplier: "أ", client: "", item: "x", product_id: null, client_price: 100, my_price: 70 },
    { id: 2, supplier: "أ", client: "عميل1", item: "x", product_id: null, client_price: 120, my_price: 70 },
  ];
  it("customer-specific price beats the all-customers one", () => {
    expect(priceFor(prices, "أ", "عميل1", "x")?.client_price).toBe(120);
    expect(priceFor(prices, "أ", "عميل2", "x")?.client_price).toBe(100);
    expect(priceFor(prices, "ب", "عميل1", "x")).toBeNull();
  });
  it("allocate fills oldest first; last one partial", () => {
    const a = allocate([{ id: 1, order_date: "2026-10-01", amount: 200 }, { id: 2, order_date: "2026-09-01", amount: 200 }], 300);
    expect(a).toEqual([{ id: 2, amount: 200 }, { id: 1, amount: 100 }]);
  });
});

describe("cleanOrder", () => {
  it("rejects missing supplier / client / items", () => {
    expect(cleanOrder({ client: "ع", order_date: "2026-11-01", items: [] })).toEqual({ error: "اختار المورد" });
    expect(cleanOrder({ supplier: "م", order_date: "2026-11-01" })).toEqual({ error: "اختار العميل" });
    expect(cleanOrder({ supplier: "م", client: "ع", order_date: "2026-11-01", items: [{ item: "", qty: 0 }] })).toMatchObject({ error: expect.stringContaining("صنف") });
  });
  it("accepts a valid order and drops empty lines", () => {
    const o = cleanOrder({ supplier: "م", client: "ع", order_date: "2026-11-01", items: [{ item: "x", qty: 5, client_price: 10, my_price: 6 }, { item: "", qty: 0 }] });
    expect("items" in o && o.items).toHaveLength(1);
    expect(orderAmount(o as OffsetOrder)).toBe(20);
  });
});

describe("offsetMessage", () => {
  it("lists one supplier's open orders with a total", () => {
    const s = summarize([ord({ id: 1, supplier: "أ", status: "collected", order_date: "2026-11-01" })], "2026-11-15");
    const m = offsetMessage("أ", s.rows);
    expect(m).toContain("200");
    expect(m).toContain("أ");
  });
});
