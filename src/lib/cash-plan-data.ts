import { query } from "@/lib/db";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { openBySupplier } from "@/lib/offsets";
import { loadOrders } from "@/lib/offsets-data";
import type { PlanInputs, PlanOpts } from "@/lib/cash-plan";

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** Live inputs for the cash plan: opening balance, open invoices, offsets, and the company's monthly averages. */
export async function loadPlanInputs(): Promise<PlanInputs> {
  const today = riyadhToday();
  const inp = await loadInput(today);
  const fin = computeFinance(inp, `${today.slice(0, 7)}-01`, today);
  const B = fin.baseline;
  const s = (await query<{ cash_balance: number | null; cash_as_of: string | null }>("SELECT cash_balance::float8, cash_as_of::text FROM fin_settings WHERE id=1").catch(() => ({ rows: [] }))).rows[0];
  const offsets = openBySupplier(await loadOrders().catch(() => []));
  // average payment terms of the last 12 months (customers / suppliers) → months until cash moves for new business
  const yearAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 365 * 864e5).toISOString().slice(0, 10);
  const avgDue = (docs: Array<{ date: string; due_days: number; total: number }>) => {
    const r = docs.filter(d => d.date >= yearAgo && d.total > 0); const w = r.reduce((a, d) => a + d.total, 0);
    return w > 0 ? r.reduce((a, d) => a + d.due_days * d.total, 0) / w : 30;
  };
  const dso = B && B.sales_gross > 0 ? fin.ar.total / B.sales_gross * 30 : avgDue(inp.sales);
  const cogsRatio = B && B.sales > 0 ? clamp(B.cogs / B.sales, 0, 0.95) : clamp(1 - inp.settings.target_gross_margin / 100, 0, 0.95);
  return {
    today, opening: s?.cash_balance ?? 0, opening_as_of: s?.cash_as_of ?? null,
    ar: fin.ar.open.map(o => ({ unpaid: o.unpaid, due: o.due })),
    ap: fin.ap.open.map(o => ({ party: o.party, unpaid: o.unpaid, due: o.due })),
    offsets, vat_due: Math.max(0, fin.kpi.vat_payable),
    base: { sales: B?.sales ?? 0, cogs_ratio: cogsRatio, opex: Math.max(fin.fixed_monthly, B?.opex ?? 0), months: B?.months_count ?? 0 },
    lag_in: clamp(Math.round(avgDue(inp.sales) / 30), 1, 3), lag_out: clamp(Math.round(avgDue(inp.purchases) / 30), 0, 3), dso: Math.round(dso),
  };
}

/** Options from a query string / request body, with the owner's defaults (90% collection, no buffer, 10% rate, no grace). */
export function readOpts(p: PlanInputs, q: Record<string, unknown>): PlanOpts {
  const num = (k: string, d: number, lo: number, hi: number) => { const v = Number(q[k]); return Number.isFinite(v) && q[k] !== "" && q[k] !== null && q[k] !== undefined ? clamp(v, lo, hi) : d; };
  return {
    sales: num("sales", Math.round(p.base.sales / 1000) * 1000, 0, 1e9),
    collect: num("collect", 90, 10, 100) / 100,
    cut: num("cut", 0, 0, 80),
    deferAp: Math.round(num("defer", 0, 0, 6)),
    lagIn: Math.round(num("lag", p.lag_in, 0, 4)),
    buffer: num("buffer", 0, 0, 1e9),
    rate: num("rate", 10, 0, 40),
    grace: Math.round(num("grace", 0, 0, 12)),
  };
}
