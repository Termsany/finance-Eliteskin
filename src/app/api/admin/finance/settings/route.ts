import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

const DAY = /^20\d\d-\d\d-\d\d$/;
const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const admin = async () => { const u = await getCurrentUser(); return u && u.role === "admin" && !u.manager ? u : null; };

export async function GET() {
  if (!(await admin())) return forbid();
  const r = await query("SELECT target_gross_margin::float8, target_net_margin::float8, books_start::text, cash_balance::float8, cash_as_of::text, monthly_sales_target::float8, monthly_profit_target::float8, sample_pct::float8, promo_pct::float8 FROM fin_settings WHERE id=1");
  return NextResponse.json(r.rows[0] || {});
}

/** Any of: target margins (both together), books start (a date, or null for "count everything"). */
export async function PUT(req: Request) {
  const u = await admin(); if (!u) return forbid();
  const b = await req.json().catch(() => null) as { target_gross_margin?: unknown; target_net_margin?: unknown; books_start?: unknown; monthly_sales_target?: unknown; monthly_profit_target?: unknown; sample_pct?: unknown; promo_pct?: unknown } | null;
  if (!b) return NextResponse.json({ error: "طلب غير صحيح" }, { status: 400 });
  if (b.monthly_sales_target !== undefined || b.monthly_profit_target !== undefined) {
    const parse = (v: unknown) => { if (v === null || v === "") return null; const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : NaN; };
    const st = parse(b.monthly_sales_target), pt = parse(b.monthly_profit_target);
    if (Number.isNaN(st) || Number.isNaN(pt)) return NextResponse.json({ error: "اكتب أرقام صحيحة للأهداف" }, { status: 400 });
    await query("UPDATE fin_settings SET monthly_sales_target=$1, monthly_profit_target=$2, updated_at=now() WHERE id=1", [st, pt]);
  }
  if (b.target_gross_margin !== undefined || b.target_net_margin !== undefined) {
    const g = Number(b.target_gross_margin), n = Number(b.target_net_margin);
    if (!(g >= 5 && g <= 90) || !(n >= 0 && n <= 60) || n >= g) return NextResponse.json({ error: "قيم غير منطقية (صافي الربح لازم يكون أقل من مجمل الربح)" }, { status: 400 });
    await query("UPDATE fin_settings SET target_gross_margin=$1, target_net_margin=$2, updated_at=now() WHERE id=1", [g, n]);
  }
  if (b.books_start !== undefined) {
    const v = b.books_start === null || b.books_start === "" ? null : String(b.books_start);
    if (v !== null && !DAY.test(v)) return NextResponse.json({ error: "تاريخ غير صحيح" }, { status: 400 });
    await query("UPDATE fin_settings SET books_start=$1, updated_at=now() WHERE id=1", [v]);
    await query("INSERT INTO audit_logs(actor_id, action, entity, entity_id) VALUES($1,'books_start_change','fin_settings',$1)", [u.id]).catch(() => {});
  }
  if (b.sample_pct !== undefined || b.promo_pct !== undefined) {
    const sp = b.sample_pct !== undefined ? Number(b.sample_pct) : NaN;
    const pp = b.promo_pct !== undefined ? Number(b.promo_pct) : NaN;
    if (b.sample_pct !== undefined && (!(sp >= 0 && sp <= 100))) return NextResponse.json({ error: "نسبة العينات لازم تكون بين 0 و 100" }, { status: 400 });
    if (b.promo_pct !== undefined && (!(pp >= 0 && pp <= 100))) return NextResponse.json({ error: "نسبة الدعاية لازم تكون بين 0 و 100" }, { status: 400 });
    if (b.sample_pct !== undefined) await query("UPDATE fin_settings SET sample_pct=$1, updated_at=now() WHERE id=1", [sp]);
    if (b.promo_pct !== undefined) await query("UPDATE fin_settings SET promo_pct=$1, updated_at=now() WHERE id=1", [pp]);
  }
  return NextResponse.json({ ok: true });
}
