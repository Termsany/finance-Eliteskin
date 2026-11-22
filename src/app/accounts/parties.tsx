"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import type { AccData, Open } from "./AccountsHub";
import type { StLine } from "@/lib/fin-books";
import { sar, num, Card, ExcelBtn, Table, AGE, Bars, C } from "./kit";
import { Tile } from "./summary";

export type PartyKind = "client" | "supplier";

/** Customers (receivables) or suppliers (payables): aging, balances, and the statement on click. */
export function Parties({ d, kind, open, x }: { d: AccData; kind: PartyKind; open: Open; x: (s: string) => string }) {
  const b = kind === "client" ? d.ar : d.ap;
  const [bk, setBk] = useState<string | null>(null);
  const [byProfit, setByProfit] = useState(false);
  const old = (b.buckets["61-90"] || 0) + (b.buckets["90+"] || 0);
  const week = new Date(Date.parse(`${d.today}T00:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10);
  const dueWeek = b.open.filter(o => o.due <= week).reduce((s, o) => s + o.unpaid, 0);
  const rows = (bk ? b.parties.filter(p => p.b[bk] > 0) : b.parties) as Array<(typeof b.parties)[number] & Record<string, unknown>>;
  const isC = kind === "client";
  const off = !isC && d.offsets && d.offsets.open > 0 ? d.offsets : null;
  return <div className="space-y-4">
    {off && <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] ring-1 ring-emerald-200">
      <span className="font-bold text-emerald-900">فروق أسعار ليك عند الموردين (مقاصة): <b className="tabular-nums">{sar(off.open)}</b></span>
      <span className="text-emerald-800">الصافي اللي هتدفعه فعلاً: <b className="tabular-nums">{sar(b.total - off.open)}</b></span>
      <span className="mr-auto text-[11.5px] text-emerald-700">تتابعها في تبويب «مقاصة الموردين»</span></div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label={isC ? "إجمالي ليك عند العملاء" : "إجمالي عليك للموردين"} value={sar(b.total)} sub={`${b.parties.length} ${isC ? "عميل" : "مورد"} · ${b.open.length} فاتورة مفتوحة`} />
      <Tile label="فات ميعاده" value={sar(b.overdue)} tone={b.overdue > 0 ? "bad" : undefined} sub={b.total ? `${Math.round(b.overdue / b.total * 100)}% من الإجمالي` : "—"} />
      <Tile label={isC ? "أقدم من 60 يوم" : "مستحق خلال 7 أيام"} value={sar(isC ? old : dueWeek)} tone={isC && old > 0 ? "bad" : !isC && dueWeek > 0 ? "warn" : undefined} sub={isC ? "أصعب ديون في التحصيل" : `لحد ${week}`} />
      {isC ? <Tile label="المحصّل في الفترة" value={sar(d.kpi.collected)} sub="دفعات العملاء المسجلة في دفترة" />
        : <Tile label="المشتريات في الفترة" value={sar(d.kpi.purchases)} sub={`${d.kpi.purchase_invoices} فاتورة شراء (قبل الضريبة)`} />}
    </div>

    <Card title="أعمار الأرصدة" hint="الفلوس مقسومة حسب عدد الأيام بعد ميعاد الاستحقاق. اضغط على أي فترة عشان تفلتر." right={<ExcelBtn href={x(isC ? "ar" : "ap")} />}>
      <div className="mb-3 flex h-4 overflow-hidden rounded-full bg-[var(--bg)]">{AGE.map(([k, , c]) => b.buckets[k] ? <button type="button" key={k} aria-label={k} onClick={() => setBk(bk === k ? null : k)} title={sar(b.buckets[k])} style={{ width: `${b.buckets[k] / (b.total || 1) * 100}%`, background: c, opacity: bk && bk !== k ? 0.3 : 1 }} /> : null)}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{AGE.map(([k, l, c]) => <button type="button" key={k} onClick={() => setBk(bk === k ? null : k)} className={`rounded-xl border p-2.5 text-right transition ${bk === k ? "border-[var(--navy)] bg-[var(--sky-light)]" : "border-[var(--border)] hover:bg-[var(--bg)]"}`}>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)]"><i className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</div><div className="mt-0.5 text-sm font-extrabold tabular-nums">{sar(b.buckets[k] || 0)}</div></button>)}</div>
    </Card>

    <Card title={`${isC ? "العملاء" : "الموردين"}${bk ? ` — ${AGE.find(a => a[0] === bk)?.[1]}` : ""} · اضغط على أي اسم يفتح كشف الحساب`} right={bk && <button type="button" onClick={() => setBk(null)} className="text-xs font-bold text-[var(--navy)]">إلغاء الفلتر</button>}>
      <Table rows={rows} rowKey={r => r.name} search={r => r.name} initialSort={["unpaid", -1]} empty={isC ? "مفيش مستحقات عند العملاء 🎉" : "مفيش مستحقات للموردين"} cols={[
        { key: "name", label: isC ? "العميل" : "المورد", className: "max-w-72 truncate text-right font-bold", render: r => <button type="button" onClick={e => { e.stopPropagation(); open(kind, r.name); }} className="max-w-72 truncate text-right font-bold text-[var(--navy)] hover:underline">{r.name}</button> },
        { key: "unpaid", label: "الرصيد", render: r => <b className="tabular-nums">{sar(r.unpaid)}</b> },
        { key: "overdue", label: "متأخر", render: r => r.overdue ? <span className="font-bold text-red-700">{sar(r.overdue)}</span> : "—" },
        { key: "oldestDue", label: "أقدم تأخير", render: r => r.oldestDue > 0 ? <span className={r.oldestDue > 60 ? "font-bold text-red-700" : "text-amber-700"}>{r.oldestDue} يوم</span> : <span className="text-emerald-700">في الميعاد</span> },
        { key: "n", label: "فواتير" },
      ]} />
    </Card>

    {isC ? <Card title={byProfit ? "أكثر العملاء ربحية في الفترة" : "أكبر العملاء في الفترة (مبيعات)"} hint="الربح = مبيعات العميل ناقص تكلفة شراء اللي اشتراه. بيبان لما تكون تكلفة الأصناف معروفة من فواتير الشراء."
      right={<div className="flex gap-1 rounded-xl bg-[var(--sky-light)] p-1">
        <button type="button" onClick={() => setByProfit(false)} className={`rounded-lg px-3 py-1 text-xs font-bold ${!byProfit ? "bg-[var(--card)] text-[var(--navy)] shadow-sm" : "text-[var(--muted)]"}`}>بالمبيعات</button>
        <button type="button" onClick={() => setByProfit(true)} className={`rounded-lg px-3 py-1 text-xs font-bold ${byProfit ? "bg-[var(--card)] text-[var(--navy)] shadow-sm" : "text-[var(--muted)]"}`}>بالربح</button></div>}>
      <Bars rows={(byProfit ? [...d.salesByClient].filter(c => c.gross !== 0).sort((a, b) => b.gross - a.gross) : d.salesByClient).slice(0, 10).map(c => ({
        label: c.name, value: byProfit ? c.gross : c.net,
        sub: byProfit ? `ربح ${sar(c.gross)}${c.margin !== null ? ` · هامش ${c.margin}%` : " · تكلفة غير معروفة"} · مبيعات ${sar(c.net)}` : `${c.share}% من مبيعاتك · ${c.n} فاتورة · آخر فاتورة ${c.last}` }))}
        color={byProfit ? C.mint : C.blue} onPick={n => open("client", n)} />
    </Card> : <Card title="المشتريات حسب المورد في الفترة">
      <Bars rows={d.purchasesBySupplier.slice(0, 10).map(s => ({ label: s.name, value: s.net, sub: `${s.n} فاتورة · ${s.unpaid ? `عليك ${sar(s.unpaid)}` : "مسدد"}` }))} color={C.teal} onPick={n => open("supplier", n)} />
    </Card>}
  </div>;
}

type St = { kind: PartyKind; name: string; lines: StLine[]; totals: { invoiced: number; refunds: number; paid: number; offsets?: number; balance: number; open: number; overdue: number; credit_applied?: number; unallocated: number };
  open: Array<{ id: number; no: string; date: string; due: string; unpaid: number; days_late: number }>; last_invoice: string | null; last_payment: string | null;
  rating?: { avg_days: number | null; paid_invoices: number; label: string; suggested_credit: number | null } | null };
type Followup = { id: number; customer: string; note: string; promise_date: string | null; promise_amount: number | null; status: "open" | "kept" | "broken"; created_at: string };
const RATE_CLS: Record<string, string> = { "ممتاز": "bg-emerald-50 text-emerald-700", "جيد": "bg-sky-50 text-sky-700", "متأخر": "bg-amber-50 text-amber-800", "متعثر": "bg-red-50 text-red-700", "جديد": "bg-slate-100 text-slate-600" };

/** Account statement in a side drawer: running balance, open invoices, and a ready reminder message. */
export function StatementDrawer({ kind, name, subdomain, onClose }: { kind: PartyKind; name: string; subdomain: string; onClose: () => void }) {
  const toast = useToast();
  const [s, setS] = useState<St | null>(null); const [err, setErr] = useState<string | null>(null); const [all, setAll] = useState(false);
  useEffect(() => {
    setS(null); setErr(null);
    fetch(`/api/admin/finance/statement?kind=${kind}&name=${encodeURIComponent(name)}`, { cache: "no-store" }).then(async r => { const j = await r.json().catch(() => null); if (r.ok && j) setS(j); else setErr(j?.error || "تعذر تحميل كشف الحساب"); }).catch(() => setErr("تعذر تحميل كشف الحساب"));
  }, [kind, name]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h); }, [onClose]);
  const url = (id: number) => `https://${subdomain}/owner/${kind === "client" ? "invoices" : "purchase_invoices"}/view/${id}`;
  const isC = kind === "client";
  const reminder = s ? `السلام عليكم ${name}،\nنحب نفكّركم إن الرصيد المستحق لنا عندكم ${Math.round(s.totals.open).toLocaleString("en-US")} ر.س${s.totals.overdue ? `، منه ${Math.round(s.totals.overdue).toLocaleString("en-US")} ر.س فات ميعاده` : ""}.\n${s.open.slice(0, 6).map(o => `• فاتورة ${o.no} بتاريخ ${o.date}: ${Math.round(o.unpaid).toLocaleString("en-US")} ر.س${o.days_late ? ` (متأخرة ${o.days_late} يوم)` : ""}`).join("\n")}\nياريت تأكدوا لنا ميعاد السداد. شكراً لكم.` : "";
  const copy = async () => { try { await navigator.clipboard.writeText(reminder); toast("اتنسخت رسالة التذكير — الصقها في واتساب", "success"); } catch { toast("تعذر النسخ", "error"); } };
  const lines = s ? (all ? s.lines : s.lines.slice(-25)) : [];
  if (typeof document === "undefined") return null;
  return createPortal(<div dir="rtl" className="fixed inset-0 z-[90]">
    <button type="button" aria-label="إغلاق" onClick={onClose} className="absolute inset-0 bg-[#0b1d20]/40" />
    <aside role="dialog" aria-modal="true" aria-label={`كشف حساب ${name}`} className="absolute inset-y-0 left-0 flex w-[min(520px,100vw)] flex-col bg-[var(--card)] shadow-2xl">
      <div className="flex items-center justify-between gap-2 bg-[var(--navy)] px-4 py-3.5 text-white">
        <div className="min-w-0"><div className="text-[12px] opacity-80">كشف حساب {isC ? "عميل" : "مورد"}</div><div className="truncate text-[17px] font-extrabold">{name}</div></div>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg hover:bg-white/15">✕</button>
      </div>
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4">
        {err && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{err}</div>}
        {!s && !err && <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--bg)]" />)}</div>}
        {s && <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-[var(--sky-light)] p-3"><div className="text-[11px] font-semibold text-[var(--muted)]">الرصيد</div><div className="text-[17px] font-extrabold tabular-nums">{sar(s.totals.open)}</div></div>
            <div className="rounded-2xl bg-[var(--sky-light)] p-3"><div className="text-[11px] font-semibold text-[var(--muted)]">{isC ? "المحصّل" : "المدفوع"}</div><div className="text-[17px] font-extrabold tabular-nums text-emerald-700">{sar(s.totals.paid)}</div></div>
            <div className="rounded-2xl bg-[var(--sky-light)] p-3"><div className="text-[11px] font-semibold text-[var(--muted)]">متأخر</div><div className={`text-[17px] font-extrabold tabular-nums ${s.totals.overdue ? "text-red-700" : ""}`}>{sar(s.totals.overdue)}</div></div>
          </div>
          <div className="text-[12px] text-[var(--muted)]">إجمالي الفواتير {sar(s.totals.invoiced)}{s.totals.refunds ? ` · مرتجعات ${sar(s.totals.refunds)}` : ""}{!isC && (s.totals.offsets || 0) > 0 ? ` · مقاصة ${sar(s.totals.offsets)}` : ""} · آخر فاتورة {s.last_invoice || "—"}{isC ? ` · آخر دفعة ${s.last_payment || "—"}` : ""}</div>
          {isC && s.rating && <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] px-3 py-2.5 text-[12px]">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${RATE_CLS[s.rating.label] || RATE_CLS["جديد"]}`}>عميل {s.rating.label}</span>
            {s.rating.avg_days !== null ? <span className="text-[var(--muted)]">بيسدّد في <b className="text-[var(--ink)]">{s.rating.avg_days} يوم</b> في المتوسط · {s.rating.paid_invoices} فاتورة اتسددت</span> : <span className="text-[var(--muted)]">لسه ما سددش فواتير</span>}
            {s.rating.suggested_credit !== null && <span className="text-[var(--muted)]">· حد ائتمان مقترح <b className="text-[var(--ink)]">{sar(s.rating.suggested_credit)}</b></span>}
          </div>}
          {isC && <FollowupPanel customer={name} />}
          {(s.totals.credit_applied || 0) >= 1 && <div className="rounded-xl bg-emerald-50 p-2.5 text-[12px] text-emerald-900">اتخصم {sar(s.totals.credit_applied)} دفعات مسجّلة على العميل مش مربوطة بفواتير معيّنة في دفترة — الرصيد والمتأخر فوق بعد الخصم.</div>}
          {Math.abs(s.totals.unallocated) >= 1 && <div className="rounded-xl bg-amber-50 p-2.5 text-[12px] text-amber-900">فيه {sar(Math.abs(s.totals.unallocated))} فرق بين الحركة والفواتير المفتوحة — غالباً دفعة {s.totals.unallocated < 0 ? "مقدمة أو " : ""}مش مربوطة بفاتورة في دفترة.</div>}
          <div className="flex flex-wrap gap-2">
            {isC && s.open.length > 0 && <button type="button" onClick={() => void copy()} className="rounded-full bg-[var(--navy)] px-3.5 py-2 text-xs font-bold text-white">انسخ رسالة تذكير</button>}
          </div>
          {s.open.length > 0 && <div><div className="mb-1.5 text-sm font-extrabold">الفواتير المفتوحة ({s.open.length})</div>
            <div className="space-y-1.5">{s.open.map(o => <a key={o.id} href={url(o.id)} target="_blank" rel="noreferrer" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--sky-light)]">
              <b dir="ltr" className="text-[var(--navy)]">{o.no}</b><span>فاتورة {o.date}</span><span>استحقاق {o.due}</span>
              <span className={o.days_late ? "font-bold text-red-700" : "text-emerald-700"}>{o.days_late ? `متأخرة ${o.days_late} يوم` : "في الميعاد"}</span><b className="tabular-nums">{sar(o.unpaid)}</b></a>)}</div></div>}
          <div>
            <div className="mb-1.5 flex items-center justify-between"><span className="text-sm font-extrabold">الحركة</span>{s.lines.length > 25 && <button type="button" onClick={() => setAll(!all)} className="text-xs font-bold text-[var(--navy)]">{all ? "آخر 25 بس" : `كل الحركة (${s.lines.length})`}</button>}</div>
            <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-[12.5px]">
              <thead className="bg-[var(--sky-light)] text-[11px] text-[var(--muted)]"><tr><th className="p-2 text-right">التاريخ</th><th className="p-2 text-right">البيان</th><th className="p-2">{isC ? "عليه" : "له"}</th><th className="p-2">{isC ? "دفع" : "اتدفع"}</th><th className="p-2">الرصيد</th></tr></thead>
              <tbody className="divide-y divide-[var(--border)]">{lines.map((l, i) => { const up = isC ? l.debit : l.credit, down = isC ? l.credit : l.debit; return <tr key={i}>
                <td className="whitespace-nowrap p-2 text-[var(--muted)]">{l.date}</td>
                <td className="p-2">{l.doc_id && l.kind !== "payment" ? <a href={url(l.doc_id)} target="_blank" rel="noreferrer" className="hover:underline">{l.note}</a> : l.note}</td>
                <td className="p-2 text-center tabular-nums">{up ? num(up, 2) : ""}</td>
                <td className="p-2 text-center tabular-nums text-emerald-700">{down ? num(down, 2) : ""}</td>
                <td className="p-2 text-center font-extrabold tabular-nums">{num(l.balance, 2)}</td></tr>; })}
                {!lines.length && <tr><td colSpan={5} className="p-4 text-center text-[var(--muted)]">مفيش حركة</td></tr>}</tbody></table></div>
            {isC && <ReconcilePanel customer={name} appBalance={s.totals.open} />}
            {!isC && <div className="mt-1.5 text-[11px] text-[var(--muted)]">المدفوعات من دفترة + المقاصة المحصّلة بتخصم من حساب المورد تلقائياً.</div>}
          </div>
        </>}
      </div>
    </aside>
  </div>, document.body);
}

type Rc = { client_ids: number[]; balance: number; unapplied: number; hints: string[];
  invoices: { n: number; invoiced: number; refunds: number; paid_on_invoices: number; unpaid: number };
  payments: { n: number; received: number; linked: { n: number; sum: number }; unlinked: { n: number; sum: number }; to_missing: { n: number; sum: number }; skipped: Record<string, { n: number; sum: number }> };
  others: Record<string, { n: number; sum: number }>;
  other_docs: Array<{ id: number; no: string; date: string | null; type: string; total: number; draft: boolean }>;
  sync: { at?: string; payments?: { total: number; by_status: Record<string, { n: number; sum: number }>; linked: { n: number; sum: number }; unlinked: { n: number; sum: number }; no_client: number } } | null };

/** Everything the app got from Daftra for this customer, next to Daftra's own statement balance, to find a mismatch. */
function ReconcilePanel({ customer, appBalance }: { customer: string; appBalance: number }) {
  const [on, setOn] = useState(false); const [r, setR] = useState<Rc | null>(null); const [err, setErr] = useState<string | null>(null); const [dft, setDft] = useState("");
  useEffect(() => {
    if (!on || r) return;
    fetch(`/api/admin/finance/reconcile?name=${encodeURIComponent(customer)}`, { cache: "no-store" }).then(async x => { const j = await x.json().catch(() => null); if (x.ok && j) setR(j); else setErr(j?.error || "تعذر التحميل"); }).catch(() => setErr("تعذر التحميل"));
  }, [on, r, customer]);
  const d = Number(dft.replace(/,/g, "")); const diff = dft && Number.isFinite(d) && r ? Math.round((r.balance - d) * 100) / 100 : null;
  const row = (l: string, v: string, cls = "") => <div className="flex items-center justify-between gap-2 py-1"><span className="text-[var(--muted)]">{l}</span><b className={`tabular-nums ${cls}`}>{v}</b></div>;
  return <div className="mt-3 rounded-2xl border border-dashed border-[var(--border)] p-3 text-[12.5px]">
    <button type="button" onClick={() => setOn(!on)} className="flex w-full items-center justify-between text-sm font-extrabold"><span>مراجعة الربط مع دفترة</span><span className="text-[var(--muted)]">{on ? "▲" : "▼"}</span></button>
    {on && <div className="mt-2 space-y-2">
      {err && <div className="rounded-xl bg-red-50 p-2 text-red-800">{err}</div>}
      {!r && !err && <div className="h-16 animate-pulse rounded-xl bg-[var(--bg)]" />}
      {r && <>
        <div className="divide-y divide-[var(--border)]">
          {row(`الفواتير (${r.invoices.n})`, sar(r.invoices.invoiced))}
          {row("مرتجعات على الفواتير", `− ${sar(r.invoices.refunds)}`)}
          {row(`الدفعات المستلمة (${r.payments.n})`, `− ${sar(r.payments.received)}`, "text-emerald-700")}
          {row(`  منها مربوطة بفواتير (${r.payments.linked.n})`, sar(r.payments.linked.sum))}
          {row(`  منها مش مربوطة (${r.payments.unlinked.n})`, sar(r.payments.unlinked.sum))}
          {row("الرصيد حسب الحركة اللي وصلت", sar(r.balance), "text-[var(--navy)]")}
          {row("الرصيد المعروض في البرنامج", sar(appBalance))}
        </div>
        <label className="flex flex-wrap items-center gap-2"><span className="text-[var(--muted)]">رصيد نهاية المدة في كشف دفترة:</span>
          <input value={dft} onChange={e => setDft(e.target.value)} inputMode="decimal" dir="ltr" placeholder="مثلاً 57641.25" className="w-32 rounded-lg border border-[var(--border)] px-2 py-1.5" /></label>
        {diff !== null && (Math.abs(diff) < 1
          ? <div className="rounded-xl bg-emerald-50 p-2 text-emerald-900">✓ مطابق لدفترة.</div>
          : <div className="rounded-xl bg-amber-50 p-2 text-amber-900">الفرق {sar(Math.abs(diff))} — البرنامج {diff > 0 ? "أعلى" : "أقل"} من دفترة. {diff > 0 ? "غالباً مرتجع/إشعار دائن أو دفعة ما وصلتش." : "غالباً فاتورة ما وصلتش أو دفعة محسوبة زيادة."}</div>)}
        {r.hints.map((h, i) => <div key={i} className="rounded-xl bg-amber-50 p-2 text-amber-900">{h}</div>)}
        {r.other_docs.length > 0 && <div><div className="mb-1 font-bold">مستندات تانية من دفترة للعميل</div>
          {r.other_docs.map(o => <div key={o.id} className="flex justify-between gap-2 py-0.5"><span dir="ltr">{o.no || o.id}</span><span>{o.date || "—"}</span><span>نوع {o.type}{o.draft ? " · مسودة" : ""}</span><b className="tabular-nums">{sar(o.total)}</b></div>)}</div>}
        {r.sync?.payments && <div className="text-[11px] text-[var(--muted)]">آخر مزامنة {r.sync.at?.slice(0, 16).replace("T", " ")}: {r.sync.payments.total} دفعة في دفترة كلها ({r.sync.payments.unlinked.n} مش مربوطة بفواتير) · الحالات: {Object.entries(r.sync.payments.by_status).map(([k, v]) => `${k}: ${v.n}`).join("، ")}</div>}
        <a href={`/api/admin/daftra/debug?name=${encodeURIComponent(customer)}`} className="inline-block rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--navy)]">نزّل بيانات العميل الخام من دفترة</a>
      </>}
    </div>}
  </div>;
}

/** Follow-up log and payment promises for one customer. */
function FollowupPanel({ customer }: { customer: string }) {
  const toast = useToast();
  const [list, setList] = useState<Followup[] | null>(null);
  const [note, setNote] = useState(""); const [pdate, setPdate] = useState(""); const [pamt, setPamt] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch(`/api/admin/finance/followups?customer=${encodeURIComponent(customer)}`, { cache: "no-store" }).then(r => r.json()).then(j => setList(j.followups || [])).catch(() => setList([])), [customer]);
  useEffect(() => { void load(); }, [load]);
  async function add() {
    if (!note.trim() && !pdate) { toast("اكتب ملاحظة أو حدّد وعد بالدفع", "error"); return; }
    setBusy(true);
    const r = await fetch("/api/admin/finance/followups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customer, note, promise_date: pdate || null, promise_amount: pamt || null }) });
    setBusy(false);
    if (r.ok) { setNote(""); setPdate(""); setPamt(""); await load(); } else toast("تعذر الحفظ", "error");
  }
  async function mark(id: number, status: string) { const r = await fetch("/api/admin/finance/followups", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) }); if (r.ok) await load(); }
  async function del(id: number) { const r = await fetch(`/api/admin/finance/followups?id=${id}`, { method: "DELETE" }); if (r.ok) await load(); }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  return <div className="rounded-2xl border border-[var(--border)] p-3">
    <div className="mb-2 text-sm font-extrabold">متابعة التحصيل</div>
    <div className="space-y-2">
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="كلمته وقال إيه؟ (اختياري)" className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-[13px]" />
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-[var(--muted)]">وعد يدفع:</span>
        <input type="date" value={pdate} onChange={e => setPdate(e.target.value)} className="rounded-lg border border-[var(--border)] px-2 py-1.5" />
        <input value={pamt} onChange={e => setPamt(e.target.value)} inputMode="decimal" dir="ltr" placeholder="المبلغ (اختياري)" className="w-28 rounded-lg border border-[var(--border)] px-2 py-1.5" />
        <button type="button" disabled={busy} onClick={() => void add()} className="mr-auto rounded-full bg-[var(--navy)] px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-60">إضافة</button>
      </div>
    </div>
    {list && list.length > 0 && <div className="mt-3 space-y-2">{list.map(f => <div key={f.id} className="rounded-xl bg-[var(--bg)] p-2.5 text-[12.5px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {f.promise_date && <div className={`font-bold ${f.status === "open" && f.promise_date < today ? "text-red-700" : f.status === "kept" ? "text-emerald-700" : f.status === "broken" ? "text-red-700" : "text-[var(--navy)]"}`}>
            وعد يدفع {f.promise_amount ? `${sar(f.promise_amount)} ` : ""}يوم {f.promise_date}{f.status === "kept" ? " ✓ التزم" : f.status === "broken" ? " ✗ ما دفعش" : f.promise_date < today ? " — فات الميعاد" : ""}</div>}
          {f.note && <div className="text-[var(--ink)]">{f.note}</div>}
          <div className="text-[11px] text-[var(--muted)]">{f.created_at.slice(0, 10)}</div>
        </div>
        <button type="button" onClick={() => void del(f.id)} aria-label="مسح" className="shrink-0 text-[var(--muted)] hover:text-red-600">✕</button>
      </div>
      {f.promise_date && f.status === "open" && <div className="mt-1.5 flex gap-1.5">
        <button type="button" onClick={() => void mark(f.id, "kept")} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">دفع ✓</button>
        <button type="button" onClick={() => void mark(f.id, "broken")} className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">ما دفعش ✗</button>
      </div>}
    </div>)}</div>}
  </div>;
}
