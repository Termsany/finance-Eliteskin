import { NextResponse } from "next/server";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { computeBudget } from "@/lib/budget";
import { query } from "@/lib/db";

const SHARED_KEY = process.env.SHARED_API_KEY;
const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET(req: Request) {
  const auth = req.headers.get("x-api-key");
  if (!SHARED_KEY || auth !== SHARED_KEY) return forbid();

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const today = riyadhToday();
  const inp = await loadInput(today);
  const fin = computeFinance(inp, from || `${today.slice(0, 7)}-01`, to || today);
  const bt = (await query<{ monthly_sales_target: number | null; monthly_profit_target: number | null }>(
    "SELECT monthly_sales_target::float8, monthly_profit_target::float8 FROM fin_settings WHERE id=1"
  ).catch(() => ({ rows: [] }))).rows[0];
  const budget = computeBudget({
    today,
    monthSales: fin.kpi.sales,
    monthNet: fin.kpi.net,
    grossMarginPct: fin.kpi.gross_margin,
    fixedMonthly: fin.fixed_monthly,
    monthOpex: fin.kpi.opex,
    salesTarget: bt?.monthly_sales_target ?? null,
    profitTarget: bt?.monthly_profit_target ?? null,
  });

  return NextResponse.json({
    today,
    kpi: fin.kpi,
    ar: { total: fin.ar.total, overdue: fin.ar.overdue, parties: fin.ar.parties.slice(0, 20) },
    ap: { total: fin.ap.total, overdue: fin.ap.overdue },
    baseline: fin.baseline,
    monthly: fin.monthly,
    pricing: fin.pricing,
    budget,
    goals: {
      monthly_sales_target: bt?.monthly_sales_target ?? null,
      monthly_profit_target: bt?.monthly_profit_target ?? null,
      fixed_monthly: fin.fixed_monthly,
    },
  });
}
