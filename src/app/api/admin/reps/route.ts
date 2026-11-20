import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET() {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const reps = await query<{ id: number; name: string; product_id: string | null; product_name: string | null; active: boolean; sample_pct: string | null; promo_pct: string | null }>(
    `SELECT r.id, r.name, r.product_id::text, p.name as product_name, r.active, r.sample_pct::text, r.promo_pct::text
     FROM reps r LEFT JOIN daftra_products p ON p.id = r.product_id ORDER BY r.active DESC, r.name`);
  const products = await query<{ id: string; name: string; average_cost: string }>("SELECT id::text, name, average_cost::text FROM daftra_products WHERE active ORDER BY name");
  return NextResponse.json({
    reps: reps.rows.map(r => ({ ...r, product_id: r.product_id ? Number(r.product_id) : null, sample_pct: r.sample_pct ? Number(r.sample_pct) : null, promo_pct: r.promo_pct ? Number(r.promo_pct) : null })),
    products: products.rows.map(p => ({ id: Number(p.id), name: p.name, average_cost: Number(p.average_cost) })),
  });
}

export async function POST(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const b = await req.json().catch(() => null) as { name?: string; product_id?: number; sample_pct?: number | null; promo_pct?: number | null } | null;
  if (!b?.name?.trim()) return NextResponse.json({ error: "اسم المندوب مطلوب" }, { status: 400 });
  const name = b.name.trim().slice(0, 100);
  const productId = b.product_id && Number.isFinite(Number(b.product_id)) ? Number(b.product_id) : null;
  const sPct = b.sample_pct !== undefined && b.sample_pct !== null && Number.isFinite(Number(b.sample_pct)) && Number(b.sample_pct) >= 0 && Number(b.sample_pct) <= 100 ? Number(b.sample_pct) : null;
  const pPct = b.promo_pct !== undefined && b.promo_pct !== null && Number.isFinite(Number(b.promo_pct)) && Number(b.promo_pct) >= 0 && Number(b.promo_pct) <= 100 ? Number(b.promo_pct) : null;
  const r = await query<{ id: number }>("INSERT INTO reps(name, product_id, sample_pct, promo_pct) VALUES($1,$2,$3,$4) RETURNING id", [name, productId, sPct, pPct]);
  return NextResponse.json({ id: r.rows[0].id });
}
