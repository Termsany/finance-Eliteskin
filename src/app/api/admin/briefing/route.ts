import { NextResponse } from "next/server";
import { addDays } from "@/lib/fmt";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { attention } from "@/lib/fin-books";
import { collectionPlan, receivedIn } from "@/lib/collections";
import { buildBriefing, type BriefingInput } from "@/lib/briefing";


/** Builds today's briefing snapshot from the live finance picture. Exported so the daily webhook push reuses it. */
export async function buildTodayBriefing() {
  const today = riyadhToday();
  const inp = await loadInput(today);
  const fin = computeFinance(inp, `${today.slice(0, 7)}-01`, today);
  const cm = today.slice(0, 7);
  const cp = collectionPlan(fin.ar.open, cm, today);
  const due_today = fin.ar.open.filter(o => o.due === today).reduce((s, o) => s + o.unpaid, 0);
  const week = addDays(today, 7);
  const ap_week = fin.ap.open.filter(o => o.due <= week).reduce((s, o) => s + o.unpaid, 0);
  const todo = attention({ ar: fin.ar, ap: fin.ap, monthly: fin.monthly as Array<{ m: string; opex: number; sales: number; cogs: number }>, price_guard: fin.price_guard, stock_alerts: fin.stock_alerts, cost_coverage: fin.kpi.cost_coverage, today });
  const promises = (await query<{ customer: string; promise_amount: number | null }>(
    "SELECT customer, promise_amount::float8 FROM collection_followups WHERE status='open' AND promise_date IS NOT NULL AND promise_date <= $1 ORDER BY promise_date", [today]).catch(() => ({ rows: [] }))).rows;
  const bal = (await query<{ cash_balance: number | null }>("SELECT cash_balance::float8 FROM fin_settings WHERE id=1").catch(() => ({ rows: [] }))).rows[0];
  const snap: BriefingInput = {
    today,
    collected_yesterday: receivedIn(inp.payments, addDays(today, -1), addDays(today, -1)),
    collected_month: receivedIn(inp.payments, `${cm}-01`, today),
    due_today, overdue: cp.totals.overdue, overdue_parties: cp.totals.overdue_parties,
    ar_total: fin.ar.total, ap_week,
    balance: bal?.cash_balance ?? null,
    net_month: fin.kpi.net, sales_month: fin.kpi.sales,
    due_promises: promises.map(p => ({ customer: p.customer, amount: p.promise_amount })),
    urgent: todo.slice(0, 3).map(t => ({ title: t.title })),
  };
  return buildBriefing(snap);
}

export async function GET(req: Request) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (new URL(req.url).searchParams.get("config") === "1") {
    const { getSetting } = await import("@/lib/settings");
    const [webhook, hour, last, login] = await Promise.all([getSetting("briefing_webhook"), getSetting("briefing_hour"), getSetting("briefing_last_sent"), getSetting("last_login")]);
    return NextResponse.json({ webhook: webhook || "", hour: hour ? Number(hour) : 8, last_sent: last || null, last_login: login ? login.split("|")[0].slice(0, 16).replace("T", " ") : null });
  }
  return NextResponse.json(await buildTodayBriefing());
}

/** Save the briefing webhook and hour. */
export async function PUT(req: Request) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { setSetting } = await import("@/lib/settings");
  const b = await req.json().catch(() => null) as { webhook?: unknown; hour?: unknown } | null;
  if (b && "webhook" in b) {
    const w = String(b.webhook || "").trim();
    if (w && !/^https:\/\/.+/.test(w)) return NextResponse.json({ error: "الرابط لازم يبدأ بـ https://" }, { status: 400 });
    await setSetting("briefing_webhook", w || null);
    if (!w) await setSetting("briefing_last_sent", null);
  }
  if (b && "hour" in b) { const h = Number(b.hour); if (!(h >= 0 && h <= 23)) return NextResponse.json({ error: "ساعة غير صحيحة" }, { status: 400 }); await setSetting("briefing_hour", String(Math.floor(h))); }
  return NextResponse.json({ ok: true });
}

/** Send the briefing to the webhook right now (test / on-demand). */
export async function POST() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { getSetting } = await import("@/lib/settings");
  const url = (await getSetting("briefing_webhook"))?.trim();
  if (!url) return NextResponse.json({ error: "محطّش رابط للتقرير الصباحي" }, { status: 400 });
  const b = await buildTodayBriefing();
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: b.text, content: b.text, title: b.title }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) return NextResponse.json({ error: `الخادم ردّ بخطأ ${r.status}` }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "تعذر الوصول للرابط" }, { status: 502 }); }
}
