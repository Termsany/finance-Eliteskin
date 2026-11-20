import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { ensureBudget, repMonthSummary } from "@/lib/samples";
import { riyadhToday } from "@/lib/riyadh-day";

const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

/** List all reps with current month budget/usage, or a specific month via ?month=YYYY-MM */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const url = new URL(req.url);
  const month = url.searchParams.get("month") || riyadhToday().slice(0, 7);
  const reps = (await query<{ id: number; name: string; product_id: string | null; product_name: string | null; active: boolean }>(
    `SELECT r.id, r.name, r.product_id::text, p.name as product_name, r.active
     FROM reps r LEFT JOIN daftra_products p ON p.id = r.product_id WHERE r.active ORDER BY r.name`)).rows
    .map(r => ({ ...r, product_id: r.product_id ? Number(r.product_id) : null }));

  const summaries = await Promise.all(reps.map(async r => {
    const s = await repMonthSummary(r.id, month);
    return { ...r, ...s };
  }));

  const records = (await query<{ id: number; rep_id: number; month: string; dispensed_at: string; total_units: string; total_cost: string; over_budget: boolean; override_reason: string | null; notes: string }>(
    "SELECT id, rep_id, month, dispensed_at::text, total_units::text, total_cost::text, over_budget, override_reason, notes FROM sample_records WHERE month=$1 ORDER BY dispensed_at DESC", [month])).rows
    .map(r => ({ ...r, total_units: Number(r.total_units), total_cost: Number(r.total_cost) }));

  return NextResponse.json({ month, reps: summaries, records });
}

/** Dispense samples: { rep_id, units, notes?, override_reason? } */
export async function POST(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const b = await req.json().catch(() => null) as { rep_id?: number; units?: number; notes?: string; override_reason?: string } | null;
  if (!b?.rep_id || !b.units || b.units <= 0) return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  const repId = Number(b.rep_id), units = Number(b.units);

  const month = riyadhToday().slice(0, 7);
  const budget = await ensureBudget(repId, month);
  const used = (await query<{ total: string }>("SELECT COALESCE(SUM(total_units), 0) as total FROM sample_records WHERE rep_id=$1 AND month=$2", [repId, month])).rows[0];
  const usedUnits = Number(used?.total || 0);
  const remaining = budget.sample_budget - usedUnits;
  const overBudget = units > remaining;

  if (overBudget && !b.override_reason?.trim()) {
    return NextResponse.json({ error: "تجاوز الحد المسموح — اكتب سبب التجاوز", over_budget: true, budget: budget.sample_budget, used: usedUnits, requested: units }, { status: 400 });
  }

  const totalCost = Math.round(units * budget.unit_cost * 100) / 100;
  const r = await query<{ id: number }>(
    `INSERT INTO sample_records(rep_id, month, total_units, total_cost, over_budget, override_reason, notes)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [repId, month, units, totalCost, overBudget, overBudget ? b.override_reason!.trim().slice(0, 500) : null, (b.notes || "").trim().slice(0, 500)]);
  return NextResponse.json({ id: r.rows[0].id, total_cost: totalCost, over_budget: overBudget });
}
