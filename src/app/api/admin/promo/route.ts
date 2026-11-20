import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { ensureBudget, type PromoType } from "@/lib/samples";
import { riyadhToday } from "@/lib/riyadh-day";

const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const TYPES: PromoType[] = ["pms", "lunch", "rtd", "other"];

export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const url = new URL(req.url);
  const month = url.searchParams.get("month") || riyadhToday().slice(0, 7);
  const repId = url.searchParams.get("rep_id");
  const where = repId ? "AND pe.rep_id=$2" : "";
  const vals: unknown[] = [month];
  if (repId) vals.push(Number(repId));
  const rows = (await query<{ id: number; rep_id: number; rep_name: string; month: string; expense_date: string; promo_type: PromoType; other_desc: string; amount: string; place: string; doctors: string; attendees: number; notes: string; over_budget: boolean; override_reason: string | null }>(
    `SELECT pe.id, pe.rep_id, r.name as rep_name, pe.month, pe.expense_date::text, pe.promo_type, pe.other_desc, pe.amount::text, pe.place, pe.doctors, pe.attendees, pe.notes, pe.over_budget, pe.override_reason
     FROM promo_expenses pe JOIN reps r ON r.id = pe.rep_id WHERE pe.month=$1 ${where} ORDER BY pe.expense_date DESC`, vals)).rows
    .map(r => ({ ...r, amount: Number(r.amount), doctors: JSON.parse(r.doctors || "[]") as string[] }));
  return NextResponse.json({ month, expenses: rows });
}

export async function POST(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const b = await req.json().catch(() => null) as { rep_id?: number; expense_date?: string; promo_type?: string; other_desc?: string; amount?: number; place?: string; doctors?: string[]; attendees?: number; notes?: string; override_reason?: string } | null;
  if (!b?.rep_id || !b.expense_date || !b.promo_type || !b.amount || b.amount <= 0) return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  if (!TYPES.includes(b.promo_type as PromoType)) return NextResponse.json({ error: "نوع غير صحيح" }, { status: 400 });
  if (b.promo_type === "other" && !b.other_desc?.trim()) return NextResponse.json({ error: "اكتب وصف النوع" }, { status: 400 });

  const month = b.expense_date.slice(0, 7);
  const budget = await ensureBudget(b.rep_id, month);
  const used = (await query<{ total: string }>("SELECT COALESCE(SUM(amount), 0) as total FROM promo_expenses WHERE rep_id=$1 AND month=$2", [b.rep_id, month])).rows[0];
  const usedAmount = Number(used?.total || 0);
  const remaining = budget.promo_budget - usedAmount;
  const overBudget = b.amount > remaining;

  if (overBudget && !b.override_reason?.trim()) {
    return NextResponse.json({ error: "تجاوز الحد المسموح — اكتب سبب التجاوز", over_budget: true, budget: budget.promo_budget, used: usedAmount, requested: b.amount }, { status: 400 });
  }

  const doctors = JSON.stringify((b.doctors || []).map(d => String(d).trim()).filter(Boolean).slice(0, 20));
  const r = await query<{ id: number }>(
    `INSERT INTO promo_expenses(rep_id, month, expense_date, promo_type, other_desc, amount, place, doctors, attendees, notes, over_budget, override_reason)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [b.rep_id, month, b.expense_date, b.promo_type, (b.other_desc || "").trim().slice(0, 200), Math.round(b.amount * 100) / 100, (b.place || "").trim().slice(0, 200), doctors, b.attendees || 0, (b.notes || "").trim().slice(0, 500), overBudget, overBudget ? b.override_reason!.trim().slice(0, 500) : null]);
  return NextResponse.json({ id: r.rows[0].id, over_budget: overBudget });
}
