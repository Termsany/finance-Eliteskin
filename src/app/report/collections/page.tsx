import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadCollections, MONTH } from "@/lib/collections-data";
import { query } from "@/lib/db";
import type { Row, Status } from "@/lib/collections";
import PrintBar from "./PrintBar";

export const dynamic = "force-dynamic";
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const mName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const k = (n: number) => Math.round(n).toLocaleString("en-US");
const FILTER: Record<string, string> = { all: "الكل", overdue: "المتأخر بس", week: "الأسبوع ده", month: "باقي الشهر" };
const COLOR = { ink: "#16232b", muted: "#5f7177", navy: "#10484f", red: "#b42318", amber: "#b7791f", green: "#1e7a5a", border: "#e3ecec", soft: "#f3faf9" };
const stLabel = (r: Row) => r.status === "overdue" ? `متأخرة ${r.days} يوم` : r.days === 0 ? "تستحق النهارده" : `بعد ${-r.days} ${-r.days === 1 ? "يوم" : "أيام"}`;

/** Printable collections report (A4). Opens the print dialog; "Save as PDF" makes the PDF. */
export default async function CollectionsReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await getCurrentUser())) redirect("/login");
  const sp = await searchParams;
  const kind = sp.kind === "supplier" ? "supplier" : "client";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  const month = MONTH.test(sp.month || "") ? sp.month! : today.slice(0, 7);
  const filter = (["all", "overdue", "week", "month"].includes(sp.filter || "") ? sp.filter : "all") as keyof typeof FILTER;
  const view = sp.view === "date" ? "date" : "party";
  const d = await loadCollections(kind, month);
  const sync = (await query<{ finished_at: string | null }>("SELECT finished_at::text FROM daftra_sync WHERE id=1").catch(() => ({ rows: [] }))).rows[0]?.finished_at;
  const isC = kind === "client", who = isC ? "العميل" : "المورد";
  const pass = (r: Row) => filter === "all" || r.status === filter;
  const rows = d.rows.filter(pass);
  const byParty = (list: Row[]) => view === "party" ? [...list].sort((a, b) => a.party.localeCompare(b.party, "ar") || a.due.localeCompare(b.due)) : list;
  const sections: Array<[string, string, Status[]]> = [["متأخر — فات ميعاده", COLOR.red, ["overdue"]], [d.current ? "مستحق في ميعاده — باقي الشهر" : `مستحق في ${mName(month)}`, COLOR.amber, ["week", "month"]]];
  const printed = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const tiles: Array<[string, number | null, string]> = [[isC ? "المطلوب تحصيله" : "المطلوب دفعه", d.totals.required, COLOR.ink], ["متأخر", d.totals.overdue, COLOR.red], [d.current ? "مستحق باقي الشهر" : "مستحق في الشهر", d.totals.due, COLOR.amber], ...(isC ? [["اتحصّل في الشهر", d.done, COLOR.green] as [string, number | null, string]] : [])];

  return <div dir="rtl" className="report-root">
    <style>{`
      .report-root { background: #e9eef0; min-height: 100vh; padding: 24px 12px; color: ${COLOR.ink}; }
      html[data-theme="dark"] .report-root { background: #e9eef0; }
      .sheet { background: #fff; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 15mm; box-shadow: 0 10px 40px rgba(0,0,0,.12); font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; }
      .sheet h1 { font-family: 'Alexandria', sans-serif; }
      .sheet table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
      .sheet th { background: ${COLOR.soft}; color: ${COLOR.muted}; font-weight: 600; font-size: 9pt; text-align: right; padding: 6px 8px; }
      .sheet td { padding: 7px 8px; border-bottom: 1px solid ${COLOR.border}; text-align: right; }
      .sheet tr { break-inside: avoid; }
      .num { font-variant-numeric: tabular-nums; }
      @page { size: A4; margin: 0; }
      @media print { .report-root { background: #fff; padding: 0; } .sheet { box-shadow: none; margin: 0; width: auto; min-height: auto; } .no-print { display: none !important; } }
      @media (max-width: 820px) { .sheet { width: 100%; padding: 18px; } }
    `}</style>
    <PrintBar back="/" />
    <div className="sheet">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div>
          <div style={{ fontSize: "10pt", fontWeight: 600, color: COLOR.navy }}>Elite Skin · المتابعة المالية</div>
          <h1 style={{ fontSize: "19pt", fontWeight: 800, margin: "4px 0" }}>{isC ? "تقرير التحصيل" : "تقرير المدفوعات للموردين"} — {mName(month)}</h1>
          <div style={{ fontSize: "10pt", color: COLOR.muted }}>{isC ? "المبالغ المطلوب تحصيلها من العملاء" : "المبالغ المطلوب دفعها للموردين"} لحد {d.end}</div>
        </div>
        <div style={{ fontSize: "9pt", color: COLOR.muted, textAlign: "left" }}>
          <div>اتطبع {printed}</div><div>الفلتر: {FILTER[filter]} · {view === "party" ? `حسب ${who}` : "بالتاريخ"}</div>
        </div>
      </div>
      <div style={{ height: 2, background: COLOR.navy, margin: "12px 0 14px" }} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiles.length}, 1fr)`, gap: 8, marginBottom: 16 }}>
        {tiles.map(([l, v, c]) => <div key={l} style={{ background: COLOR.soft, border: `1px solid ${COLOR.border}`, borderRadius: 10, padding: "9px 12px" }}>
          <div style={{ fontSize: "9pt", fontWeight: 600, color: COLOR.muted }}>{l}</div>
          <div className="num" style={{ fontSize: "14pt", fontWeight: 800, color: c }}>{v === null ? "—" : `${k(v)} ر.س`}</div></div>)}
      </div>
      {!rows.length ? <p style={{ textAlign: "center", color: COLOR.muted, padding: 24 }}>مفيش مبالغ في الفلتر ده.</p>
        : sections.map(([title, color, sts]) => { const list = byParty(rows.filter(r => sts.includes(r.status))); if (!list.length) return null;
          return <div key={title} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <b style={{ fontSize: "12.5pt", display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 9, background: color, display: "inline-block" }} />{title}</b>
              <b className="num" style={{ color, fontSize: "11.5pt" }}>{k(list.reduce((s, r) => s + r.unpaid, 0))} ر.س · {list.length} فاتورة</b>
            </div>
            <table><thead><tr><th>{who}</th><th>رقم</th><th>التاريخ</th><th>الاستحقاق</th><th>الحالة</th><th style={{ textAlign: "left" }}>المبلغ (ر.س)</th></tr></thead>
              <tbody>{list.map(r => <tr key={r.id}><td style={{ fontWeight: 700 }}>{r.party}</td><td dir="ltr" style={{ textAlign: "right" }}>{r.no}</td><td className="num">{r.date}</td><td className="num">{r.due}</td>
                <td style={{ color, fontWeight: 600 }}>{stLabel(r)}</td><td className="num" style={{ textAlign: "left", fontWeight: 800 }}>{k(r.unpaid)}</td></tr>)}</tbody></table>
          </div>; })}
      {view === "party" && rows.length > 0 && <div style={{ marginTop: 8 }}>
        <b style={{ fontSize: "12pt" }}>الإجمالي حسب {who}</b>
        <table style={{ marginTop: 6 }}><thead><tr><th>{who}</th><th>متأخر</th><th>في ميعاده</th><th style={{ textAlign: "left" }}>الإجمالي (ر.س)</th></tr></thead>
          <tbody>{d.groups.map(g => ({ g, r: g.rows.filter(pass) })).filter(x => x.r.length).map(({ g, r }) => { const late = r.filter(x => x.status === "overdue").reduce((s, x) => s + x.unpaid, 0), due = r.reduce((s, x) => s + x.unpaid, 0) - late;
            return <tr key={g.party}><td style={{ fontWeight: 700 }}>{g.party}</td><td className="num" style={{ color: late ? COLOR.red : COLOR.muted }}>{late ? k(late) : "—"}</td><td className="num" style={{ color: due ? COLOR.amber : COLOR.muted }}>{due ? k(due) : "—"}</td><td className="num" style={{ textAlign: "left", fontWeight: 800 }}>{k(late + due)}</td></tr>; })}</tbody></table>
      </div>}
      <div style={{ marginTop: 18, paddingTop: 8, borderTop: `1px solid ${COLOR.border}`, fontSize: "8.5pt", color: COLOR.muted, display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span>الأرقام من دفترة{sync ? ` (آخر مزامنة ${new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" }).format(new Date(sync))})` : ""} وشاملة الضريبة. الاستحقاق = تاريخ الفاتورة + مدة السداد في دفترة.</span>
        <span>{isC ? "مطلوب تحصيله" : "مطلوب دفعه"}: {k(rows.reduce((s, r) => s + r.unpaid, 0))} ر.س</span>
      </div>
    </div>
  </div>;
}
