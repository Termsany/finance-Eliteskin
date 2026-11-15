import { describe, expect, it } from "vitest";
import { activeIn, toEntries, toFixed, cleanExpense, catAccount, type AppExpense } from "@/lib/app-expenses";

const e = (o: Partial<AppExpense>): AppExpense => ({ id: 1, name: "إيجار", cat: "إيجار", amount: 1000, type: "fixed", start: "2026-09", end: null, stop: null, date: null, note: "", ...o });

describe("app expenses", () => {
  it("fixed runs until the stop month, temp until its end month, once on its date", () => {
    expect(activeIn(e({ stop: "2026-11" }), "2026-10")).toBe(true);
    expect(activeIn(e({ stop: "2026-11" }), "2026-11")).toBe(false);
    expect(activeIn(e({ type: "temp", end: "2026-10" }), "2026-10")).toBe(true);
    expect(activeIn(e({ type: "temp", end: "2026-10" }), "2026-11")).toBe(false);
    expect(activeIn(e({ type: "once", start: null, date: "2026-10-05" }), "2026-10")).toBe(true);
  });
  it("turns into one P&L line per due month up to today, on an operating-expense account", () => {
    const rows = toEntries([e({}), e({ id: 2, type: "once", start: null, date: "2026-12-01" })], "2026-11-15");
    expect(rows.map(r => r.date)).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
    expect(catAccount("إيجار").code.startsWith("5")).toBe(true);
    expect(new Set(rows.map(r => r.id)).size).toBe(3);
  });
  it("fixed and temp become the monthly fixed costs", () => {
    expect(toFixed([e({ stop: "2026-12" }), e({ id: 2, type: "temp", end: "2027-01" }), e({ id: 3, type: "once", start: null, date: "2026-10-01" })]))
      .toMatchObject([{ start_month: "2026-09-01", end_month: "2026-11-01" }, { end_month: "2027-01-01" }]);
  });
  it("validates the form", () => {
    expect(cleanExpense({ name: "", amount: 5 })).toEqual({ error: "اسم البند مطلوب" });
    expect(cleanExpense({ name: "x", amount: 5, type: "temp", start: "2026-10", end: "2026-09" })).toHaveProperty("error");
    expect(cleanExpense({ name: "x", amount: 5, type: "once", date: "2026-10-01", cat: "؟" })).toMatchObject({ cat: "أخرى", date: "2026-10-01" });
  });
});
