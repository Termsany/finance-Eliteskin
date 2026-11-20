import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { debugClient } from "@/lib/daftra";

/** Downloads what Daftra itself returns for one customer (raw), to compare with its account statement. */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin" || u.manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const name = (new URL(req.url).searchParams.get("name") || "").trim().slice(0, 300);
  const ids = (await query<{ client_id: string }>("SELECT DISTINCT client_id FROM daftra_invoices WHERE client_name=$1 AND client_id IS NOT NULL", [name])).rows.map(r => Number(r.client_id));
  if (!ids.length) return NextResponse.json({ error: "العميل مش موجود في الفواتير" }, { status: 404 });
  const data = await debugClient(ids).catch(e => ({ error: String((e as Error).message) }));
  return new NextResponse(JSON.stringify({ name, ids, ...data }, null, 2), { headers: {
    "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="daftra-client-${ids[0]}.json"`, "cache-control": "no-store" } });
}
