import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { cleanExpense } from "@/lib/app-expenses";

const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
const COLS = `id, name, cat, amount::float8, type, start, "end", stop, date::text, note`;

/** The expenses kept in this app (rent, salaries, … that aren't recorded in Daftra). */
export async function GET() {
  if (!(await getCurrentUser())) return forbid();
  const r = await query(`SELECT ${COLS} FROM app_expenses ORDER BY (type='once'), amount DESC, id`);
  return NextResponse.json({ expenses: r.rows.map(e => ({ ...e, id: Number(e.id) })) });
}

export async function POST(req: Request) {
  if (!(await getCurrentUser())) return forbid();
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const e = cleanExpense(b || {});
  if ("error" in e) return NextResponse.json({ error: e.error }, { status: 400 });
  const r = await query(`INSERT INTO app_expenses(name, cat, amount, type, start, "end", date, note) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${COLS}`,
    [e.name, e.cat, e.amount, e.type, e.start, e.end, e.date, e.note]);
  return NextResponse.json({ expense: r.rows[0] });
}

/** { id, stop: "YYYY-MM" } stops a fixed expense from that month (null restarts it); { id, ...fields } edits it. */
export async function PATCH(req: Request) {
  if (!(await getCurrentUser())) return forbid();
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = Number(b?.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "بند غير صحيح" }, { status: 400 });
  if (b && "stop" in b && Object.keys(b).length === 2) {
    const stop = b.stop === null ? null : String(b.stop);
    if (stop !== null && !/^20\d\d-(0[1-9]|1[0-2])$/.test(stop)) return NextResponse.json({ error: "شهر غير صحيح" }, { status: 400 });
    await query("UPDATE app_expenses SET stop=$2, updated_at=now() WHERE id=$1 AND type='fixed'", [id, stop]);
    return NextResponse.json({ ok: true });
  }
  const e = cleanExpense(b || {});
  if ("error" in e) return NextResponse.json({ error: e.error }, { status: 400 });
  await query(`UPDATE app_expenses SET name=$2, cat=$3, amount=$4, type=$5, start=$6, "end"=$7, date=$8, note=$9, stop=CASE WHEN $5='fixed' THEN stop END, updated_at=now() WHERE id=$1`,
    [id, e.name, e.cat, e.amount, e.type, e.start, e.end, e.date, e.note]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await getCurrentUser())) return forbid();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "بند غير صحيح" }, { status: 400 });
  await query("DELETE FROM app_expenses WHERE id=$1", [id]);
  return NextResponse.json({ ok: true });
}
