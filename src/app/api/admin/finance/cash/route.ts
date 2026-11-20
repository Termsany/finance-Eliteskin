import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { cashForecast, type VatFiling } from "@/lib/fin-cash";
import { openBySupplier } from "@/lib/offsets";
import { loadOrders } from "@/lib/offsets-data";
import { rateCustomer } from "@/lib/fin-rating";

const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const today = riyadhToday(); const inp = await loadInput(today);
  const fin = computeFinance(inp, `${today.slice(0, 7)}-01`, today);
  const s = (await query<{ cash_balance: number | null; cash_as_of: string | null; vat_filing: string; cash_collect_pct: number }>(
    "SELECT cash_balance::float8, cash_as_of::text, vat_filing, cash_collect_pct FROM fin_settings WHERE id=1"
  )).rows[0];
  const url = new URL(req.url);
  const includeNew = url.searchParams.get("new") === "1";
  const offsets = openBySupplier(await loadOrders().catch(() => []));

  // Per-customer avg payment days from rating (use invoice_payments for linked matches)
  const customerAvgDays: Record<string, number> = {};
  const salesByParty = new Map<string, typeof inp.sales>();
  const idToName = new Map<number, string>();
  for (const d of inp.sales) {
    const arr = salesByParty.get(d.party) || []; arr.push(d); salesByParty.set(d.party, arr);
    if (d.party_id != null) idToName.set(Number(d.party_id), d.party);
  }
  const invPayRows = (await query<{ invoice_id: string; pay_date: string; amount: string }>(
    "SELECT invoice_id, pay_date::text, amount::float8 FROM daftra_invoice_payments"
  ).catch(() => ({ rows: [] }))).rows;
  const paysByParty = new Map<string, Array<{ date: string; amount: number; invoice_id: number | null }>>();
  for (const ip of invPayRows) {
    const inv = inp.sales.find(s => s.id === Number(ip.invoice_id));
    if (inv) {
      const arr = paysByParty.get(inv.party) || []; arr.push({ date: ip.pay_date, amount: Number(ip.amount), invoice_id: Number(ip.invoice_id) }); paysByParty.set(inv.party, arr);
    }
  }
  for (const p of inp.payments) {
    if (p.client_id == null) continue;
    const name = idToName.get(Number(p.client_id));
    if (name) { const arr = paysByParty.get(name) || []; arr.push({ date: p.date, amount: p.amount, invoice_id: null }); paysByParty.set(name, arr); }
  }
  for (const p of fin.ar.parties) {
    const docs = (salesByParty.get(p.name) || []).map(d => ({ id: d.id, date: d.date, total: d.total }));
    const pays = paysByParty.get(p.name) || [];
    const rating = rateCustomer(docs, pays);
    if (rating.avg_days !== null) customerAvgDays[p.name] = rating.avg_days;
  }

  // App expenses (temp/once) for dated placement
  const appExpRows = (await query<{ id: number; name: string; cat: string; amount: number; type: string; start: string | null; end: string | null; stop: string | null; date: string | null; note: string }>(
    "SELECT id, name, cat, amount::float8, type, start, \"end\", stop, date::text, note FROM app_expenses WHERE type IN ('temp','once') ORDER BY amount DESC"
  ).catch(() => ({ rows: [] }))).rows;

  const vatFiling = (s?.vat_filing === "monthly" ? "monthly" : "quarterly") as VatFiling;
  const collectPct = s?.cash_collect_pct ?? 90;

  // VAT: extrapolate the partial month to a full filing period
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  const monthlyVat = dayOfMonth > 0 ? fin.kpi.vat_payable / dayOfMonth * daysInMonth : 0;
  const vatPeriodEstimate = Math.round(monthlyVat * (vatFiling === "quarterly" ? 3 : 1));

  // Balance log for forecast accuracy
  const balanceLog = (await query<{ week_start: string; actual: number; forecast: number | null }>(
    "SELECT week_start::text, actual::float8, forecast::float8 FROM cash_balance_log ORDER BY week_start DESC LIMIT 13"
  ).catch(() => ({ rows: [] }))).rows;

  const forecast = cashForecast(fin, inp, s?.cash_balance ?? 0, {
    includeNew, offsets, collectPct, vatFiling,
    vatPeriod: vatPeriodEstimate,
    cogsRatio: fin.baseline && fin.baseline.sales > 0 ? fin.baseline.cogs / fin.baseline.sales : undefined,
    customerAvgDays,
    appExpenses: appExpRows as Array<{ id: number; name: string; cat: string; amount: number; type: "fixed" | "temp" | "once"; start: string | null; end: string | null; stop: string | null; date: string | null; note: string }>,
  });

  return NextResponse.json({
    today,
    cash_balance: s?.cash_balance ?? null,
    cash_as_of: s?.cash_as_of ?? null,
    vat_period: vatPeriodEstimate,
    vat_filing: vatFiling,
    collect_pct: collectPct,
    balance_log: balanceLog,
    forecast,
  });
}

/** Opening cash (bank + treasury) entered by the admin — Daftra balances aren't mirrored. */
export async function PUT(req: Request) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;

  // Save cash balance
  if (b?.cash_balance !== undefined) {
    const v = Number(b.cash_balance);
    if (!Number.isFinite(v) || Math.abs(v) > 1e10) return NextResponse.json({ error: "اكتب رصيد صحيح" }, { status: 400 });
    await query("UPDATE fin_settings SET cash_balance=$1, cash_as_of=(now() AT TIME ZONE 'Asia/Riyadh')::date, updated_at=now() WHERE id=1", [v]);

    // Log this week's balance + snapshot the forecast for accuracy tracking
    const today2 = riyadhToday();
    const dow = new Date(Date.parse(`${today2}T00:00:00Z`)).getUTCDay();
    const weekStart = new Date(Date.parse(`${today2}T00:00:00Z`) - dow * 864e5).toISOString().slice(0, 10);
    // Compute a quick forecast to snapshot
    let forecastBal: number | null = null;
    try {
      const inp2 = await loadInput(today2);
      const fin2 = computeFinance(inp2, `${today2.slice(0, 7)}-01`, today2);
      const fc = cashForecast(fin2, inp2, v, { includeNew: false });
      const nextWeek = fc.rows.find(r => r.i === 1);
      forecastBal = nextWeek ? nextWeek.balance : null;
    } catch { /* skip forecast if it fails */ }
    await query(
      "INSERT INTO cash_balance_log(week_start, actual, forecast) VALUES($1, $2, $3) ON CONFLICT(week_start) DO UPDATE SET actual=$2, forecast=COALESCE($3, cash_balance_log.forecast), logged_at=now()",
      [weekStart, v, forecastBal]
    ).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  // Save settings (VAT filing, collection %)
  if (b?.vat_filing !== undefined || b?.collect_pct !== undefined) {
    const updates: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (b.vat_filing && (b.vat_filing === "monthly" || b.vat_filing === "quarterly")) {
      updates.push(`vat_filing=$${i++}`);
      vals.push(b.vat_filing);
    }
    if (b.collect_pct !== undefined) {
      const pct = Math.round(Number(b.collect_pct));
      if (pct >= 10 && pct <= 100) {
        updates.push(`cash_collect_pct=$${i++}`);
        vals.push(pct);
      }
    }
    if (updates.length) {
      await query(`UPDATE fin_settings SET ${updates.join(", ")}, updated_at=now() WHERE id=1`, vals);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
}
