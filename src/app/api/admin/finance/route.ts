import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { syncIfStale, syncRunning } from "@/lib/daftra";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { prevKpi, prevRange } from "@/lib/fin-ai";
import { aiStatus } from "@/lib/ai-provider";
import { attention } from "@/lib/fin-books";
import { collectionPlan, monthEnd, receivedIn } from "@/lib/collections";
import { openBySupplier } from "@/lib/offsets";
import { loadOrders } from "@/lib/offsets-data";
import { computeBudget } from "@/lib/budget";

const DAY = /^20\d\d-\d\d-\d\d$/;

/** Full finance picture for a period (admin only). Data is a read-only mirror of Daftra. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") || "", to = sp.get("to") || "";
  if (!DAY.test(from) || !DAY.test(to) || from > to) return NextResponse.json({ error: "فترة غير صحيحة" }, { status: 400 });
  try {
  await syncIfStale(60);
  const today = riyadhToday();
  const [inp, sync] = await Promise.all([loadInput(today), query("SELECT started_at, finished_at, ok, message, invoices FROM daftra_sync WHERE id=1")]);
  const fin = computeFinance(inp, from, to);
  // same-length period right before this one, for "better or worse than last time"
  const pr = prevRange(fin.period.from, to, fin.books_start);
  const prev = pr ? prevKpi(computeFinance(inp, pr[0], pr[1]), pr[0], pr[1]) : null;
  // how many sales invoices the mirror holds, how many fall before the books start (left out of P&L) and in this period
  const bs = fin.books_start || "";
  const docs = { total: inp.sales.length, before_start: bs ? inp.sales.filter(s => s.date < bs).length : 0, in_period: inp.sales.filter(s => s.date >= fin.period.from && s.date <= to).length };
  const todo = attention({ ar: fin.ar, ap: fin.ap, monthly: fin.monthly as Array<{ m: string; opex: number; sales: number; cogs: number }>, price_guard: fin.price_guard, stock_alerts: fin.stock_alerts, cost_coverage: fin.kpi.cost_coverage, today });
  // payment promises that came due and still aren't marked paid — most urgent, go first
  const duePromises = (await query<{ customer: string; promise_date: string; promise_amount: number | null }>(
    "SELECT customer, promise_date::text, promise_amount::float8 FROM collection_followups WHERE status='open' AND promise_date IS NOT NULL AND promise_date <= $1 ORDER BY promise_date", [today]).catch(() => ({ rows: [] }))).rows;
  if (duePromises.length) { const k = (n: number) => Math.round(n).toLocaleString("en-US");
    todo.unshift({ level: "danger", title: `${duePromises.length} وعد دفع فات ميعاده`, text: duePromises.slice(0, 3).map(p => `${p.customer}${p.promise_amount ? ` ${k(p.promise_amount)} ر.س` : ""} (${p.promise_date})`).join("، "), tab: "collections", party: duePromises[0].customer, kind: "client" }); }
  // this month's collection at a glance (the full list is in the collections tab)
  const cm = today.slice(0, 7), cp = collectionPlan(fin.ar.open, cm, today);
  const collect = { ...cp.totals, month: cm, due_month: cp.totals.month, done: receivedIn(inp.payments, `${cm}-01`, today), end: monthEnd(cm) };
  // budget: this calendar month's sales/profit vs the owner's targets, plus break-even (always current month, not the chosen range)
  const curFin = cm === fin.period.from.slice(0, 7) && to === today ? fin : computeFinance(inp, `${cm}-01`, today);
  const bt = (await query<{ monthly_sales_target: number | null; monthly_profit_target: number | null }>("SELECT monthly_sales_target::float8, monthly_profit_target::float8 FROM fin_settings WHERE id=1").catch(() => ({ rows: [] as never[] }))).rows[0];
  const budget = computeBudget({ today, monthSales: curFin.kpi.sales, monthNet: curFin.kpi.net,
    grossMarginPct: curFin.kpi.gross_margin ?? inp.settings.target_gross_margin, fixedMonthly: curFin.fixed_monthly, monthOpex: curFin.kpi.opex,
    salesTarget: bt?.monthly_sales_target ?? null, profitTarget: bt?.monthly_profit_target ?? null });
  // supplier offsets owed to us (price differences not yet deducted) — used to show the real net on the supplier pages
  const offOrders = await loadOrders().catch(() => []);
  const offMap = openBySupplier(offOrders);
  const offsets = { open: Math.round(Object.values(offMap).reduce((s, v) => s + v, 0) * 100) / 100, bySupplier: offMap };
  return NextResponse.json({ ...fin, docs, attention: todo, collect, offsets, budget, prev, link: null, ai: (await aiStatus()).configured, sync: { ...sync.rows[0], running: syncRunning() }, today });
  } catch (e) {
    console.error("finance GET error:", e);
    return NextResponse.json({ error: "تعذر تحميل البيانات المالية" }, { status: 500 });
  }
}
