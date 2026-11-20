import type { computeFinance, Input } from "@/lib/finance";
import type { AppExpense } from "@/lib/app-expenses";
import { activeIn } from "@/lib/app-expenses";

/**
 * 13-week cash-flow forecast v2.
 *
 * Changes from v1:
 *  - Single configurable collection rate (default 90%) instead of tiered 95/80/60/40/20
 *  - Per-customer expected payment timing using avg_days from their rating
 *  - VAT modeled as a real cash outflow on the filing week (quarterly or monthly)
 *  - "Include new sales" now deducts COGS as supplier payments
 *  - Dated temp/once expenses placed in their actual week instead of all on the 27th
 *  - Tracks DSO, DPO, CCC
 *  - Top-5 customers to call, suppliers to defer
 */
type Fin = ReturnType<typeof computeFinance>;
const r0 = (n: number) => Math.round(n);
const r2c = (n: number) => Math.round(n * 100) / 100;
const DAY = 864e5;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const t0 = (d: string) => Date.parse(`${d}T00:00:00Z`);

export type VatFiling = "monthly" | "quarterly";

export type CashWeek = {
  i: number; from: string; to: string;
  in_ar: number; in_new: number;
  out_ap: number; out_fixed: number; out_var: number; out_vat: number; out_cogs_new: number;
  items: Array<{ kind: "in" | "out"; label: string; amount: number }>;
};

export type CustomerCall = { name: string; unpaid: number; days_late: number; avg_days: number | null; expected_week: number | null; phone?: string };
export type SupplierDefer = { name: string; unpaid: number; days_late: number; saving_if_defer_4w: number };

export interface CashForecastResult {
  opening: number;
  rows: Array<CashWeek & { net: number; balance: number }>;
  total_in: number; total_out: number; closing: number;
  lowest: { balance: number; week: number };
  first_negative_week: number | null;
  safety_line: number;
  days_of_cash: number | null;
  free_cash: number;
  dso: number | null; dpo: number | null; ccc: number | null;
  calls: CustomerCall[];
  deferrals: SupplierDefer[];
  assumptions: {
    collect_pct: number;
    fixed_monthly: number; fixed_source: "list" | "average";
    variable_monthly: number; include_new: boolean; new_weekly: number; cogs_weekly: number;
    vat_filing: VatFiling; vat_total: number;
    offsets_applied: number;
  };
}

export type CashOpts = {
  includeNew: boolean;
  weeks?: number;
  offsets?: Record<string, number>;
  collectPct?: number;
  vatFiling?: VatFiling;
  vatPeriod?: number;
  cogsRatio?: number;
  customerAvgDays?: Record<string, number>;
  appExpenses?: AppExpense[];
};

/** Quarterly VAT filing months in KSA: Jan (for Q4), Apr (for Q1), Jul (for Q2), Oct (for Q3). Monthly: the month after. */
function vatFilingWeeks(start: number, W: number, vatAmount: number, filing: VatFiling, today: string): Array<{ week: number; amount: number }> {
  if (vatAmount <= 0) return [];
  const result: Array<{ week: number; amount: number }> = [];
  const todayMonth = Number(today.slice(5, 7));
  const todayYear = Number(today.slice(0, 4));

  if (filing === "quarterly") {
    // KSA quarterly filing: due on the last day of the month following the quarter end
    // Q1 (Jan-Mar) → due Apr 30, Q2 (Apr-Jun) → due Jul 31, Q3 (Jul-Sep) → due Oct 31, Q4 (Oct-Dec) → due Jan 31
    const filingMonths = [1, 4, 7, 10]; // months when VAT is due
    for (let offset = 0; offset < 6; offset++) {
      let m = todayMonth + offset;
      let y = todayYear;
      while (m > 12) { m -= 12; y++; }
      if (filingMonths.includes(m)) {
        // VAT payment due around the end of this month
        const dueDate = `${y}-${String(m).padStart(2, "0")}-28`;
        const k = Math.floor((t0(dueDate) - start) / (7 * DAY));
        if (k >= 0 && k < W) result.push({ week: k, amount: vatAmount });
      }
    }
  } else {
    // Monthly filing: due on the last day of the following month
    for (let offset = 1; offset <= 4; offset++) {
      let m = todayMonth + offset;
      let y = todayYear;
      while (m > 12) { m -= 12; y++; }
      const dueDate = `${y}-${String(m).padStart(2, "0")}-28`;
      const k = Math.floor((t0(dueDate) - start) / (7 * DAY));
      if (k >= 0 && k < W) result.push({ week: k, amount: vatAmount });
    }
  }
  return result;
}

export function cashForecast(
  fin: Fin,
  inp: Pick<Input, "fixed" | "today">,
  opening: number,
  opts: CashOpts = { includeNew: false },
): CashForecastResult {
  const credit: Record<string, number> = { ...(opts.offsets || {}) };
  const W = opts.weeks || 13;
  const collectPct = (opts.collectPct ?? 90) / 100;
  const vatFiling: VatFiling = opts.vatFiling || "quarterly";
  const vatAmount = opts.vatPeriod ?? 0;
  const cogsRatio = opts.cogsRatio ?? (fin.baseline && fin.baseline.sales > 0 ? fin.baseline.cogs / fin.baseline.sales : 0.55);
  const custAvg = opts.customerAvgDays || {};
  const appExpenses = opts.appExpenses || [];

  const today = t0(inp.today), dow = new Date(today).getUTCDay(), start = today - dow * DAY;
  const weeks: CashWeek[] = Array.from({ length: W }, (_, i) => ({
    i, from: iso(start + i * 7 * DAY), to: iso(start + (i * 7 + 6) * DAY),
    in_ar: 0, in_new: 0,
    out_ap: 0, out_fixed: 0, out_var: 0, out_vat: 0, out_cogs_new: 0,
    items: [],
  }));
  const weekOf = (d: string) => { const k = Math.floor((t0(d) - start) / (7 * DAY)); return k >= 0 && k < W ? k : null; };

  // ── Receivables: per-customer timing using avg_days
  for (const o of fin.ar.open) {
    const v = o.unpaid * collectPct;
    if (v < 1) continue;
    const avgDays = custAvg[o.party];
    if (o.days > 0) {
      // Overdue: place based on customer's avg payment habit
      if (avgDays != null && avgDays > 0) {
        // Expected to pay avg_days after due date; spread over 2 weeks around that point
        const expectedDay = Math.max(0, avgDays - o.days);
        const expectedWeek = Math.min(W - 1, Math.floor(expectedDay / 7));
        const w2 = Math.min(W - 1, expectedWeek + 1);
        weeks[expectedWeek].in_ar += v * 0.6;
        weeks[w2].in_ar += v * 0.4;
      } else {
        // No avg_days: spread over 4 weeks (old behavior but with configurable %)
        const n = Math.min(4, W);
        for (let k = 0; k < n; k++) weeks[k].in_ar += v / n;
      }
    } else {
      const w = weekOf(o.due);
      if (w !== null) weeks[w].in_ar += v;
    }
    if (v >= 1000) {
      const targetW = o.days > 0
        ? (avgDays != null ? Math.min(W - 1, Math.floor(Math.max(0, avgDays - o.days) / 7)) : 0)
        : weekOf(o.due);
      if (targetW !== null) {
        weeks[targetW].items.push({
          kind: "in",
          label: `${o.party} · ${o.no}${o.days > 0 ? ` (متأخر ${o.days} يوم${avgDays != null ? ` — متوقع يدفع خلال ${Math.max(0, avgDays - o.days)} يوم` : ""})` : ""}`,
          amount: r0(v),
        });
      }
    }
  }

  // ── Payables (net of offsets)
  for (const o of [...fin.ap.open].sort((a, b) => a.due.localeCompare(b.due))) {
    let pay = o.unpaid;
    const c = credit[o.party] || 0;
    if (c > 0) { const used = Math.min(c, pay); credit[o.party] = r2c(c - used); pay = r2c(pay - used); }
    if (pay <= 0) continue;
    if (o.days > 0) {
      const n = Math.min(4, W);
      for (let k = 0; k < n; k++) weeks[k].out_ap += pay / n;
    } else {
      const w = weekOf(o.due); if (w !== null) weeks[w].out_ap += pay;
    }
    if (pay >= 1000) {
      const w = o.days > 0 ? 0 : weekOf(o.due);
      if (w !== null) weeks[w].items.push({
        kind: "out",
        label: `${o.party} · ${o.no}${o.unpaid !== pay ? " (بعد المقاصة)" : ""}${o.days > 0 ? ` (متأخر ${o.days} يوم)` : ""}`,
        amount: r0(pay),
      });
    }
  }

  // ── Fixed monthly costs on the 27th
  const fixedMonthly = inp.fixed.reduce((s, f) => s + f.monthly_amount, 0);
  const B = fin.baseline;
  const fixedUse = fixedMonthly > 0 ? fixedMonthly : B?.opex || 0;
  for (let k = 0; k < W * 7; k++) {
    const d = iso(start + k * DAY);
    if (d < inp.today || d.slice(8, 10) !== "27") continue;
    const w = weekOf(d)!;
    weeks[w].out_fixed += fixedUse;
    weeks[w].items.push({
      kind: "out",
      label: fixedMonthly > 0 ? `مصاريف ثابتة (${inp.fixed.map(f => f.name).join("، ")})` : "متوسط المصروفات الشهرية",
      amount: r0(fixedUse),
    });
  }

  // ── Dated temp/once expenses in their actual week
  for (const e of appExpenses) {
    if (e.type === "once" && e.date) {
      if (e.date < inp.today) continue;
      const w = weekOf(e.date);
      if (w !== null) {
        weeks[w].out_fixed += e.amount;
        weeks[w].items.push({ kind: "out", label: `${e.name} (مرة واحدة)`, amount: r0(e.amount) });
      }
    } else if (e.type === "temp" && e.start) {
      // temp expenses: check each month in the forecast window
      for (let k = 0; k < W * 7; k++) {
        const d = iso(start + k * DAY);
        if (d < inp.today || d.slice(8, 10) !== "01") continue;
        const m = d.slice(0, 7);
        if (activeIn(e, m)) {
          const w = weekOf(d);
          if (w !== null) {
            weeks[w].out_fixed += e.amount;
            weeks[w].items.push({ kind: "out", label: `${e.name} (مؤقت)`, amount: r0(e.amount) });
          }
        }
      }
    }
  }

  // ── Variable running costs
  const variableMonthly = Math.max(0, (B?.opex || 0) - fixedMonthly);
  if (fixedMonthly > 0 && variableMonthly > 0) {
    for (const w of weeks) w.out_var += variableMonthly / 4.33;
  }

  // ── VAT as real cash outflow
  const vatWeeks = vatFilingWeeks(start, W, vatAmount, vatFiling, inp.today);
  let vatTotal = 0;
  for (const vw of vatWeeks) {
    weeks[vw.week].out_vat += vw.amount;
    vatTotal += vw.amount;
    weeks[vw.week].items.push({ kind: "out", label: `ضريبة القيمة المضافة (${vatFiling === "quarterly" ? "ربع سنوية" : "شهرية"})`, amount: r0(vw.amount) });
  }

  // ── New sales (optional): with COGS deducted
  const newWeeklySales = B ? B.sales_gross / 4.33 * collectPct : 0;
  const newWeeklyCogs = B ? (B.sales / 4.33) * cogsRatio * 1.15 : 0; // COGS incl. VAT (cash out)
  if (opts.includeNew && B) {
    for (const w of weeks) {
      if (w.i >= 4) {
        w.in_new += newWeeklySales;
        w.out_cogs_new += newWeeklyCogs;
      }
    }
  }

  // ── Build result rows
  let bal = opening, low = { balance: opening, week: -1 }, firstNeg: number | null = null;
  const rows = weeks.map(w => {
    const inn = w.in_ar + w.in_new;
    const out = w.out_ap + w.out_fixed + w.out_var + w.out_vat + w.out_cogs_new;
    bal += inn - out;
    if (bal < low.balance) low = { balance: bal, week: w.i };
    if (bal < 0 && firstNeg === null) firstNeg = w.i;
    return {
      ...w,
      in_ar: r0(w.in_ar), in_new: r0(w.in_new),
      out_ap: r0(w.out_ap), out_fixed: r0(w.out_fixed), out_var: r0(w.out_var), out_vat: r0(w.out_vat), out_cogs_new: r0(w.out_cogs_new),
      net: r0(inn - out), balance: r0(bal),
      items: w.items.sort((a, b) => b.amount - a.amount).slice(0, 10),
    };
  });

  const tot = rows.reduce((s, r) => ({
    in: s.in + r.in_ar + r.in_new,
    out: s.out + r.out_ap + r.out_fixed + r.out_var + r.out_vat + r.out_cogs_new,
  }), { in: 0, out: 0 });

  const offTotal = Object.values(opts.offsets || {}).reduce((s, v) => s + v, 0);
  const offLeft = Object.values(credit).reduce((s, v) => s + v, 0);

  // ── Safety line = 1 month of fixed + variable expenses
  const safetyLine = fixedUse + (fixedMonthly > 0 ? variableMonthly : 0);

  // ── Days of cash: how many days the opening balance covers at current burn rate
  const weeklyBurn = tot.out / W;
  const daysOfCash = weeklyBurn > 0 ? Math.round(opening / (weeklyBurn / 7)) : null;

  // ── Free cash: opening minus VAT reserve and 1-month fixed reserve
  const freeCash = r0(opening - vatAmount - safetyLine);

  // ── DSO, DPO, CCC
  const dso = B && B.sales_gross > 0 ? Math.round(fin.ar.total / B.sales_gross * 30) : null;
  const dpo = B && B.cogs > 0 ? Math.round(fin.ap.total / (B.cogs * 1.15) * 30) : null;
  const ccc = dso !== null && dpo !== null ? dso - dpo : null;

  // ── Top 5 customers to call (overdue, biggest first, weighted by lateness)
  const calls: CustomerCall[] = fin.ar.open
    .filter(o => o.days > 0 && o.unpaid >= 500)
    .map(o => ({
      name: o.party,
      unpaid: r0(o.unpaid),
      days_late: o.days,
      avg_days: custAvg[o.party] ?? null,
      expected_week: custAvg[o.party] != null ? Math.min(W - 1, Math.floor(Math.max(0, custAvg[o.party] - o.days) / 7)) : null,
    }))
    .sort((a, b) => b.unpaid * Math.log2(b.days_late + 1) - a.unpaid * Math.log2(a.days_late + 1))
    .slice(0, 5);

  // ── Suppliers that can be deferred: overdue ones, impact = what we save if we push 4 weeks
  const deferrals: SupplierDefer[] = fin.ap.open
    .filter(o => o.days > 0 && o.unpaid >= 500)
    .map(o => ({ name: o.party, unpaid: r0(o.unpaid), days_late: o.days, saving_if_defer_4w: r0(o.unpaid) }))
    .sort((a, b) => b.unpaid - a.unpaid)
    .slice(0, 5);

  return {
    opening: r0(opening), rows,
    total_in: r0(tot.in), total_out: r0(tot.out), closing: r0(bal),
    lowest: { balance: r0(low.balance), week: low.week },
    first_negative_week: firstNeg,
    safety_line: r0(safetyLine),
    days_of_cash: daysOfCash,
    free_cash: freeCash,
    dso, dpo, ccc,
    calls, deferrals,
    assumptions: {
      collect_pct: Math.round(collectPct * 100),
      fixed_monthly: r0(fixedUse), fixed_source: fixedMonthly > 0 ? "list" as const : "average" as const,
      variable_monthly: r0(fixedMonthly > 0 ? variableMonthly : 0),
      include_new: opts.includeNew, new_weekly: B ? r0(newWeeklySales) : 0,
      cogs_weekly: B ? r0(newWeeklyCogs) : 0,
      vat_filing: vatFiling, vat_total: r0(vatTotal),
      offsets_applied: r0(offTotal - offLeft),
    },
  };
}

/** Legacy export for backward compat — the tiered collection function is no longer used in the forecast. */
export function collectChance(daysLate: number) {
  return daysLate <= 0 ? 0.95 : daysLate <= 30 ? 0.8 : daysLate <= 60 ? 0.6 : daysLate <= 90 ? 0.4 : 0.2;
}
