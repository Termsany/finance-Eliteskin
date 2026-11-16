import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { pool, query } from "@/lib/db";
import { cleanOrder, allocate, orderAmount, type OffsetStatus } from "@/lib/offsets";
import { loadOrders } from "@/lib/offsets-data";

const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const bad = (m: string) => NextResponse.json({ error: m }, { status: 400 });
const D = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Create an offset order with its items. */
export async function POST(req: Request) {
  if (!(await getCurrentUser())) return forbid();
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const o = cleanOrder(b || {});
  if ("error" in o) return bad(o.error);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query<{ id: string }>(
      "INSERT INTO offset_orders(supplier, client, order_date, ref, note) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [o.supplier, o.client, o.order_date, o.ref, o.note]);
    const id = r.rows[0].id;
    for (let i = 0; i < o.items.length; i++) { const it = o.items[i];
      await client.query("INSERT INTO offset_order_items(order_id, line, item, product_id, qty, client_price, my_price) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id, i, it.item, it.product_id, it.qty, it.client_price, it.my_price]); }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, id: Number(id) });
  } catch (e) { await client.query("ROLLBACK"); return NextResponse.json({ error: String((e as Error).message || e) }, { status: 500 }); }
  finally { client.release(); }
}

/**
 * Move an order along, or edit it:
 *  { id, action:"collect", date }           printed → collected
 *  { id, action:"uncollect" }               collected → printed
 *  { id, action:"settle", date, amount }    → settled with the deducted amount
 *  { id, action:"unsettle" }                settled → collected
 *  { id, action:"close_short" | "reopen_short" }  close/reopen a short settlement
 *  { id, ...order fields }                   edit the order (only while not settled)
 */
export async function PATCH(req: Request) {
  if (!(await getCurrentUser())) return forbid();
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = Number(b?.id);
  if (!Number.isInteger(id) || id <= 0) return bad("أوردر غير صحيح");
  const action = b?.action ? String(b.action) : "";
  const cur = (await query<{ status: OffsetStatus }>("SELECT status FROM offset_orders WHERE id=$1", [id])).rows[0];
  if (!cur) return bad("الأوردر مش موجود");

  if (action === "collect") {
    const date = String(b?.date || ""); if (!D.test(date)) return bad("اختار تاريخ التحصيل");
    await query("UPDATE offset_orders SET status='collected', collected_at=$2, updated_at=now() WHERE id=$1", [id, date]);
    return NextResponse.json({ ok: true });
  }
  if (action === "uncollect") {
    await query("UPDATE offset_orders SET status='printed', collected_at=NULL, updated_at=now() WHERE id=$1 AND status='collected'", [id]);
    return NextResponse.json({ ok: true });
  }
  if (action === "settle") {
    const date = String(b?.date || ""); if (!D.test(date)) return bad("اختار تاريخ المقاصة");
    const amount = Number(b?.amount); if (!Number.isFinite(amount) || amount < 0 || amount > 1e9) return bad("اكتب المبلغ اللي اتخصم");
    await query("UPDATE offset_orders SET status='settled', settled_at=$2, settled_amount=$3, collected_at=COALESCE(collected_at,$2), short_closed=false, updated_at=now() WHERE id=$1",
      [id, date, Math.round(amount * 100) / 100]);
    return NextResponse.json({ ok: true });
  }
  if (action === "unsettle") {
    await query("UPDATE offset_orders SET status='collected', settled_at=NULL, settled_amount=NULL, short_closed=false, updated_at=now() WHERE id=$1 AND status='settled'", [id]);
    return NextResponse.json({ ok: true });
  }
  if (action === "close_short" || action === "reopen_short") {
    await query("UPDATE offset_orders SET short_closed=$2, updated_at=now() WHERE id=$1 AND status='settled'", [id, action === "close_short"]);
    return NextResponse.json({ ok: true });
  }

  // edit
  if (cur.status === "settled") return bad("الأوردر اتعملت له مقاصة، افتحها الأول قبل التعديل");
  const o = cleanOrder(b || {});
  if ("error" in o) return bad(o.error);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE offset_orders SET supplier=$2, client=$3, order_date=$4, ref=$5, note=$6, updated_at=now() WHERE id=$1",
      [id, o.supplier, o.client, o.order_date, o.ref, o.note]);
    await client.query("DELETE FROM offset_order_items WHERE order_id=$1", [id]);
    for (let i = 0; i < o.items.length; i++) { const it = o.items[i];
      await client.query("INSERT INTO offset_order_items(order_id, line, item, product_id, qty, client_price, my_price) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id, i, it.item, it.product_id, it.qty, it.client_price, it.my_price]); }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (e) { await client.query("ROLLBACK"); return NextResponse.json({ error: String((e as Error).message || e) }, { status: 500 }); }
  finally { client.release(); }
}

/** Settle several orders of one supplier at once with one deducted amount, split oldest first. */
export async function PUT(req: Request) {
  if (!(await getCurrentUser())) return forbid();
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const ids = Array.isArray(b?.ids) ? b!.ids.map(Number).filter(n => Number.isInteger(n) && n > 0) : [];
  const date = String(b?.date || ""); const amount = Number(b?.amount);
  if (!ids.length) return bad("اختار أوردر واحد على الأقل");
  if (!D.test(date)) return bad("اختار تاريخ المقاصة");
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e9) return bad("اكتب المبلغ اللي اتخصم");
  const all = await loadOrders();
  const picked = all.filter(o => ids.includes(o.id) && o.status !== "settled");
  if (!picked.length) return bad("الأوردرات اللي اخترتها اتعملت لها مقاصة بالفعل");
  const parts = allocate(picked.map(o => ({ id: o.id, order_date: o.order_date, amount: orderAmount(o) })), amount);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of parts) {
      const o = picked.find(x => x.id === p.id)!;
      await client.query("UPDATE offset_orders SET status='settled', settled_at=$2, settled_amount=$3, collected_at=COALESCE(collected_at,$2), short_closed=false, updated_at=now() WHERE id=$1",
        [p.id, date, p.amount]);
      void o;
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, settled: parts.length });
  } catch (e) { await client.query("ROLLBACK"); return NextResponse.json({ error: String((e as Error).message || e) }, { status: 500 }); }
  finally { client.release(); }
}

export async function DELETE(req: Request) {
  if (!(await getCurrentUser())) return forbid();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return bad("أوردر غير صحيح");
  await query("DELETE FROM offset_orders WHERE id=$1", [id]);
  return NextResponse.json({ ok: true });
}
