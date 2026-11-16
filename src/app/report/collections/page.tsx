import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadMonthly, SEL } from "@/lib/collections-data";
import { query } from "@/lib/db";
import type { Row } from "@/lib/collections";
import PrintBar from "./PrintBar";

export const dynamic = "force-dynamic";
const k = (n: number) => Math.round(n).toLocaleString("en-US");
const C = { ink: "#16232b", muted: "#5f7177", navy: "#10484f", red: "#b42318", amber: "#b7791f", green: "#1e7a5a", border: "#e3ecec", soft: "#f3faf9" };
const stLabel = (r: Row) => r.status === "overdue" ? `متأخرة ${r.days} يوم` : r.days === 0 ? "تستحق النهارده" : `بعد ${-r.days} يوم`;

/** Printable report (A4) built around each customer's amounts; invoices are optional. "Save as PDF" makes the PDF. */
export default async function CollectionsReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await getCurrentUser())) redirect("/login");
  const sp = await searchParams;
  const kind = sp.kind === "supplier" ? "supplier" : "client";
  const d = await loadMonthly(kind, SEL.test(sp.sel || "") ? sp.sel! : "");
  const withInv = sp.invoices === "1", all = sp.all === "1";
  const isC = kind === "client", who = isC ? "العميل" : "المورد";
  const list = d.parties.filter(p => all || p.selected > 0);
  const sum = (f: (p: (typeof list)[number]) => number) => list.reduce((s, p) => s + f(p), 0);
  const sync = (await query<{ finished_at: string | null }>("SELECT finished_at::text FROM daftra_sync WHERE id=1").catch(() => ({ rows: [] }))).rows[0]?.finished_at;
  const fmt = (x: Date | string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone: "Asia/Riyadh", ...o }).format(new Date(x));
  const selName = d.sel === "overdue" ? "المتأخر" : d.sel === "later" ? "بعد 6 شهور" : d.label;
  const colSel = d.sel === "overdue" ? "المتأخر" : `مطلوب في ${d.sel === "later" ? "بعد كده" : d.label.split(" ")[0]}`;
  const tiles: Array<[string, number, string]> = [[`${isC ? "مطلوب تحصيله" : "مطلوب دفعه"} — ${selName}`, d.totals.selected, C.navy], ["المتأخر كله", d.totals.overdue, C.red],
    ...(d.sel !== "overdue" && d.sel !== "later" ? [[`لحد آخر ${d.label.split(" ")[0]}`, d.totals.by_end, C.amber] as [string, number, string]] : []), [`إجمالي المفتوح على ${isC ? "العملاء" : "الموردين"}`, d.totals.open, C.ink]];
  const months = d.buckets.filter(b => b.amount > 0);

  return <div dir="rtl" className="report-root">
    <style>{`
      .report-root { background: #e9eef0; min-height: 100vh; padding: 24px 12px; color: ${C.ink}; }
      .sheet { background: #fff; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 15mm; box-shadow: 0 10px 40px rgba(0,0,0,.12); font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; }
      .sheet h1 { font-family: 'Alexandria', sans-serif; }
      .sheet table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
      .sheet th { background: ${C.soft}; color: ${C.muted}; font-weight: 600; font-size: 9pt; text-align: right; padding: 6px 8px; }
      .sheet td { padding: 7px 8px; border-bottom: 1px solid ${C.border}; text-align: right; }
      .sheet tr { break-inside: avoid; }
      .sheet .n { font-variant-numeric: tabular-nums; text-align: left; }
      .sheet tfoot td { background: ${C.soft}; font-weight: 800; border-top: 2px solid ${C.navy}; }
      @page { size: A4; margin: 0; }
      @media print { .report-root { background: #fff; padding: 0; } .sheet { box-shadow: none; margin: 0; width: auto; min-height: auto; } .no-print { display: none !important; } }
      @media (max-width: 820px) { .sheet { width: 100%; padding: 18px; } }
    `}</style>
    <PrintBar back="/?tab=collections" />
    <div className="sheet">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div>
          <div style={{ fontSize: "10pt", fontWeight: 600, color: C.navy }}>Elite Skin · المتابعة المالية</div>
          <h1 style={{ fontSize: "19pt", fontWeight: 800, margin: "4px 0" }}>{isC ? "تقرير التحصيل" : "تقرير المدفوعات للموردين"} — {selName}</h1>
          <div style={{ fontSize: "10pt", color: C.muted }}>{isC ? "المبلغ المطلوب من كل عميل" : "المبلغ المطلوب لكل مورد"}{all ? ` (كل ${isC ? "العملاء" : "الموردين"} اللي عليهم فلوس)` : ""}</div>
        </div>
        <div style={{ fontSize: "9pt", color: C.muted, textAlign: "left" }}>اتطبع {fmt(new Date(), { dateStyle: "medium", timeStyle: "short" })}</div>
      </div>
      <div style={{ height: 2, background: C.navy, margin: "12px 0 14px" }} />

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiles.length}, 1fr)`, gap: 8, marginBottom: 14 }}>
        {tiles.map(([l, v, c]) => <div key={l} style={{ background: C.soft, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px" }}>
          <div style={{ fontSize: "9pt", fontWeight: 600, color: C.muted }}>{l}</div>
          <div className="n" style={{ fontSize: "14pt", fontWeight: 800, color: c, textAlign: "right" }}>{k(v)} ر.س</div></div>)}
      </div>

      <b style={{ fontSize: "12.5pt" }}>المبلغ على كل {who}</b>
      {!list.length ? <p style={{ textAlign: "center", color: C.muted, padding: 24 }}>مفيش مبالغ في {selName}.</p> :
        <table style={{ marginTop: 6 }}><thead><tr><th style={{ width: 26 }}>#</th><th>{who}</th><th className="n">{colSel}</th><th className="n">متأخر</th><th className="n">بعد كده</th><th className="n">إجمالي اللي عليه</th></tr></thead>
          <tbody>{list.map((p, i) => <tr key={p.party}>
            <td style={{ color: C.muted }}>{i + 1}</td>
            <td><b>{p.party}</b><div style={{ fontSize: "8.5pt", color: C.muted }}>{p.overdue ? `أقدم تأخير ${p.oldest} يوم` : p.next_due ? `أول استحقاق ${p.next_due}` : ""} · {p.rows.length} فاتورة</div></td>
            <td className="n" style={{ fontWeight: 800, color: C.navy, fontSize: "11.5pt" }}>{p.selected ? k(p.selected) : "—"}</td>
            <td className="n" style={{ color: p.overdue ? C.red : C.muted, fontWeight: p.overdue ? 700 : 400 }}>{p.overdue ? k(p.overdue) : "—"}</td>
            <td className="n" style={{ color: C.muted }}>{p.after ? k(p.after) : "—"}</td>
            <td className="n" style={{ fontWeight: 800 }}>{k(p.total)}</td></tr>)}</tbody>
          <tfoot><tr><td /><td>الإجمالي ({list.length} {isC ? "عميل" : "مورد"})</td><td className="n" style={{ color: C.navy }}>{k(sum(p => p.selected))}</td><td className="n" style={{ color: C.red }}>{k(sum(p => p.overdue))}</td><td className="n">{k(sum(p => p.after))}</td><td className="n">{k(sum(p => p.total))}</td></tr></tfoot>
        </table>}

      {months.length > 0 && <div style={{ marginTop: 16, breakInside: "avoid" }}>
        <b style={{ fontSize: "11.5pt" }}>شهر بشهر</b>
        <table style={{ marginTop: 6 }}><thead><tr>{months.map(b => <th key={b.key} className="n" style={{ color: b.key === "overdue" ? C.red : C.muted }}>{b.label}</th>)}</tr></thead>
          <tbody><tr>{months.map(b => <td key={b.key} className="n" style={{ fontWeight: b.key === d.sel ? 800 : 600, color: b.key === "overdue" ? C.red : b.key === d.sel ? C.navy : C.ink, background: b.key === d.sel ? "#eaf6f4" : undefined }}>{k(b.amount)}</td>)}</tr></tbody></table>
      </div>}

      {withInv && list.length > 0 && <div style={{ marginTop: 18 }}>
        <b style={{ fontSize: "12pt" }}>تفاصيل الفواتير</b>
        {list.map(p => <div key={p.party} style={{ marginTop: 10, breakInside: "avoid" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5pt", fontWeight: 700 }}><span>{p.party}</span><span className="n">{k(p.total)} ر.س</span></div>
          <table style={{ marginTop: 4 }}><thead><tr><th>رقم</th><th>التاريخ</th><th>الاستحقاق</th><th>الحالة</th><th className="n">المبلغ</th></tr></thead>
            <tbody>{p.rows.map(r => <tr key={r.id}><td dir="ltr" style={{ textAlign: "right" }}>{r.no}</td><td>{r.date}</td><td>{r.due}</td>
              <td style={{ color: r.status === "overdue" ? C.red : C.amber, fontWeight: 600 }}>{stLabel(r)}</td><td className="n" style={{ fontWeight: 700 }}>{k(r.unpaid)}</td></tr>)}</tbody></table>
        </div>)}
      </div>}

      <div style={{ marginTop: 18, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontSize: "8.5pt", color: C.muted }}>
        الأرقام من دفترة{sync ? ` (آخر مزامنة ${fmt(sync, { dateStyle: "short", timeStyle: "short" })})` : ""} وشاملة الضريبة. الاستحقاق = تاريخ الفاتورة + مدة السداد في دفترة. الشهور الجاية من الفواتير المتسجلة بس.
      </div>
    </div>
  </div>;
}
