import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { reconcile } from "@/lib/reconcile";

/** One customer's reconciliation with Daftra (GET ?name=…), plus what the last sync received overall. */
export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin" || u.manager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const name = (new URL(req.url).searchParams.get("name") || "").trim().slice(0, 300);
  if (!name) return NextResponse.json({ error: "اختار العميل" }, { status: 400 });
  const inv = (await query<{ id: string; no: string; date: string; total: number; refund: number; unpaid: number; status: number; client_id: string | null }>(
    "SELECT id, no, invoice_date::text date, total::float8, refund::float8, unpaid::float8, payment_status status, client_id FROM daftra_invoices WHERE client_name=$1", [name])).rows;
  const ids = [...new Set(inv.map(i => i.client_id).filter(Boolean))].map(Number);
  const pays = ids.length ? (await query<{ id: string; date: string; amount: number; invoice_id: string | null; status: string; method: string }>(
    "SELECT id, pay_date::text date, amount::float8, invoice_id, '1' status, method FROM daftra_payments_all WHERE client_id = ANY($1::bigint[]) UNION ALL SELECT id, pay_date::text, amount::float8, invoice_id, status, method FROM daftra_client_payments WHERE client_id = ANY($1::bigint[]) AND status <> '1' ORDER BY 2, 1", [ids]).catch(() => ({ rows: [] }))).rows : [];
  const others = (await query<{ id: string; no: string; date: string | null; type: string; total: number; draft: boolean }>(
    "SELECT id, no, doc_date::text date, type, total::float8, draft FROM daftra_other_docs WHERE kind='sale' AND (party_id = ANY($1::bigint[]) OR party_name=$2) ORDER BY doc_date, id", [ids, name]).catch(() => ({ rows: [] }))).rows;
  const sync = await getSetting("sync_diag");
  return NextResponse.json({ name, client_ids: ids,
    ...reconcile(inv.map(i => ({ ...i, id: Number(i.id) })), pays.map(p => ({ ...p, id: Number(p.id), invoice_id: p.invoice_id ? Number(p.invoice_id) : null })), others.map(o => ({ ...o, id: Number(o.id) }))),
    other_docs: others, sync: sync ? JSON.parse(sync) : null });
}
