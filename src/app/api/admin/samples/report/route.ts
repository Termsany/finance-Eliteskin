import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return NextResponse.json({ error: "from/to required (YYYY-MM)" }, { status: 400 });

  const reps = (await query<{ id: number; name: string; product_name: string | null }>(
    `SELECT r.id, r.name, p.name as product_name FROM reps r LEFT JOIN daftra_products p ON p.id = r.product_id WHERE r.active ORDER BY r.name`
  )).rows;

  const budgets = (await query<{ rep_id: number; month: string; sample_budget: string; promo_budget: string }>(
    `SELECT rep_id, month, sample_budget::text, promo_budget::text FROM rep_budgets WHERE month >= $1 AND month <= $2`, [from, to]
  )).rows;

  const samples = (await query<{ rep_id: number; month: string; total_units: string; total_cost: string; over_budget: boolean }>(
    `SELECT rep_id, month, total_units::text, total_cost::text, over_budget FROM sample_records WHERE month >= $1 AND month <= $2`, [from, to]
  )).rows;

  const promos = (await query<{ rep_id: number; month: string; amount: string; over_budget: boolean }>(
    `SELECT rep_id, month, amount::text, over_budget FROM promo_expenses WHERE month >= $1 AND month <= $2`, [from, to]
  )).rows;

  const result = reps.map(r => {
    const repBudgets = budgets.filter(b => b.rep_id === r.id);
    const monthSet = new Set(repBudgets.map(b => b.month));
    return {
      rep_id: r.id, rep_name: r.name, product_name: r.product_name || "",
      months: [...monthSet].sort().map(m => {
        const b = repBudgets.find(x => x.month === m);
        const sRecs = samples.filter(s => s.rep_id === r.id && s.month === m);
        const pRecs = promos.filter(p => p.rep_id === r.id && p.month === m);
        return {
          month: m,
          sample_budget: Number(b?.sample_budget || 0),
          sample_used: sRecs.reduce((s, x) => s + Number(x.total_units), 0),
          sample_cost: sRecs.reduce((s, x) => s + Number(x.total_cost), 0),
          promo_budget: Number(b?.promo_budget || 0),
          promo_used: pRecs.reduce((s, x) => s + Number(x.amount), 0),
          overrides: sRecs.filter(x => x.over_budget).length + pRecs.filter(x => x.over_budget).length,
        };
      }),
    };
  });

  return NextResponse.json({ reps: result });
}
