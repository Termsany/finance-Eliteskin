import { query } from "@/lib/db";
import { computeFinance, loadInput, norm, riyadhToday } from "@/lib/finance";
import { openBySupplier } from "@/lib/offsets";
import { loadOrders } from "@/lib/offsets-data";
import type { PlanInputs, PlanOpts } from "@/lib/cash-plan";

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

async function daftraCashTotal(): Promise<number | null> {
  const r = (await query<{ balance: number | null }>(
    "SELECT balance::float8 FROM daftra_accounts WHERE (code LIKE '1201%' OR code LIKE '1202%') AND balance IS NOT NULL"
  ).catch(() => ({ rows: [] }))).rows;
  if (r.length === 0) {
    const je = (await query<{ total: number }>(
      "SELECT (sum(debit) - sum(credit))::float8 total FROM daftra_journal_entries j JOIN daftra_accounts a ON a.id = j.account_id WHERE a.code LIKE '1201%' OR a.code LIKE '1202%'"
    ).catch(() => ({ rows: [] }))).rows;
    return je[0]?.total != null ? Math.round(je[0].total * 100) / 100 : null;
  }
  return Math.round(r.reduce((s, a) => s + (a.balance || 0), 0) * 100) / 100;
}
/** The products the plan's new sales are built on — their purchase cost drives the supplier payments. */
export const PLAN_PRODUCTS = ["arche", "spectra", "dermomine", "gro"];

/** Live inputs for the cash plan: opening balance, open invoices, offsets, company averages, and the plan products' cost. */
export async function loadPlanInputs(): Promise<PlanInputs> {
  const today = riyadhToday();
  const inp = await loadInput(today);
  const fin = computeFinance(inp, `${today.slice(0, 7)}-01`, today);
  const B = fin.baseline;
  const s = (await query<{ cash_balance: number | null; cash_as_of: string | null; cash_collect_pct: number; vat_filing: string }>("SELECT cash_balance::float8, cash_as_of::text, cash_collect_pct, vat_filing FROM fin_settings WHERE id=1").catch(() => ({ rows: [] }))).rows[0];
  const offsets = openBySupplier(await loadOrders().catch(() => []));
  const yearAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 365 * 864e5).toISOString().slice(0, 10);
  const avgDue = (docs: Array<{ date: string; due_days: number; total: number }>) => {
    const r = docs.filter(d => d.date >= yearAgo && d.total > 0); const w = r.reduce((a, d) => a + d.total, 0);
    return w > 0 ? r.reduce((a, d) => a + d.due_days * d.total, 0) / w : 30;
  };
  const dso = B && B.sales_gross > 0 ? fin.ar.total / B.sales_gross * 30 : avgDue(inp.sales);
  const cogsRatio = B && B.sales > 0 ? clamp(B.cogs / B.sales, 0, 0.95) : clamp(1 - inp.settings.target_gross_margin / 100, 0, 0.95);

  // the plan products: cost ÷ selling price, and a blended ratio weighted by how much of each sells
  const products = fin.pricing
    .filter(x => { const nm = norm(x.name); return PLAN_PRODUCTS.some(w => nm.includes(w)); })
    .map(x => { const price = x.realized_price ?? x.list_price ?? 0, cost = x.avg_cost ?? 0;
      return { key: x.key, name: x.name, cost, price, qty_sold: x.qty_sold, cost_ratio: price > 0 && cost > 0 ? clamp(cost / price, 0, 0.98) : 0 }; })
    .filter(x => x.cost_ratio > 0)
    .sort((a, b) => b.qty_sold * b.price - a.qty_sold * a.price);
  const wsum = products.reduce((a, x) => a + x.qty_sold * x.price, 0);
  const planRatio = products.length === 0 ? cogsRatio
    : wsum > 0 ? products.reduce((a, x) => a + x.cost_ratio * x.qty_sold * x.price, 0) / wsum
    : products.reduce((a, x) => a + x.cost_ratio, 0) / products.length;

  return {
    today, opening: await daftraCashTotal() ?? s?.cash_balance ?? 0, opening_as_of: s?.cash_as_of ?? null,
    ar: fin.ar.open.map(o => ({ unpaid: o.unpaid, due: o.due })),
    ap: fin.ap.open.map(o => ({ party: o.party, unpaid: o.unpaid, due: o.due })),
    offsets, vat_due: Math.max(0, fin.kpi.vat_payable),
    base: { sales: B?.sales ?? 0, cogs_ratio: cogsRatio, opex: Math.max(fin.fixed_monthly, B?.opex ?? 0), months: B?.months_count ?? 0 },
    lag_in: clamp(Math.round(avgDue(inp.sales) / 30), 1, 3), lag_out: clamp(Math.round(avgDue(inp.purchases) / 30), 0, 3), dso: Math.round(dso),
    plan_cogs_ratio: Math.round(planRatio * 1000) / 1000, products: products.map(x => ({ ...x, cost: Math.round(x.cost * 100) / 100, price: Math.round(x.price * 100) / 100, cost_ratio: Math.round(x.cost_ratio * 1000) / 1000 })),
    collect_pct: s?.cash_collect_pct ?? 90,
  };
}

/** Options from a query string / request body, with the owner's defaults (90% collection, no buffer, 10% rate, no grace). */
export function readOpts(p: PlanInputs, q: Record<string, unknown>): PlanOpts {
  const num = (k: string, d: number, lo: number, hi: number) => { const v = Number(q[k]); return Number.isFinite(v) && q[k] !== "" && q[k] !== null && q[k] !== undefined ? clamp(v, lo, hi) : d; };
  const finF = Number(q.fin), finN = Math.round(num("finN", 12, 1, 60));
  return {
    sales: num("sales", Math.round(p.base.sales / 1000) * 1000, 0, 1e9),
    collect: num("collect", p.collect_pct ?? 90, 10, 100) / 100,
    cut: num("cut", 0, 0, 80),
    deferAp: Math.round(num("defer", 0, 0, 6)),
    lagIn: Math.round(num("lag", p.lag_in, 0, 4)),
    buffer: num("buffer", 0, 0, 1e9),
    rate: num("rate", 10, 0, 40),
    grace: Math.round(num("grace", 0, 0, 12)),
    cogsRatio: num("cogs", p.plan_cogs_ratio * 100, 0, 98) / 100,
    financing: Number.isFinite(finF) && finF > 0 ? { F: finF, n: finN } : null,
  };
}
