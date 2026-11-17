import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { cashPlan, planRows } from "@/lib/cash-plan";
import { loadPlanInputs, readOpts } from "@/lib/cash-plan-data";
import { monthLabel } from "@/lib/collections";
import PrintBar from "./PrintBar";

export const dynamic = "force-dynamic";
const k = (n: number | null | undefined) => n === null || n === undefined ? "—" : Math.round(n).toLocaleString("en-US");
const C = { ink: "#16232b", muted: "#5f7177", navy: "#10484f", red: "#b42318", amber: "#b7791f", green: "#1e7a5a", border: "#e3ecec", soft: "#f3faf9" };

/** Printable cash plan (A4): the gap, the sales needed, the smallest financing per term, and the plan month by month. */
export default async function PlanReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await getCurrentUser())) redirect("/login");
  const sp = await searchParams;
  const p = await loadPlanInputs();
  let o = readOpts(p, sp);
  let plan = cashPlan(p, o);
  // these sales can't repay any financing: print the suggested plan (sales raised to the level that works) instead
  if (plan.suggestion?.raised) { o = { ...o, sales: plan.suggestion.sales }; plan = cashPlan(p, o); }
  const sel = plan.terms.find(t => t.n === Number(sp.term) && t.feasible) || plan.terms.find(t => t.n === (plan.suggestion?.n ?? plan.recommended)) || null;
  const fin = sel && sel.needed && sel.feasible ? sel : null;
  const rows = planRows(p, o, o.sales, fin ? { F: fin.F, n: fin.n, f0: fin.f0 } : null, fin ? fin.H : 12);
  const fmt = (x: Date, op: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone: "Asia/Riyadh", ...op }).format(x);

  return <div dir="rtl" className="report-root">
    <style>{`
      .report-root { background: #e9eef0; min-height: 100vh; padding: 24px 12px; color: ${C.ink}; }
      .sheet { background: #fff; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 13mm 14mm; box-shadow: 0 10px 40px rgba(0,0,0,.12); font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; }
      .sheet h1 { font-family: 'Alexandria', sans-serif; }
      .sheet table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
      .sheet th { background: ${C.soft}; color: ${C.muted}; font-weight: 600; font-size: 8.5pt; text-align: right; padding: 5px 6px; }
      .sheet td { padding: 5px 6px; border-bottom: 1px solid ${C.border}; text-align: right; }
      .sheet tr { break-inside: avoid; }
      .sheet .n { font-variant-numeric: tabular-nums; text-align: left; }
      @page { size: A4; margin: 0; }
      @media print { .report-root { background: #fff; padding: 0; } .sheet { box-shadow: none; margin: 0; width: auto; min-height: auto; } .no-print { display: none !important; } }
      @media (max-width: 820px) { .sheet { width: 100%; padding: 18px; } }
    `}</style>
    <PrintBar back="/?tab=cash" />
    <div className="sheet">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div>
          <div style={{ fontSize: "10pt", fontWeight: 600, color: C.navy }}>Elite Skin · المتابعة المالية</div>
          <h1 style={{ fontSize: "19pt", fontWeight: 800, margin: "4px 0" }}>خطة السيولة {fin ? `— تمويل ${k(fin.F)} ر.س على ${fin.n} شهر` : ""}</h1>
          <div style={{ fontSize: "10pt", color: C.muted }}>مبيعات {k(o.sales)} ر.س شهرياً · تحصيل {Math.round(o.collect * 100)}% من الفواتير المفتوحة · رصيد البداية {k(p.opening)} ر.س{p.opening_as_of ? ` (${p.opening_as_of})` : ""}</div>
        </div>
        <div style={{ fontSize: "9pt", color: C.muted, textAlign: "left" }}>اتطبع {fmt(new Date(), { dateStyle: "medium", timeStyle: "short" })}</div>
      </div>
      <div style={{ height: 2, background: C.navy, margin: "10px 0 12px" }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        {([["العجز المتوقع بدون حل", plan.gap, plan.gap ? C.red : C.green], ["أقل رصيد متوقع", plan.lowest.balance, plan.lowest.balance < 0 ? C.red : C.ink],
          ["التمويل المقترح", fin?.F ?? 0, C.navy], ["القسط الشهري", fin?.installment ?? 0, C.amber]] as Array<[string, number, string]>).map(([l, v, c]) =>
          <div key={l} style={{ background: C.soft, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px" }}>
            <div style={{ fontSize: "8.5pt", fontWeight: 600, color: C.muted }}>{l}</div>
            <div className="n" style={{ fontSize: "14pt", fontWeight: 800, color: c, textAlign: "right" }}>{k(v)}</div></div>)}
      </div>

      <div style={{ fontSize: "10pt", lineHeight: 1.7, marginBottom: 10 }}>
        {plan.needs_help ? <>من غير حل، الرصيد بينزل تحت {o.buffer ? "الاحتياطي" : "الصفر"} في <b>{plan.first_short}</b> ويوصل <b>{k(plan.lowest.balance)} ر.س</b> في {plan.lowest.label}. </> : <>مفيش عجز متوقع بالمبيعات دي. </>}
        {plan.no_finance.possible ? <>من غير تمويل: محتاج مبيعات <b>{k(plan.no_finance.sales)} ر.س</b> شهرياً. </> : <>المبيعات لوحدها مش هتلحق العجز في {plan.no_finance.blocked.slice(0, 2).map(monthLabel).join(" و ")} (التحصيل بعد {o.lagIn} شهر). </>}
        {!fin && plan.suggestion && <>الخطة المقترحة: مبيعات <b>{k(plan.suggestion.sales)} ر.س</b> شهرياً + تمويل <b>{k(plan.suggestion.F)} ر.س</b> على {plan.suggestion.n} شهر بقسط {k(plan.suggestion.installment)} ر.س. </>}
        {fin && <>بالتمويل: استلام <b>{k(fin.F)} ر.س</b> في {fin.start}، وسداد {fin.n} قسط × <b>{k(fin.installment)} ر.س</b> من {fin.first_payment} لـ {fin.last_payment} (تكلفة التمويل {k(fin.cost)} ر.س بنسبة {o.rate}% سنوياً). المبيعات اللي تشيل المصاريف والقسط: <b>{k(fin.carry_sales)} ر.س</b> شهرياً.</>}
      </div>

      {plan.needs_help && <><b style={{ fontSize: "11pt" }}>أقل تمويل لكل مدة</b>
        <table style={{ marginTop: 5, marginBottom: 12 }}><thead><tr><th>المدة</th><th className="n">التمويل</th><th className="n">القسط</th><th className="n">التكلفة</th><th className="n">مبيعات تشيل القسط</th></tr></thead>
          <tbody>{plan.terms.map(t => <tr key={t.n} style={{ background: t.n === fin?.n ? "#eaf6f4" : undefined }}>
            <td style={{ fontWeight: 700 }}>{t.n} شهر{t.n === plan.recommended ? " (الأنسب)" : ""}</td>
            {t.feasible ? <><td className="n" style={{ fontWeight: 800, color: C.navy }}>{k(t.F)}</td><td className="n">{k(t.installment)}</td><td className="n" style={{ color: C.muted }}>{k(t.cost)}</td><td className="n">{k(t.carry_sales)}</td></>
              : <td colSpan={4} style={{ color: C.amber }}>{t.fix ? `مع مبيعات ${k(t.fix.sales)} شهرياً: تمويل ${k(t.fix.F)} · قسط ${k(t.fix.installment)}` : "المصاريف أكبر من المبيعات"}</td>}</tr>)}</tbody></table></>}

      <b style={{ fontSize: "11pt" }}>الخطة شهر بشهر</b>
      <table style={{ marginTop: 5 }}><thead><tr><th>الشهر</th><th className="n">مبيعات</th><th className="n">تحصيل</th><th className="n">موردين</th><th className="n">مصاريف</th><th className="n">ضريبة</th><th className="n">تمويل</th><th className="n">قسط</th><th className="n">الرصيد</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.m}>
          <td style={{ fontWeight: 600 }}>{r.label}</td><td className="n">{r.sales ? k(r.sales) : "—"}</td><td className="n" style={{ color: C.green }}>{k(r.collections)}</td>
          <td className="n" style={{ color: C.red }}>{r.suppliers ? k(r.suppliers) : "—"}</td><td className="n">{k(r.expenses)}</td><td className="n">{r.vat ? k(r.vat) : "—"}</td>
          <td className="n" style={{ fontWeight: 700, color: C.navy }}>{r.loan_in ? k(r.loan_in) : "—"}</td><td className="n">{r.installment ? k(r.installment) : "—"}</td>
          <td className="n" style={{ fontWeight: 800, color: r.balance < o.buffer ? C.red : C.navy }}>{k(r.balance)}</td></tr>)}</tbody></table>

      <div style={{ marginTop: 12, paddingTop: 6, borderTop: `1px solid ${C.border}`, fontSize: "8pt", color: C.muted }}>
        تقديرات مبنية على: متوسط المبيعات {k(p.base.sales)} ر.س شهرياً، تكلفة البضاعة {Math.round(p.base.cogs_ratio * 100)}% من المبيعات، مصاريف {k(p.base.opex * (1 - o.cut / 100))} ر.س شهرياً{o.cut ? ` (بعد تخفيض ${o.cut}%)` : ""}، تحصيل {Math.round(o.collect * 100)}% من الفواتير المفتوحة مهما كان تأخيرها، والمبيعات الجديدة بتتحصّل كاملة بعد {o.lagIn} شهر. المبالغ شاملة الضريبة حيث بتتحرك الفلوس. التمويل بقسط ثابت{o.grace ? ` بعد ${o.grace} شهر سماح` : ""}.
      </div>
    </div>
  </div>;
}
