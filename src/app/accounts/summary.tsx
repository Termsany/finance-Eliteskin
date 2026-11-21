"use client";
import type { AccData, Open, Tab } from "./AccountsHub";
import { sar, pct, C, Card, MonthChart } from "./kit";
import { addDays } from "@/lib/fmt";

/** % change against the previous period of the same length (null when there is nothing to compare). */
const change = (now: number, before: number | undefined | null) => before === undefined || before === null || before === 0 ? null : (now - before) / Math.abs(before) * 100;

export function Tile({ label, value, sub, tone, onClick, hint }: { label: string; value: string; sub?: React.ReactNode; tone?: "good" | "bad" | "warn"; onClick?: () => void; hint?: string }) {
  const El = onClick ? "button" : "div";
  return <El type={onClick ? "button" : undefined} onClick={onClick} title={hint} className={`group min-w-0 rounded-[22px] border border-[var(--border)] bg-[var(--card)] px-3.5 py-3.5 text-right sm:px-5 sm:py-4 transition ${onClick ? "hover:-translate-y-0.5 hover:border-[var(--sky-border)] hover:shadow-lg" : ""}`}>
    <div className="text-[13px] font-semibold text-[var(--muted)]">{label}</div>
    <div className={`mt-1 break-words text-[19px] font-extrabold leading-tight tabular-nums sm:text-[26px] ${tone === "bad" ? "text-red-700" : "text-[var(--ink)]"}`}>{value}</div>
    {sub && <div className={`mt-1 text-[12px] font-medium ${tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-[var(--muted)]"}`}>{sub}</div>}
  </El>;
}
export const Delta = ({ v, inverse = false }: { v: number | null; inverse?: boolean }) => v === null ? null
  : <span className={(v >= 0) !== inverse ? "text-emerald-700" : "text-red-700"}>{v >= 0 ? "▲" : "▼"} {Math.abs(Math.round(v))}%</span>;

const LV: Record<string, [string, string]> = { danger: ["bg-red-50", "bg-red-600"], warn: ["bg-amber-50", "bg-amber-500"], info: ["bg-[var(--sky-light)]", "bg-[var(--navy)]"] };

export function Summary({ d, go, open, pickMonth, askAi }: { d: AccData; go: (t: Tab) => void; open: Open; pickMonth: (m: string) => void; askAi?: (q: string) => void }) {
  const k = d.kpi, p = d.prev;
  const week = addDays(d.today, 7);
  const apWeek = d.ap.open.filter(o => o.due <= week).reduce((s, o) => s + o.unpaid, 0);
  const costs = d.monthly.map(m => ({ ...m, costs: Number(m.cogs) + Number(m.opex) }));
  const att = d.attention || [];
  const c = d.collect;
  const bud = d.budget;
  return <div className="space-y-4">
    {bud && <BudgetCard b={bud} go={go} />}
    {c && <button type="button" onClick={() => go("collections")} className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 rounded-[22px] border border-[var(--border)] bg-[var(--card)] px-5 py-4 text-right transition hover:border-[var(--sky-border)] hover:shadow-lg">
      <span><span className="block text-[13px] font-semibold text-[var(--muted)]">مطلوب تحصيله الشهر ده</span><b className="text-[24px] font-extrabold tabular-nums text-[var(--ink)]">{sar(c.required)}</b></span>
      <span className="text-[13px]"><b className="block text-red-700">{sar(c.overdue)} متأخر</b><span className="text-[var(--muted)]">عند {c.overdue_parties} عميل</span></span>
      <span className="text-[13px]"><b className="block text-amber-700">{sar(c.due)} في ميعاده</b><span className="text-[var(--muted)]">لحد {c.end}{c.week > 0 ? ` · ${sar(c.week)} الأسبوع ده` : ""}</span></span>
      <span className="text-[13px]"><b className="block text-emerald-700">{sar(c.done)} اتحصّل</b><span className="text-[var(--muted)]">من أول الشهر</span></span>
      <span className="mr-auto rounded-full bg-[var(--navy)] px-3.5 py-2 text-xs font-bold text-white">افتح التحصيل ‹</span>
    </button>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="صافي الربح" value={sar(k.net)} tone={k.net < 0 ? "bad" : undefined} onClick={() => go("pnl")}
        sub={<>هامش {pct(k.net_margin)}{change(k.net, p?.net) !== null && <> · <Delta v={change(k.net, p?.net)} /> عن الفترة اللي فاتت</>}</>} />
      <Tile label="ليك عند العملاء" value={sar(d.ar.total)} tone={undefined} onClick={() => go("clients")}
        sub={d.ar.overdue > 0 ? <span className="text-red-700">منها {sar(d.ar.overdue)} متأخر</span> : "مفيش متأخرات"} hint="شامل الضريبة، لحد النهارده — مش مرتبط بالفترة" />
      <Tile label="عليك للموردين" value={sar(d.ap.total)} onClick={() => go(d.offsets && d.offsets.open > 0 ? "offsets" : "suppliers")}
        sub={d.offsets && d.offsets.open > 0 ? <span className="text-emerald-700">ليك مقاصة {sar(d.offsets.open)} · الصافي {sar(d.ap.total - d.offsets.open)}</span> : apWeek > 0 ? <span className="text-amber-700">منها {sar(apWeek)} مستحقة الأسبوع ده</span> : d.ap.total ? "مفيش مستحق الأسبوع ده" : "مفيش مستحقات"} />
      <Tile label="المصروفات" value={sar(k.opex)} onClick={() => go("expenses")}
        sub={<>{k.sales ? `${pct(k.opex / k.sales * 100)} من المبيعات` : "—"}{change(k.opex, p?.opex) !== null && <> · <Delta v={change(k.opex, p?.opex)} inverse /></>}</>} />
    </div>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="المبيعات والتكاليف وصافي الربح شهر بشهر" hint="اضغط على أي شهر عشان تفتح أرقامه.">
        {costs.length < 3 && <div className="mb-2 rounded-xl bg-[var(--sky-light)] px-3 py-2 text-[11.5px] text-[var(--muted)]">اختار «آخر 3 شهور» أو أكتر من فوق عشان تشوف الاتجاه.</div>}
        <MonthChart data={costs} series={[{ key: "sales", label: "المبيعات", color: C.mint }, { key: "costs", label: "التكاليف", color: "#9aa8aa" }, { key: "net", label: "صافي الربح", color: C.green }]} onPick={pickMonth} height={190} />
      </Card>
      <Card title="محتاج انتباهك النهارده">
        {!att.length && <div className="rounded-xl bg-emerald-50 p-4 text-center text-sm font-bold text-emerald-800">كله تمام — مفيش حاجة عاجلة 👍</div>}
        <div className="space-y-2">{att.map((a, i) => { const [box, dot] = LV[a.level] || LV.info; return <div key={i} className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 ${box}`}>
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
          <div className="min-w-0 flex-1"><div className="text-[14px] font-bold text-[var(--ink)]">{a.title}</div><div className="text-[12px] text-[var(--muted)]">{a.text}</div></div>
          <div className="flex shrink-0 gap-1.5">
            {askAi && <button type="button" onClick={() => askAi(a.title)} className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--navy)]">اسأل ‹</button>}
            <button type="button" onClick={() => a.party && a.kind ? open(a.kind, a.party) : go(a.tab as Tab)} className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-bold text-[var(--navy)]">افتح ‹</button>
          </div>
        </div>; })}</div>
      </Card>
    </div>

    <Recommendations advice={d.advice || []} go={go} />

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Balances title="أكبر أرصدة العملاء" rows={d.ar.parties.slice(0, 6)} onPick={n => open("client", n)} more={() => go("clients")} />
      <Balances title="أكبر أرصدة الموردين" rows={d.ap.parties.slice(0, 6)} onPick={n => open("supplier", n)} more={() => go("suppliers")} />
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="صافي المبيعات" value={sar(k.sales)} sub={<>{k.invoices} فاتورة · {k.clients} عميل{change(k.sales, p?.sales) !== null && <> · <Delta v={change(k.sales, p?.sales)} /></>}</>} />
      <Tile label="مجمل الربح" value={sar(k.gross)} sub={`هامش ${pct(k.gross_margin)}`} />
      <Tile label="المحصّل من العملاء" value={sar(k.collected)} sub="الفلوس اللي دخلت فعلاً في الفترة" />
      <Tile label="ضريبة مستحقة (تقديري)" value={sar(k.vat_payable)} onClick={() => go("vat")} sub="ضريبة المبيعات ناقص المشتريات والمصروفات" />
    </div>
  </div>;
}

function Meter({ label, t, kind, go }: { label: string; t: import("@/lib/budget").Target; kind: Tab; go: (t: Tab) => void }) {
  if (t.target === null) return <button type="button" onClick={() => go(kind)} className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-3 text-right text-[13px] text-[var(--muted)] transition hover:border-[var(--sky-border)]">
    <span className="font-bold text-[var(--ink)]">{label}: {sar(t.actual)}</span><span className="block text-[11.5px]">محدّدش هدف — اضغط لضبطه في الإعدادات</span></button>;
  const pct = Math.min(100, t.pct || 0), expected = t.expected_by_now || 0;
  const ok = t.on_track;
  return <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
    <div className="flex items-baseline justify-between gap-2"><span className="text-[13px] font-bold text-[var(--ink)]">{label}</span>
      <span className={`text-[11.5px] font-bold ${ok ? "text-emerald-700" : "text-amber-700"}`}>{ok ? "ماشي على الهدف" : "تحت المطلوب"}</span></div>
    <div className="mt-1 flex items-baseline gap-1.5"><b className="text-[20px] tabular-nums text-[var(--navy)]">{sar(t.actual)}</b><span className="text-[12px] text-[var(--muted)]">من {sar(t.target)} · {Math.round(t.pct || 0)}%</span></div>
    <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--bg)]">
      <div className={`h-full rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
      <div className="absolute inset-y-0 w-0.5 bg-[var(--navy)]" style={{ right: `${Math.min(100, t.target ? expected / t.target * 100 : 0)}%` }} title="المفروض توصله لحد النهارده" />
    </div>
    <div className="mt-1.5 text-[11px] text-[var(--muted)]">المفروض لحد النهارده {sar(expected)} · المتوقع آخر الشهر <b className={t.projected && t.target && t.projected >= t.target ? "text-emerald-700" : "text-[var(--ink)]"}>{sar(t.projected)}</b></div>
  </div>;
}

function BudgetCard({ b, go }: { b: import("@/lib/budget").Budget; go: (t: Tab) => void }) {
  const be = b.breakeven;
  return <Card title={`هدف الشهر ونقطة التعادل · يوم ${b.day} من ${b.days}`} hint="الأرقام عن الشهر الحالي. الخط الغامق في الشريط = المفروض توصله لحد النهارده لو ماشي بالتساوي.">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Meter label="مبيعات الشهر" t={b.sales} kind="pnl" go={go} />
      <Meter label="صافي ربح الشهر" t={b.profit} kind="pnl" go={go} />
      <div className={`rounded-2xl border px-4 py-3 ${be.reached ? "border-emerald-200 bg-emerald-50" : "border-[var(--border)] bg-[var(--card)]"}`}>
        <div className="flex items-baseline justify-between gap-2"><span className="text-[13px] font-bold text-[var(--ink)]">نقطة التعادل</span>
          <span className={`text-[11.5px] font-bold ${be.reached ? "text-emerald-700" : "text-amber-700"}`}>{be.reached ? "عدّيتها ✓" : "لسه"}</span></div>
        {be.sales === null ? <div className="mt-1 text-[12px] text-[var(--muted)]">محتاج مبيعات بهامش ربح معروف عشان أحسبها.</div>
          : <><div className="mt-1 flex items-baseline gap-1.5"><b className="text-[20px] tabular-nums text-[var(--navy)]">{sar(be.sales)}</b><span className="text-[12px] text-[var(--muted)]">تغطي التكاليف</span></div>
            <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--bg)]"><div className={`h-full rounded-full ${be.reached ? "bg-emerald-500" : "bg-[var(--sky)]"}`} style={{ width: `${Math.min(100, be.covered_pct || 0)}%` }} /></div>
            <div className="mt-1.5 text-[11px] text-[var(--muted)]">{be.reached ? `بعت فوقها — كل بيعة بعد كده بتكسّبك` : `باقي ${sar(be.remaining)} توصلها (غطّيت ${Math.round(be.covered_pct || 0)}%)`}</div></>}
      </div>
    </div>
  </Card>;
}

type Advice = { level: "danger" | "warn" | "good" | "info"; title: string; text: string; tab?: string };
const ADOT: Record<string, string> = { danger: "bg-red-500", warn: "bg-amber-500", good: "bg-emerald-500", info: "bg-[var(--navy)]" };
/** The advisor's standing recommendations (strategy, not today's fires) — top few, each links to where to act. */
function Recommendations({ advice, go }: { advice: Advice[]; go: (t: Tab) => void }) {
  // actionable first (danger/warn), then info; keep a "good" only if nothing else
  const order = { danger: 0, warn: 1, info: 2, good: 3 } as const;
  const list = [...advice].sort((a, b) => order[a.level] - order[b.level]).slice(0, 4);
  if (!list.length) return null;
  return <Card title="توصيات المستشار المالي" hint="نصائح على مستوى الشركة بتتحدّث مع كل مزامنة — مش مشاكل اليوم العاجلة، لكن اللي يخلّي أرباحك أحسن على المدى.">
    <div className="grid gap-2.5 sm:grid-cols-2">{list.map((a, i) => <div key={i} className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-3">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ADOT[a.level] || ADOT.info}`} />
      <div className="min-w-0 flex-1"><div className="text-[13.5px] font-bold text-[var(--ink)]">{a.title}</div><div className="mt-0.5 text-[12px] leading-5 text-[var(--muted)]">{a.text}</div>
        {a.tab && <button type="button" onClick={() => go(a.tab as Tab)} className="mt-1.5 text-[11.5px] font-bold text-[var(--navy)] hover:underline">افتح ‹</button>}</div>
    </div>)}</div>
  </Card>;
}

function Balances({ title, rows, onPick, more }: { title: string; rows: Array<{ name: string; unpaid: number; overdue: number; oldestDue: number }>; onPick: (n: string) => void; more: () => void }) {
  return <Card title={title} right={<button type="button" onClick={more} className="text-xs font-bold text-[var(--navy)] hover:underline">الكل ‹</button>}>
    {!rows.length ? <div className="py-4 text-center text-sm text-[var(--muted)]">مفيش أرصدة مفتوحة</div>
      : <div className="-mx-4 divide-y divide-[var(--border)]">{rows.map(r => <button key={r.name} type="button" onClick={() => onPick(r.name)} className="flex w-full items-center gap-3 px-4 py-2.5 text-right transition hover:bg-[var(--sky-light)]">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{r.name}</span>
        {r.overdue > 0 && <span className="shrink-0 text-[12px] font-bold text-red-700">{r.oldestDue} يوم</span>}
        <span className="w-28 shrink-0 text-left text-sm font-extrabold tabular-nums">{sar(r.unpaid)}</span>
      </button>)}</div>}
  </Card>;
}
