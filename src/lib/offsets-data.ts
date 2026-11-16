import { query } from "@/lib/db";
import type { OffsetOrder, OffsetPrice } from "@/lib/offsets";

/** Loads every offset order with its items (newest first). */
export async function loadOrders(): Promise<OffsetOrder[]> {
  const o = await query<{ id: string; supplier: string; client: string; order_date: string; ref: string; status: OffsetOrder["status"];
    collected_at: string | null; settled_at: string | null; settled_amount: number | null; short_closed: boolean; note: string }>(
    `SELECT id, supplier, client, order_date::text, ref, status, collected_at::text, settled_at::text, settled_amount::float8, short_closed, note
     FROM offset_orders ORDER BY order_date DESC, id DESC`);
  if (!o.rows.length) return [];
  const it = await query<{ order_id: string; item: string; product_id: string | null; qty: number; client_price: number; my_price: number }>(
    `SELECT order_id, item, product_id, qty::float8, client_price::float8, my_price::float8 FROM offset_order_items ORDER BY order_id, line`);
  const byOrder = new Map<string, OffsetOrder["items"]>();
  for (const r of it.rows) {
    const arr = byOrder.get(r.order_id) || []; arr.push({ item: r.item, product_id: r.product_id ? Number(r.product_id) : null, qty: r.qty, client_price: r.client_price, my_price: r.my_price });
    byOrder.set(r.order_id, arr);
  }
  return o.rows.map(r => ({ ...r, id: Number(r.id), items: byOrder.get(r.id) || [] }));
}

export async function loadPrices(): Promise<OffsetPrice[]> {
  const r = await query<{ id: string; supplier: string; client: string; item: string; product_id: string | null; client_price: number; my_price: number }>(
    `SELECT id, supplier, client, item, product_id, client_price::float8, my_price::float8 FROM offset_prices ORDER BY supplier, client, item`);
  return r.rows.map(p => ({ ...p, id: Number(p.id), product_id: p.product_id ? Number(p.product_id) : null }));
}
