import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/finance";
import { summarize } from "@/lib/offsets";
import { loadOrders, loadPrices } from "@/lib/offsets-data";

/** Everything the offsets tab shows: every order with amounts and age, per-supplier totals, agreed prices,
 *  and name lists for the form's autocomplete. Offset customers are often NOT coded in Daftra (the supplier
 *  invoices them directly), so the suggestions also include every name already used in an offset order or price,
 *  and the client field stays free text — you can type any name. */
export async function GET() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const today = riyadhToday();
  const [orders, prices, sup, cli, prod] = await Promise.all([
    loadOrders(), loadPrices(),
    query<{ name: string }>("SELECT DISTINCT supplier_name AS name FROM daftra_purchases WHERE supplier_name<>'' ORDER BY 1"),
    query<{ name: string }>("SELECT DISTINCT client_name AS name FROM daftra_invoices WHERE client_name<>'' ORDER BY 1"),
    query<{ id: string; name: string }>("SELECT id, name FROM daftra_products WHERE active ORDER BY name"),
  ]);
  // merge Daftra names with names already used in offsets, so a customer that isn't in Daftra still autocompletes next time
  const uniq = (a: string[]) => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y, "ar"));
  const suppliers_list = uniq([...sup.rows.map(r => r.name), ...orders.map(o => o.supplier), ...prices.map(p => p.supplier)]);
  const clients_list = uniq([...cli.rows.map(r => r.name), ...orders.map(o => o.client), ...prices.map(p => p.client)]);
  return NextResponse.json({
    today, ...summarize(orders, today), prices, suppliers_list, clients_list,
    products: prod.rows.map(r => ({ id: Number(r.id), name: r.name })),
  });
}
