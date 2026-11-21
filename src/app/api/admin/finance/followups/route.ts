import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/finance";
import { fetchFieldData } from "@/lib/field-data";

const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const bad = (m: string) => NextResponse.json({ error: m }, { status: 400 });
const D = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const COLS = "id, customer, note, promise_date::text, promise_amount::float8, status, created_at::text";

/** GET ?customer=… one customer's log, or ?promises=1 for all open promises (soonest first). */
export async function GET(req: Request) {
  if (!(await getCurrentUser())) return forbid();
  const sp = new URL(req.url).searchParams;
  const customer = (sp.get("customer") || "").trim();
  if (sp.get("promises") === "1") {
    const today = riyadhToday();
    const [r, field] = await Promise.all([
      query(`SELECT ${COLS} FROM collection_followups WHERE status='open' AND promise_date IS NOT NULL ORDER BY promise_date`),
      fetchFieldData(),
    ]);
    type PromiseRow = { id: number; customer: string; note: string; promise_date: string | null; promise_amount: number | null; status: string; created_at: string; overdue: boolean; source: "owner" | "rep"; rep_name?: string };
    const rows: PromiseRow[] = (r.rows as Array<{ id: string; customer: string; note: string; promise_date: string; promise_amount: number | null; status: string; created_at: string }>).map(f => ({ ...f, id: Number(f.id), overdue: f.promise_date < today, source: "owner" as const }));
    const repFollowups: PromiseRow[] = (field?.followups || [])
      .filter(f => f.result === "promised" && f.promise_date)
      .map((f, i) => ({
        id: -(i + 1), customer: `عميل #${f.client_id}`, note: f.note || `${f.rep_name}: وعد بالدفع`,
        promise_date: f.promise_date, promise_amount: f.promise_amount, status: "open",
        created_at: f.created_at, overdue: String(f.promise_date) < today,
        source: "rep" as const, rep_name: f.rep_name,
      }));
    const all = [...rows, ...repFollowups].sort((a, b) => String(a.promise_date).localeCompare(String(b.promise_date)));
    return NextResponse.json({ today, promises: all });
  }
  if (!customer) return bad("اختار العميل");
  const r = await query(`SELECT ${COLS} FROM collection_followups WHERE customer=$1 ORDER BY created_at DESC`, [customer]);
  return NextResponse.json({ followups: r.rows.map(f => ({ ...f, id: Number(f.id) })) });
}

/** Add a note or a payment promise. */
export async function POST(req: Request) {
  const u = await getCurrentUser(); if (!u) return forbid();
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const customer = String(b?.customer || "").trim().slice(0, 200);
  const note = String(b?.note || "").trim().slice(0, 1000);
  if (!customer) return bad("اختار العميل");
  let promise_date: string | null = null, promise_amount: number | null = null;
  if (b?.promise_date) { const d = String(b.promise_date); if (!D.test(d)) return bad("تاريخ الوعد غير صحيح"); promise_date = d;
    const a = Number(b.promise_amount); promise_amount = Number.isFinite(a) && a > 0 ? Math.round(a * 100) / 100 : null; }
  if (!note && !promise_date) return bad("اكتب ملاحظة أو حدّد وعد بالدفع");
  const r = await query(`INSERT INTO collection_followups(customer, note, promise_date, promise_amount, created_by) VALUES($1,$2,$3,$4,$5) RETURNING ${COLS}`,
    [customer, note, promise_date, promise_amount, u.id]);
  return NextResponse.json({ followup: { ...r.rows[0], id: Number(r.rows[0].id) } });
}

/** { id, status: 'kept'|'broken'|'open' } marks a promise. */
export async function PATCH(req: Request) {
  if (!(await getCurrentUser())) return forbid();
  const b = await req.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
  const id = Number(b?.id), status = String(b?.status || "");
  if (!Number.isInteger(id) || id <= 0) return bad("سطر غير صحيح");
  if (!["open", "kept", "broken"].includes(status)) return bad("حالة غير صحيحة");
  await query("UPDATE collection_followups SET status=$2, updated_at=now() WHERE id=$1", [id, status]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await getCurrentUser())) return forbid();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return bad("سطر غير صحيح");
  await query("DELETE FROM collection_followups WHERE id=$1", [id]);
  return NextResponse.json({ ok: true });
}
