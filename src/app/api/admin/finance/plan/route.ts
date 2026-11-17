import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";
import { loadPlanInputs } from "@/lib/cash-plan-data";

const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

/** The live inputs of the cash plan (the page runs the plan itself so the controls react instantly), plus the approved plan. */
export async function GET() {
  if (!(await getCurrentUser())) return forbid();
  const inputs = await loadPlanInputs();
  const saved = await getSetting("cash_plan");
  return NextResponse.json({ inputs, approved: saved ? JSON.parse(saved) : null });
}

/** Approve a plan: its monthly sales become the month's sales target, and the plan is kept for reference. */
export async function POST(req: Request) {
  if (!(await getCurrentUser())) return forbid();
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const n = (k: string) => Number(b?.[k]);
  const target = n("target_sales");
  if (!Number.isFinite(target) || target < 0 || target > 1e10) return NextResponse.json({ error: "مبيعات الخطة غير صحيحة" }, { status: 400 });
  const plan = { approved_at: new Date().toISOString(), target_sales: Math.round(target), financing: Math.max(0, Math.round(n("financing") || 0)),
    term: Math.round(n("term") || 0), installment: Math.max(0, Math.round(n("installment") || 0)), rate: n("rate") || 0, grace: Math.round(n("grace") || 0),
    start: typeof b?.start === "string" ? b.start.slice(0, 7) : null, collect: n("collect") || 0.9 };
  await setSetting("cash_plan", JSON.stringify(plan));
  await query("UPDATE fin_settings SET monthly_sales_target=$1, updated_at=now() WHERE id=1", [plan.target_sales]);
  return NextResponse.json({ ok: true, plan });
}

export async function DELETE() {
  if (!(await getCurrentUser())) return forbid();
  await setSetting("cash_plan", null);
  return NextResponse.json({ ok: true });
}
