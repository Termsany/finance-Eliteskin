import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/finance";
import { summarize } from "@/lib/offsets";
import { loadOrders, loadPrices } from "@/lib/offsets-data";

/** Everything the offsets tab shows: every order with amounts and age, per-supplier totals, agreed prices,
 *  and name lists from Daftra for the form's autocomplete. */
export async function GET() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const today = riyadhToday();
  const [orders, prices, sup, cli, prod] = await Promise.all([
    loadOrders(), loadPrices(),
    query<{ name: string }>("SELECT DISTINCT supplier_name AS name FROM daftra_purchases WHERE supplier_name<>'' ORDER BY 1"),
    query<{ name: string }>("SELECT DISTINCT client_name AS name FROM daftra_invoices WHERE client_name<>'' ORDER BY 1"),
    query<{ id: string; name: string }>("SELECT id, name FROM daftra_products WHERE active ORDER BY name"),
  ]);
  return NextResponse.json({
    today, ...summarize(orders, today), prices,
    suppliers_list: sup.rows.map(r => r.name), clients_list: cli.rows.map(r => r.name),
    products: prod.rows.map(r => ({ id: Number(r.id), name: r.name })),
  });
}
