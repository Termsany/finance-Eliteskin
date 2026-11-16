import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { riyadhToday } from "@/lib/finance";
import { summarize, STATUS_LABEL, lineAmount } from "@/lib/offsets";
import { loadOrders } from "@/lib/offsets-data";
import { query } from "@/lib/db";
import PrintBar from "./PrintBar";

export const dynamic = "force-dynamic";
const k = (n: number) => Math.round(n).toLocaleString("en-US");
const C = { ink: "#16232b", muted: "#5f7177", navy: "#10484f", red: "#b42318", amber: "#b7791f", green: "#1e7a5a", border: "#e3ecec", soft: "#f3faf9" };

/** Printable report (A4): what every supplier owes us in price differences, order by order. "Save as PDF" makes the PDF. */
export default async function OffsetsReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await getCurrentUser())) redirect("/login");
  const sp = await searchParams;
  const supFilter = (sp.supplier || "").trim();
  const withItems = sp.items === "1";
  const today = riyadhToday();
  const orders = await loadOrders();
  const { rows, suppliers, totals } = summarize(orders, today);
  const open = rows.filter(r => r.open > 0 && (!supFilter || r.supplier === supFilter)).sort((a, b) => a.supplier.localeCompare(b.supplier, "ar") || a.order_date.localeCompare(b.order_date));
  const sup = supFilter ? suppliers.filter(s => s.supplier === supFilter) : suppliers;
  const sync = (await query<{ finished_at: string | null }>("SELECT finished_at::text FROM daftra_sync WHERE id=1").catch(() => ({ rows: [] }))).rows[0]?.finished_at;
  const fmt = (x: Date | string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone: "Asia/Riyadh", ...o }).format(new Date(x));
  const openTotal = open.reduce((s, r) => s + r.open, 0);

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
    <PrintBar back="/?tab=offsets" />
    <div className="sheet">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div>
          <div style={{ fontSize: "10pt", fontWeight: 600, color: C.navy }}>Elite Skin · المتابعة المالية</div>
          <h1 style={{ fontSize: "19pt", fontWeight: 800, margin: "4px 0" }}>مقاصة الموردين — فروق الأسعار المطلوبة{supFilter ? ` · ${supFilter}` : ""}</h1>
          <div style={{ fontSize: "10pt", color: C.muted }}>المبلغ اللي كل مورد المفروض يخصمه من حسابنا ولسه ما اتخصمش</div>
        </div>
        <div style={{ fontSize: "9pt", color: C.muted, textAlign: "left" }}>اتطبع {fmt(new Date(), { dateStyle: "medium", timeStyle: "short" })}</div>
      </div>
      <div style={{ height: 2, background: C.navy, margin: "12px 0 14px" }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
        {([["إجمالي مطلوب للمقاصة", openTotal, C.navy], ["منه المورد حصّله وينفع نطالبه", totals.collected, C.amber], ["متأخر أكتر من 30 يوم", totals.late_amount, C.red]] as Array<[string, number, string]>).map(([l, v, c]) =>
          <div key={l} style={{ background: C.soft, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px" }}>
            <div style={{ fontSize: "9pt", fontWeight: 600, color: C.muted }}>{l}</div>
            <div className="n" style={{ fontSize: "14pt", fontWeight: 800, color: c, textAlign: "right" }}>{k(v)} ر.س</div></div>)}
      </div>

      <b style={{ fontSize: "12.5pt" }}>المطلوب على كل مورد</b>
      {!sup.length ? <p style={{ textAlign: "center", color: C.muted, padding: 24 }}>مفيش مبالغ مفتوحة.</p> :
        <table style={{ marginTop: 6 }}><thead><tr><th style={{ width: 26 }}>#</th><th>المورد</th><th className="n">أوردرات</th><th className="n">حصّل وينتظر</th><th className="n">متأخر</th><th className="n">إجمالي مطلوب</th></tr></thead>
          <tbody>{sup.map((s, i) => <tr key={s.supplier}>
            <td style={{ color: C.muted }}>{i + 1}</td><td><b>{s.supplier}</b>{s.oldest > 0 ? <div style={{ fontSize: "8.5pt", color: C.muted }}>أقدم أوردر {s.oldest} يوم</div> : null}</td>
            <td className="n" style={{ color: C.muted }}>{s.orders}</td>
            <td className="n" style={{ color: s.collected ? C.amber : C.muted, fontWeight: s.collected ? 700 : 400 }}>{s.collected ? k(s.collected) : "—"}</td>
            <td className="n" style={{ color: s.late ? C.red : C.muted, fontWeight: s.late ? 700 : 400 }}>{s.late || "—"}</td>
            <td className="n" style={{ fontWeight: 800, color: C.navy }}>{k(s.open)}</td></tr>)}</tbody>
          <tfoot><tr><td /><td>الإجمالي ({sup.length} مورد)</td><td className="n">{sup.reduce((a, s) => a + s.orders, 0)}</td><td className="n" style={{ color: C.amber }}>{k(sup.reduce((a, s) => a + s.collected, 0))}</td><td className="n" style={{ color: C.red }}>{sup.reduce((a, s) => a + s.late, 0)}</td><td className="n" style={{ color: C.navy }}>{k(sup.reduce((a, s) => a + s.open, 0))}</td></tr></tfoot>
        </table>}

      <div style={{ marginTop: 18 }}>
        <b style={{ fontSize: "12pt" }}>الأوردرات المفتوحة</b>
        {!open.length ? <p style={{ color: C.muted, padding: 12 }}>مفيش.</p> :
          <table style={{ marginTop: 6 }}><thead><tr><th>المورد ← العميل</th><th>التاريخ</th><th>فاتورة</th><th>الحالة</th><th className="n">المطلوب</th></tr></thead>
            <tbody>{open.map(r => [<tr key={r.id}>
              <td><b>{r.supplier}</b> ← {r.client}</td><td>{r.order_date}{r.late ? <span style={{ color: C.red }}> · {r.age}ي</span> : ""}</td><td dir="ltr" style={{ textAlign: "right" }}>{r.ref || "—"}</td>
              <td style={{ color: r.status === "collected" ? C.amber : r.status === "settled" ? C.green : C.muted }}>{STATUS_LABEL[r.status]}{r.short > 0 ? " (باقي)" : ""}</td>
              <td className="n" style={{ fontWeight: 700, color: C.navy }}>{k(r.open)}</td></tr>,
              withItems ? <tr key={`${r.id}i`}><td colSpan={5} style={{ padding: "2px 8px 8px", borderBottom: `1px solid ${C.border}` }}>
                <table style={{ width: "100%" }}><tbody>{r.items.map((it, j) => <tr key={j}><td style={{ border: 0, padding: "2px 8px", fontSize: "9pt", color: C.muted }}>{it.item}</td>
                  <td style={{ border: 0, padding: "2px 8px", fontSize: "9pt", color: C.muted }} className="n">{it.qty} × ({k(it.client_price)}−{k(it.my_price)})</td>
                  <td style={{ border: 0, padding: "2px 8px", fontSize: "9pt" }} className="n">{k(lineAmount(it))}</td></tr>)}</tbody></table></td></tr> : null]).flat()}</tbody>
          </table>}
      </div>

      <div style={{ marginTop: 18, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontSize: "8.5pt", color: C.muted }}>
        المقاصة بتتسجل في دفترة؛ المبالغ هنا هي اللي لسه ما اتخصمتش من حساب المورد. أرصدة الموردين{sync ? ` (آخر مزامنة ${fmt(sync, { dateStyle: "short", timeStyle: "short" })})` : ""} في تبويب الموردين بتكون اتخصم منها المقاصات اللي تمت.
      </div>
    </div>
  </div>;
}
