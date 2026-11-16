import { describe, expect, it } from "vitest";
import { collectionPlan, monthEnd, receivedIn, reminderText, type OpenDoc } from "@/lib/collections";

const d = (o: Partial<OpenDoc>): OpenDoc => ({ id: 1, no: "A1", date: "2026-10-01", party: "عميل", unpaid: 1000, due: "2026-10-31", ...o });

describe("collection plan", () => {
  const docs = [
    d({ id: 1, party: "أ", due: "2026-10-31", unpaid: 1000 }),   // overdue 15 days
    d({ id: 2, party: "ب", due: "2026-11-18", unpaid: 500 }),    // this week
    d({ id: 3, party: "ب", due: "2026-11-28", unpaid: 300 }),    // later this month
    d({ id: 4, party: "ج", due: "2026-12-05", unpaid: 700 }),    // next month
    d({ id: 5, party: "د", due: "2026-11-10", unpaid: 0 }),      // paid
  ];
  it("this month = overdue + due before month end, split by status", () => {
    const p = collectionPlan(docs, "2026-11", "2026-11-15");
    expect(p.totals).toMatchObject({ required: 1800, overdue: 1000, week: 500, month: 300, due: 800, parties: 2, overdue_parties: 1, invoices: 3 });
    expect(p.rows.map(r => r.status)).toEqual(["overdue", "week", "month"]);
    expect(p.rows[0].days).toBe(15);
    expect(p.groups[0]).toMatchObject({ party: "أ", overdue: 1000, oldest: 15 });
    expect(p.groups[1]).toMatchObject({ party: "ب", total: 800, next_due: "2026-11-18" });
  });
  it("next month keeps what is overdue and adds that month's dues", () => {
    const p = collectionPlan(docs, "2026-12", "2026-11-15");
    expect(p.totals).toMatchObject({ overdue: 1000, due: 700, required: 1700 });
  });
  it("helpers", () => {
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(receivedIn([{ date: "2026-11-02", amount: 50 }, { date: "2026-10-30", amount: 9 }], "2026-11-01", "2026-11-30")).toBe(50);
    expect(reminderText({ party: "أ", total: 1000, overdue: 1000, rows: collectionPlan(docs, "2026-11", "2026-11-15").groups[0].rows })).toContain("متأخرة 15 يوم");
  });
});

import { monthlyPlan, bucketOf, addMonths } from "@/lib/collections";
describe("month by month", () => {
  const docs = [
    d({ id: 1, party: "أ", due: "2026-10-31", unpaid: 1000 }),   // overdue
    d({ id: 2, party: "أ", due: "2026-12-10", unpaid: 400 }),    // December
    d({ id: 3, party: "ب", due: "2026-11-20", unpaid: 500 }),    // November (this month)
    d({ id: 4, party: "ب", due: "2027-01-15", unpaid: 300 }),    // January
    d({ id: 5, party: "ج", due: "2027-09-01", unpaid: 900 }),    // beyond the horizon
  ];
  it("buckets: overdue is collected in the current month, each later month on its own", () => {
    const p = monthlyPlan(docs, "2026-11-15", "2026-11");
    const amt = Object.fromEntries(p.buckets.map(b => [b.key, b.amount]));
    expect(amt).toMatchObject({ "2026-11": 1500, "2026-12": 400, "2027-01": 300, later: 900 });
    expect(p.buckets).toHaveLength(7);
    expect(p.buckets[0]).toMatchObject({ overdue: 1000, parties: 2 });
    expect(p.buckets[1].overdue).toBe(0);
    expect(p.totals).toMatchObject({ open: 3100, overdue: 1000, selected: 1500, selected_overdue: 1000, selected_due: 500, parties_selected: 2, by_end: 1500 });
    expect(p.parties.find(x => x.party === "أ")).toMatchObject({ selected: 1000, overdue: 1000, after: 400 });
  });
  it("a future month: only its own dues; overdue stays in the current month", () => {
    const p = monthlyPlan(docs, "2026-11-15", "2026-12");
    const a = p.parties.find(x => x.party === "أ")!, b = p.parties.find(x => x.party === "ب")!;
    expect(a).toMatchObject({ total: 1400, overdue: 1000, selected: 400, after: 0 });
    expect(b).toMatchObject({ total: 800, overdue: 0, selected: 0, after: 300 });
    expect(p.totals).toMatchObject({ selected: 400, selected_overdue: 0, by_end: 1900 });
  });
  it("old 'overdue' selection falls back to the current month, helpers", () => {
    expect(monthlyPlan(docs, "2026-11-15", "overdue").sel).toBe("2026-11");
    expect(bucketOf("2026-11-14", "2026-11-15", "2027-04")).toBe("2026-11");
    expect(addMonths("2026-11", 2)).toBe("2027-01");
  });
});
