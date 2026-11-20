/**
 * Cash rescue plan: a month-by-month cash model (12+ months) that answers
 *  - how big the cash gap is and when it hits,
 *  - how much has to be sold every month to get through it without financing,
 *  - the SMALLEST financing that keeps the balance above the floor for the whole repayment period,
 *    for several terms, with the instalment and total cost, and the monthly sales that carry the instalment.
 * Pure — the API feeds it the open invoices, the opening balance and the company's averages.
 *
 * Model (all amounts incl. VAT where cash moves incl. VAT):
 *  - open customer invoices: `collect` share is collected (however late); overdue ones half this month, half next month,
 *    the rest in the month they fall due
 *  - open supplier invoices: paid in their due month (overdue: this month, or later if deferred), netted by the
 *    offsets the supplier owes us
 *  - operating expenses every month (this month only for the days left)
 *  - VAT already due for this month is paid next month
 *  - new monthly sales S from next month: collected in full `lagIn` months later (×1.15 VAT),
 *    stock bought back at cost `lagOut` months later (×1.15), net VAT on the margin paid the month after
 *  - financing F received at the start of the first month the balance would drop under the floor, repaid by a
 *    fixed instalment (annuity) over n months after an optional grace period
 */
import { addMonths, monthLabel } from "@/lib/collections";

export type PlanInputs = {
  today: string;
  opening: number; opening_as_of: string | null;
  ar: Array<{ unpaid: number; due: string }>;
  ap: Array<{ party: string; unpaid: number; due: string }>;
  offsets: Record<string, number>;
  vat_due: number;
  base: { sales: number; cogs_ratio: number; opex: number; months: number };
  lag_in: number; lag_out: number; dso: number;
  // the products the plan's new sales are assumed to be, and the blended cost ratio from them
  plan_cogs_ratio: number;
  products: Array<{ key: string; name: string; cost: number; price: number; cost_ratio: number; qty_sold: number }>;
  collect_pct?: number;
};
export type PlanOpts = {
  sales: number;        // planned net monthly sales (before VAT) from next month
  collect: number;      // share of the open customer invoices that gets collected (0–1), however late
  cut: number;          // % cut in operating expenses
  deferAp: number;      // months to push overdue supplier payments
  lagIn: number;        // months from a sale to its collection
  buffer: number;       // the floor the balance must stay above
  rate: number;         // annual financing rate %
  grace: number;        // months before the first instalment
  cogsRatio: number;    // cost of goods as a share of the new sales (drives supplier payments for new business)
  financing: { F: number; n: number } | null;   // a financing amount the owner typed; null = use the smallest computed
};

const VAT = 0.15;
const r0 = (n: number) => Math.round(n);
const ym = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
const idx = (today: string, d: string) => ym(d) - ym(today);

/** Cash flows per month for planned sales S over H months. */
export function simulate(p: PlanInputs, o: PlanOpts, S: number, H: number) {
  const z = () => Array<number>(H).fill(0);
  const ar = z(), nin = z(), ap = z(), nout = z(), opex = z(), vat = z();
  const [y, m, d] = p.today.split("-").map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate(), frac = (dim - d + 1) / dim;
  for (const a of p.ar) {
    const v = a.unpaid * o.collect; if (!(v > 0)) continue;
    if (a.due < p.today) { ar[0] += v / 2; if (H > 1) ar[1] += v / 2; }
    else { const t = idx(p.today, a.due); if (t < H) ar[t] += v; }
  }
  const credit: Record<string, number> = { ...p.offsets };
  for (const b of [...p.ap].sort((a, c) => a.due.localeCompare(c.due))) {
    let pay = b.unpaid; const c = credit[b.party] || 0;
    if (c > 0) { const used = Math.min(c, pay); credit[b.party] = c - used; pay -= used; }
    if (!(pay > 0)) continue;
    const t = b.due < p.today ? Math.max(0, o.deferAp) : idx(p.today, b.due);
    if (t < H) ap[t] += pay;
  }
  for (let t = 0; t < H; t++) opex[t] = p.base.opex * (1 - o.cut / 100) * (t === 0 ? frac : 1);
  if (p.vat_due > 0 && H > 1) vat[1] += p.vat_due;
  const cr = o.cogsRatio, inPer = 1 + VAT, purPer = (1 + VAT) * cr, vatPer = VAT * (1 - cr);
  for (let k = 1; k < H; k++) {
    if (k + o.lagIn < H) nin[k + o.lagIn] += S * inPer;
    if (k + p.lag_out < H) nout[k + p.lag_out] += S * purPer;
    if (k + 1 < H) vat[k + 1] += S * vatPer;
  }
  let b = p.opening; const bal = z();
  for (let t = 0; t < H; t++) { b += ar[t] + nin[t] - ap[t] - nout[t] - opex[t] - vat[t]; bal[t] = b; }
  return { ar, nin, ap, nout, opex, vat, bal };
}

/** Cash a riyal of monthly sales leaves each month once things settle (after restocking and VAT) = the gross margin. */
export const unitNet = (p: PlanInputs, cr: number) => (1 + VAT) - (1 + VAT) * cr - VAT * (1 - cr);
/** Fixed instalment per riyal financed. */
export const annuity = (ratePct: number, n: number) => { const i = ratePct / 100 / 12; return i > 0 ? i / (1 - Math.pow(1 + i, -n)) : 1 / n; };

function minIdx(a: number[]) { let k = 0; for (let t = 1; t < a.length; t++) if (a[t] < a[k]) k = t; return k; }

/** The smallest financing over an n-month term that keeps every month at or above the floor, or why there is none. */
export function financeTerm(p: PlanInputs, o: PlanOpts, n: number, S = o.sales) {
  const probe = simulate(p, o, S, 12).bal;
  const f0 = probe.findIndex(b => b < o.buffer);
  if (f0 < 0) return { n, needed: false as const, feasible: true, F: 0, installment: 0, total: 0, cost: 0, start: null as string | null, first_payment: null as string | null, last_payment: null as string | null, f0: -1, H: 12 };
  const H = Math.min(36, Math.max(12, f0 + o.grace + n + 1));
  const bal = simulate(p, o, S, H).bal, a = annuity(o.rate, n);
  let Fmin = 0, Fmax = Infinity;
  for (let t = 0; t < H; t++) {
    const paid = Math.max(0, Math.min(n, t - (f0 + o.grace)));
    const c = (t >= f0 ? 1 : 0) - a * paid;
    if (c > 1e-9) Fmin = Math.max(Fmin, (o.buffer - bal[t]) / c);
    else if (c < -1e-9) Fmax = Math.min(Fmax, (bal[t] - o.buffer) / -c);
    else if (bal[t] < o.buffer - 1e-6) Fmax = -1;           // nothing financed can help this month
  }
  const feasible = Fmin <= Fmax + 1e-6;
  // round up to a clean figure without breaking the upper bound
  let F = Math.ceil(Fmin / 1000) * 1000; if (F > Fmax) F = Math.ceil(Fmin / 100) * 100; if (F > Fmax) F = Fmin;
  const installment = F * a;
  const cur = p.today.slice(0, 7);
  return { n, needed: true as const, feasible, F: r0(F), installment: r0(installment), total: r0(installment * n), cost: r0(installment * n - F),
    start: addMonths(cur, f0), first_payment: addMonths(cur, f0 + o.grace + 1), last_payment: addMonths(cur, f0 + o.grace + n), f0, H };
}

/** The lowest planned monthly sales that make an n-month financing possible at all (binary search). */
export function minSalesForTerm(p: PlanInputs, o: PlanOpts, n: number) {
  let lo = 0, hi = Math.max(o.sales * 4, p.base.opex * 20, 100000);
  if (!financeTerm(p, o, n, hi).feasible) return null;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (financeTerm(p, o, n, mid).feasible) hi = mid; else lo = mid; }
  return Math.ceil(hi / 1000) * 1000;
}

export type PlanRow = { m: string; label: string; sales: number; collections: number; suppliers: number; expenses: number; vat: number; loan_in: number; installment: number; net: number; balance: number };

/** Month-by-month table for planned sales S with financing F over n months (F = 0: no financing). */
export function planRows(p: PlanInputs, o: PlanOpts, S: number, fin: { F: number; n: number; f0: number } | null, H = 12): PlanRow[] {
  const sim = simulate(p, o, S, H), a = fin && fin.F > 0 ? annuity(o.rate, fin.n) * fin.F : 0, cur = p.today.slice(0, 7);
  let bal = p.opening;
  return sim.bal.map((_, t) => {
    const loan = fin && fin.F > 0 && t === fin.f0 ? fin.F : 0;
    const inst = fin && fin.F > 0 && t > fin.f0 + o.grace && t <= fin.f0 + o.grace + fin.n ? a : 0;
    const collections = sim.ar[t] + sim.nin[t], suppliers = sim.ap[t] + sim.nout[t];
    const net = collections + loan - suppliers - sim.opex[t] - sim.vat[t] - inst; bal += net;
    const m = addMonths(cur, t);
    return { m, label: monthLabel(m), sales: t >= 1 ? r0(S) : 0, collections: r0(collections), suppliers: r0(suppliers), expenses: r0(sim.opex[t]), vat: r0(sim.vat[t]),
      loan_in: r0(loan), installment: r0(inst), net: r0(net), balance: r0(bal) };
  });
}

export const TERMS = [6, 12, 18, 24];

/** The plan for a financing amount the owner typed (F over n months), placed where the balance first drops. */
export function manualFinance(p: PlanInputs, o: PlanOpts, S: number, F: number, n: number) {
  const cur = p.today.slice(0, 7);
  let f0 = simulate(p, o, S, 12).bal.findIndex(b => b < o.buffer); if (f0 < 0) f0 = 0;
  const H = Math.min(48, Math.max(12, f0 + o.grace + n + 1));
  const a = annuity(o.rate, n), installment = F * a;
  const rows = planRows(p, o, S, F > 0 ? { F, n, f0 } : null, H);
  const min = Math.min(...rows.map(r => r.balance));
  return { F: r0(F), n, f0, H, installment: r0(installment), total: r0(installment * n), cost: r0(installment * n - F),
    start: addMonths(cur, f0), first_payment: addMonths(cur, f0 + o.grace + 1), last_payment: addMonths(cur, f0 + o.grace + n),
    min_balance: r0(min), ok: min >= o.buffer - 1 };
}

/** Everything the plan screen shows for one set of choices. */
export function cashPlan(p: PlanInputs, o: PlanOpts) {
  const cur = p.today.slice(0, 7);
  const bal = simulate(p, o, o.sales, 12).bal, low = minIdx(bal);
  const gap = Math.max(0, o.buffer - bal[low]);
  // without financing: the planned sales needed every month (linear in S)
  const b0 = simulate(p, o, 0, 12).bal, b1 = simulate(p, o, 1, 12).bal;
  let need = 0; const blocked: string[] = [];
  for (let t = 0; t < 12; t++) {
    const s = b1[t] - b0[t];
    if (s > 1e-9) need = Math.max(need, (o.buffer - b0[t]) / s);
    else if (b0[t] < o.buffer - 1e-6) blocked.push(addMonths(cur, t));
  }
  const un = unitNet(p, o.cogsRatio), opex = p.base.opex * (1 - o.cut / 100);
  const sustain = un > 0 ? opex / un : null;   // sales that cover expenses month after month (break-even)
  const noFinance = { possible: !blocked.length, blocked, sales: blocked.length ? null : Math.ceil(Math.max(need, sustain || 0) / 1000) * 1000 };
  const carry = (inst: number) => un > 0 ? Math.ceil((opex + inst) / un / 1000) * 1000 : null;   // sales that carry expenses + instalment
  const terms = TERMS.map(n => {
    const f = financeTerm(p, o, n);
    const minS = f.feasible ? null : minSalesForTerm(p, o, n);
    // when these sales can't repay anything: the smallest financing at the lowest sales that work
    // never below break-even, so the balance doesn't drift down again once the horizon ends
    const fixS = minS === null ? null : Math.max(minS, sustain === null ? 0 : Math.ceil(sustain / 1000) * 1000);
    const fix = fixS === null ? null : (() => { const g = financeTerm(p, o, n, fixS); return { sales: fixS, F: g.F, installment: g.installment, cost: g.cost, start: g.start, first_payment: g.first_payment, last_payment: g.last_payment }; })();
    return { ...f, carry_sales: carry(f.installment), min_sales: minS, fix };
  });
  // suggested plan: at the planned sales, the shortest term whose financing is within 5% of the smallest one;
  // if no term works at the planned sales, the term that needs the lowest sales (then the shortest)
  const ok = terms.filter(t => t.needed && t.feasible);
  let suggestion: { sales: number; n: number; F: number; installment: number; cost: number; start: string | null; first_payment: string | null; last_payment: string | null; carry_sales: number | null; raised: boolean } | null = null;
  if (ok.length) {
    const minF = Math.min(...ok.map(t => t.F)); const r = ok.find(t => t.F <= minF * 1.05 + 1000)!;
    suggestion = { sales: o.sales, n: r.n, F: r.F, installment: r.installment, cost: r.cost, start: r.start, first_payment: r.first_payment, last_payment: r.last_payment, carry_sales: r.carry_sales, raised: false };
  } else if (gap > 0) {
    const fx = terms.filter(t => t.fix).sort((a, b) => a.fix!.sales - b.fix!.sales || a.n - b.n)[0];
    if (fx && fx.fix) suggestion = { ...fx.fix, n: fx.n, carry_sales: carry(fx.fix.installment), raised: true };
  }
  return {
    today: p.today, opening: r0(p.opening), lowest: { balance: r0(bal[low]), month: addMonths(cur, low), label: monthLabel(addMonths(cur, low)) },
    first_short: (() => { const t = bal.findIndex(x => x < o.buffer); return t < 0 ? null : monthLabel(addMonths(cur, t)); })(),
    gap: r0(gap), needs_help: gap > 0, no_finance: noFinance, sustain_sales: sustain === null ? null : Math.ceil(sustain / 1000) * 1000,
    unit_net: Math.round(un * 1000) / 1000, terms, recommended: suggestion && !suggestion.raised ? suggestion.n : null, suggestion,
  };
}
export type CashPlan = ReturnType<typeof cashPlan>;
