import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { monthEnd } from "@/lib/collections";
import { query } from "@/lib/db";
import PrintBar from "./PrintBar";

export const dynamic = "force-dynamic";
const k = (n: number | null | undefined) => n === null || n === undefined ? "—" : Math.round(n).toLocaleString("en-US");
const C = { ink: "#16232b", muted: "#5f7177", navy: "#10484f", red: "#b42318", amber: "#b7791f", green: "#1e7a5a", border: "#e3ecec", soft: "#f3faf9" };
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const mLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const prevMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 2, 1)); return d.toISOString().slice(0, 7); };
const SEL = /^20\d\d-(0[1-9]|1[0-2])$/;

/** Printable monthly report (A4): P&L, receivables/payables, VAT, compared to last month, with a close checklist. */
export default async function MonthReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await getCurrentUser())) redirect("/login");
  const sp = await searchParams;
  const today = riyadhToday();
  const m = SEL.test(sp.m || "") ? sp.m! : today.slice(0, 7);
  const end = m === today.slice(0, 7) ? today : monthEnd(m);
  const pm = prevMonth(m);
  const inp = await loadInput(today);
  const fin = computeFinance(inp, `${m}-01`, end);
  const prev = computeFinance(inp, `${pm}-01`, monthEnd(pm));
  const sync = (await query<{ finished_at: string | null }>("SELECT finished_at::text FROM daftra_sync WHERE id=1").catch(() => ({ rows: [] }))).rows[0]?.finished_at;
  const fmt = (x: Date | string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone: "Asia/Riyadh", ...o }).format(new Date(x));
  const K = fin.kpi, P = prev.kpi;
  const delta = (now: number, before: number) => before === 0 ? null : Math.round((now - before) / Math.abs(before) * 100);
  const row = (label: string, now: number | null, before: number | null, inverse = false) => ({ label, now, before, d: now !== null && before !== null ? delta(now, before) : null, inverse });
  const pnl = [
    row("صافي المبيعات", K.sales, P.sales), row("تكلفة البضاعة المباعة", K.cogs, P.cogs, true), row("مجمل الربح", K.gross, P.gross),
    row("المصروفات التشغيلية", K.opex, P.opex, true), row("إيرادات أخرى", K.other_income, P.other_income), row("صافي الربح", K.net, P.net),
  ];
  // close-readiness checklist for the month
  const purCount = inp.purchases.filter(d => d.date >= `${m}-01` && d.date <= end).length;
  const checks: Array<[boolean, string, string]> = [
    [K.invoices > 0, "مبيعات الشهر", `${K.invoices} فاتورة بيع`],
    [K.opex > 0, "مصروفات الشهر متسجلة", K.opex > 0 ? `${k(K.opex)} ر.س` : "مفيش مصروفات — الرواتب والإيجار اتسجلوا؟"],
    [purCount > 0, "فواتير الشراء", `${purCount} فاتورة شراء`],
    [K.cost_coverage >= 90, "تكلفة المبيعات معروفة", `${Math.round(K.cost_coverage)}% من المبيعات`],
  ];
  const ready = checks.every(c => c[0]);

  const tiles: Array<[string, number | null, string, number | null]> = [["صافي الربح", K.net, K.net < 0 ? C.red : C.green, P.net], ["صافي المبيعات", K.sales, C.navy, P.sales],
    ["المصروفات", K.opex, C.amber, P.opex], ["ضريبة مستحقة (تقديري)", K.vat_payable, C.ink, P.vat_payable]];

  return <div dir="rtl" className="report-root">
    <style>{`
      .report-root { background: #e9eef0; min-height: 100vh; padding: 24px 12px; color: ${C.ink}; }
      .sheet { background: #fff; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 15mm; box-shadow: 0 10px 40px rgba(0,0,0,.12); font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; }
      .sheet h1 { font-family: 'Alexandria', sans-serif; }
      .sheet table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
      .sheet th { background: ${C.soft}; color: ${C.muted}; font-weight: 600; font-size: 9pt; text-align: right; padding: 6px 8px; }
      .sheet td { padding: 7px 8px; border-bottom: 1px solid ${C.border}; text-align: right; }
      .sheet .n { font-variant-numeric: tabular-nums; text-align: left; }
      @page { size: A4; margin: 0; }
      @media print { .report-root { background: #fff; padding: 0; } .sheet { box-shadow: none; margin: 0; width: auto; min-height: auto; } .no-print { display: none !important; } }
      @media (max-width: 820px) { .sheet { width: 100%; padding: 18px; } }
    `}</style>
    <PrintBar back="/" />
    <div className="sheet">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div>
          <div style={{ fontSize: "10pt", fontWeight: 600, color: C.navy }}>Elite Skin · المتابعة المالية</div>
          <h1 style={{ fontSize: "20pt", fontWeight: 800, margin: "4px 0" }}>التقرير الشهري — {mLabel(m)}</h1>
          <div style={{ fontSize: "10pt", color: C.muted }}>مقارنة بـ {mLabel(pm)}{end !== monthEnd(m) ? ` · لحد ${end} (الشهر لسه ما خلصش)` : ""}</div>
        </div>
        <div style={{ fontSize: "9pt", color: C.muted, textAlign: "left" }}>اتطبع {fmt(new Date(), { dateStyle: "medium", timeStyle: "short" })}</div>
      </div>
      <div style={{ height: 2, background: C.navy, margin: "12px 0 14px" }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
        {tiles.map(([l, v, c, b]) => { const dd = v !== null && b !== null && b !== 0 ? Math.round((v - b) / Math.abs(b) * 100) : null;
          return <div key={l} style={{ background: C.soft, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px" }}>
            <div style={{ fontSize: "9pt", fontWeight: 600, color: C.muted }}>{l}</div>
            <div className="n" style={{ fontSize: "15pt", fontWeight: 800, color: c, textAlign: "right" }}>{k(v)}</div>
            {dd !== null && <div style={{ fontSize: "8.5pt", color: C.muted, textAlign: "right" }}>{dd >= 0 ? "▲" : "▼"} {Math.abs(dd)}% عن الشهر اللي فات</div>}</div>; })}
      </div>

      <b style={{ fontSize: "12.5pt" }}>قائمة الدخل</b>
      <table style={{ marginTop: 6, marginBottom: 16 }}><thead><tr><th>البند</th><th className="n">{mLabel(m).split(" ")[0]}</th><th className="n">{mLabel(pm).split(" ")[0]}</th><th className="n">التغيّر</th></tr></thead>
        <tbody>{pnl.map(r => { const bold = r.label === "صافي الربح" || r.label === "مجمل الربح";
          return <tr key={r.label}><td style={{ fontWeight: bold ? 800 : 400 }}>{r.label}</td>
            <td className="n" style={{ fontWeight: bold ? 800 : 600, color: bold && (r.now ?? 0) < 0 ? C.red : C.ink }}>{k(r.now)}</td>
            <td className="n" style={{ color: C.muted }}>{k(r.before)}</td>
            <td className="n" style={{ color: r.d === null ? C.muted : (r.d >= 0) !== r.inverse ? C.green : C.red }}>{r.d === null ? "—" : `${r.d >= 0 ? "+" : ""}${r.d}%`}</td></tr>; })}</tbody>
      </table>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
        <div><b style={{ fontSize: "11.5pt" }}>اللي ليك وعليك (لحد تاريخه)</b>
          <table style={{ marginTop: 6 }}><tbody>
            <tr><td>ليك عند العملاء</td><td className="n" style={{ fontWeight: 700 }}>{k(K.ar)}</td></tr>
            <tr><td>منها متأخر</td><td className="n" style={{ color: C.red }}>{k(K.ar_overdue)}</td></tr>
            <tr><td>عليك للموردين</td><td className="n" style={{ fontWeight: 700 }}>{k(K.ap)}</td></tr>
            <tr><td>المحصّل في الشهر</td><td className="n" style={{ color: C.green }}>{k(K.collected)}</td></tr>
          </tbody></table></div>
        <div><b style={{ fontSize: "11.5pt" }}>الضريبة</b>
          <table style={{ marginTop: 6 }}><tbody>
            <tr><td>ضريبة المبيعات</td><td className="n">{k(K.vat_out)}</td></tr>
            <tr><td>ضريبة المشتريات والمصروفات</td><td className="n">{k(K.vat_in)}</td></tr>
            <tr><td style={{ fontWeight: 700 }}>صافي المستحق (تقديري)</td><td className="n" style={{ fontWeight: 800, color: C.navy }}>{k(K.vat_payable)}</td></tr>
          </tbody></table></div>
      </div>

      <div style={{ breakInside: "avoid", border: `1px solid ${ready ? C.green : C.amber}`, borderRadius: 10, padding: "12px 14px", background: ready ? "#f0faf5" : "#fffaf0" }}>
        <b style={{ fontSize: "11.5pt", color: ready ? C.green : C.amber }}>{ready ? "✓ الشهر جاهز للإقفال" : "قبل ما تقفل الشهر — راجع ده"}</b>
        <table style={{ marginTop: 6 }}><tbody>{checks.map(([ok, label, note]) => <tr key={label}>
          <td style={{ width: 24, color: ok ? C.green : C.amber, fontWeight: 800 }}>{ok ? "✓" : "⚠"}</td>
          <td style={{ fontWeight: 600 }}>{label}</td><td style={{ color: C.muted }}>{note}</td></tr>)}</tbody></table>
      </div>

      <div style={{ marginTop: 16, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontSize: "8.5pt", color: C.muted }}>
        الأرقام من دفترة{sync ? ` (آخر مزامنة ${fmt(sync, { dateStyle: "short", timeStyle: "short" })})` : ""}. صافي الربح والمصروفات من بداية الحسابات المحددة. الضريبة تقديرية. المديونيات لحد تاريخ الطباعة.
      </div>
    </div>
  </div>;
}
