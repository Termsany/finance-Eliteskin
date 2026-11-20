import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const { id } = await params;
  const repId = Number(id);
  if (!Number.isFinite(repId)) return NextResponse.json({ error: "معرف غير صحيح" }, { status: 400 });
  const b = await req.json().catch(() => null) as { name?: string; product_id?: number | null; active?: boolean; sample_pct?: number | null; promo_pct?: number | null } | null;
  if (!b) return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });

  const sets: string[] = [], vals: unknown[] = [];
  let i = 1;
  if (b.name !== undefined) { sets.push(`name=$${i++}`); vals.push(String(b.name).trim().slice(0, 100)); }
  if (b.product_id !== undefined) { sets.push(`product_id=$${i++}`); vals.push(b.product_id && Number.isFinite(Number(b.product_id)) ? Number(b.product_id) : null); }
  if (b.active !== undefined) { sets.push(`active=$${i++}`); vals.push(!!b.active); }
  if (b.sample_pct !== undefined) {
    const v = b.sample_pct !== null && Number.isFinite(Number(b.sample_pct)) && Number(b.sample_pct) >= 0 && Number(b.sample_pct) <= 100 ? Number(b.sample_pct) : null;
    sets.push(`sample_pct=$${i++}`); vals.push(v);
  }
  if (b.promo_pct !== undefined) {
    const v = b.promo_pct !== null && Number.isFinite(Number(b.promo_pct)) && Number(b.promo_pct) >= 0 && Number(b.promo_pct) <= 100 ? Number(b.promo_pct) : null;
    sets.push(`promo_pct=$${i++}`); vals.push(v);
  }
  if (!sets.length) return NextResponse.json({ error: "لا توجد تعديلات" }, { status: 400 });
  vals.push(repId);
  await query(`UPDATE reps SET ${sets.join(", ")} WHERE id=$${i}`, vals);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const { id } = await params;
  await query("DELETE FROM reps WHERE id=$1", [Number(id)]);
  return NextResponse.json({ ok: true });
}
