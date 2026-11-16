import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { loadPrices } from "@/lib/offsets-data";

const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const bad = (m: string) => NextResponse.json({ error: m }, { status: 400 });
const txt = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const money = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : NaN; };

export async function GET() {
  if (!(await getCurrentUser())) return forbid();
  return NextResponse.json({ prices: await loadPrices() });
}

/** Save an agreed price (unique per supplier+client+item; client "" = all customers). Upserts. */
export async function POST(req: Request) {
  if (!(await getCurrentUser())) return forbid();
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const supplier = txt(b?.supplier, 160), client = txt(b?.client, 160), item = txt(b?.item, 200);
  const cp = money(b?.client_price), mp = money(b?.my_price);
  const pid = Number(b?.product_id);
  if (!supplier) return bad("اختار المورد");
  if (!item) return bad("اكتب اسم الصنف");
  if (Number.isNaN(cp) || Number.isNaN(mp)) return bad("اكتب سعر العميل وسعرك");
  const r = await query<{ id: string }>(
    `INSERT INTO offset_prices(supplier, client, item, product_id, client_price, my_price) VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT (supplier, client, item) DO UPDATE SET client_price=EXCLUDED.client_price, my_price=EXCLUDED.my_price, product_id=EXCLUDED.product_id, updated_at=now()
     RETURNING id`, [supplier, client, item, Number.isInteger(pid) && pid > 0 ? pid : null, cp, mp]);
  return NextResponse.json({ ok: true, id: Number(r.rows[0].id) });
}

export async function DELETE(req: Request) {
  if (!(await getCurrentUser())) return forbid();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return bad("سطر غير صحيح");
  await query("DELETE FROM offset_prices WHERE id=$1", [id]);
  return NextResponse.json({ ok: true });
}
