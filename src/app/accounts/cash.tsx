"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { CashForecastResult, VatFiling } from "@/lib/fin-cash";
import type { Tab } from "./AccountsHub";
import { sar, short, C, Hint, Kpi, Card, Table } from "./kit";
import { CashPlan } from "./cash-plan";

type F = CashForecastResult;
type BalLog = { week_start: string; actual: number; forecast: number | null };
type Data = {
  today: string; cash_balance: number | null; cash_as_of: string | null;
  vat_period: number; vat_filing: VatFiling; collect_pct: number;
  balance_log: BalLog[];
  forecast: F;
};
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

type SubTab = "forecast" | "plan" | "accuracy";

/* ─── Chart: balance line + in/out bars + safety line ─── */
function ForecastChart({ rows, opening, safetyLine }: { rows: F["rows"]; opening: number; safetyLine: number }) {
  const [h, setH] = useState<number | null>(null);
  const allVals = [opening, ...rows.map(r => r.balance), ...rows.map(r => r.in_ar + r.in_new), ...rows.map(r => -(r.out_ap + r.out_fixed + r.out_var + r.out_vat + r.out_cogs_new))];
  const max = Math.max(1, ...allVals);
  const min = Math.min(0, ...allVals);
  const span = max - min || 1;
  const toY = (v: number) => (1 - (v - min) / span) * 100;
  const zeroY = toY(0);
  const safetyY = toY(safetyLine);
  const balPoints = rows.map((r, i) => `${(i + 0.5) / rows.length * 100},${toY(r.balance)}`).join(" ");

  return <div>
    <div className="mb-1.5 h-5 text-xs text-[var(--muted)]">
      {h !== null ? <span>
        <b className="text-[var(--navy)]">{dm(rows[h].from)}–{dm(rows[h].to)}</b>{" "}
        داخل <b className="text-emerald-700">{sar(rows[h].in_ar + rows[h].in_new)}</b>{" "}
        خارج <b className="text-red-700">{sar(rows[h].out_ap + rows[h].out_fixed + rows[h].out_var + rows[h].out_vat + rows[h].out_cogs_new)}</b>{" "}
        الرصيد <b className={rows[h].balance < 0 ? "text-red-700" : "text-[var(--navy)]"}>{sar(rows[h].balance)}</b>
      </span> : "اضغط على أي أسبوع لتفاصيله"}
    </div>
    <div className="relative" style={{ height: 200 }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        {/* Zero line */}
        <line x1="0" y1={zeroY} x2="100" y2={zeroY} stroke="var(--border-strong)" strokeWidth="0.3" strokeDasharray="1.5,1" />
        {/* Safety line */}
        <line x1="0" y1={safetyY} x2="100" y2={safetyY} stroke={C.red} strokeWidth="0.3" strokeDasharray="1,1" opacity="0.5" />
        {/* In bars (green) */}
        {rows.map((r, i) => {
          const inn = r.in_ar + r.in_new;
          if (inn < 100) return null;
          const x = i / rows.length * 100 + 0.5;
          const w = 100 / rows.length * 0.35;
          return <rect key={`in-${i}`} x={x} y={toY(inn)} width={w} height={Math.max(0.3, zeroY - toY(inn))} fill={C.green} opacity={h === i ? 1 : 0.6} rx="0.3" />;
        })}
        {/* Out bars (red) */}
        {rows.map((r, i) => {
          const out = r.out_ap + r.out_fixed + r.out_var + r.out_vat + r.out_cogs_new;
          if (out < 100) return null;
          const x = (i + 0.35) / rows.length * 100 + 0.5;
          const w = 100 / rows.length * 0.35;
          return <rect key={`out-${i}`} x={x} y={zeroY} width={w} height={Math.max(0.3, toY(-out) - zeroY)} fill={C.red} opacity={h === i ? 1 : 0.5} rx="0.3" />;
        })}
        {/* Balance line */}
        <polyline points={balPoints} fill="none" stroke="var(--navy)" strokeWidth="0.6" strokeLinejoin="round" />
        {/* Balance dots */}
        {rows.map((r, i) => <circle key={i} cx={(i + 0.5) / rows.length * 100} cy={toY(r.balance)} r={h === i ? "1.2" : "0.6"} fill={r.balance < safetyLine ? C.red : "var(--navy)"} />)}
      </svg>
      {/* Hover areas */}
      <div className="absolute inset-0 flex">
        {rows.map((r, i) => <div key={i} className="h-full flex-1 cursor-pointer" onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)} />)}
      </div>
    </div>
    <div className="mt-1 flex gap-0.5">
      {rows.map(r => <span key={r.i} className="min-w-0 flex-1 truncate text-center text-[9px] text-[var(--muted)]">{dm(r.from)}</span>)}
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-[var(--muted)]">
      <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--navy)" }} />الرصيد المتوقع</span>
      <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: C.green }} />فلوس داخلة</span>
      <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: C.red }} />فلوس خارجة</span>
      <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 rounded opacity-50" style={{ background: C.red }} />حد الأمان (شهر مصاريف)</span>
    </div>
  </div>;
}

/* ─── Forecast accuracy chart ─── */
function AccuracyTab({ log }: { log: BalLog[] }) {
  if (!log.length) return <div className="rounded-2xl border border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--muted)]">
    لسه مفيش بيانات كافية — حدّث رصيدك كل أسبوع والبرنامج هيقارن التوقع بالفعلي تلقائي.
  </div>;
  const sorted = [...log].sort((a, b) => a.week_start.localeCompare(b.week_start));
  const withForecast = sorted.filter(r => r.forecast !== null);
  const accuracy = withForecast.length > 0
    ? Math.round(100 - withForecast.reduce((s, r) => s + Math.abs(r.actual - r.forecast!) / Math.max(1, Math.abs(r.actual)) * 100, 0) / withForecast.length)
    : null;
  return <div className="space-y-4">
    {accuracy !== null && <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className={`text-3xl font-extrabold ${accuracy >= 80 ? "text-emerald-700" : accuracy >= 60 ? "text-amber-700" : "text-red-700"}`}>{accuracy}%</div>
      <div><div className="text-sm font-bold text-[var(--navy)]">دقة التوقع</div><div className="text-xs text-[var(--muted)]">متوسط الفرق بين التوقع والفعلي آخر {withForecast.length} أسبوع</div></div>
    </div>}
    <Card title="سجل الرصيد الأسبوعي">
      <Table rows={sorted.map(r => ({ ...r, key: r.week_start }))} rowKey={r => r.key} cols={[
        { key: "week_start", label: "الأسبوع", className: "text-right font-bold", render: r => dm(r.week_start) },
        { key: "actual", label: "الرصيد الفعلي", render: r => <b className="text-[var(--navy)]">{sar(r.actual)}</b> },
        { key: "forecast", label: "التوقع", render: r => r.forecast !== null ? sar(r.forecast) : "—" },
        { key: "diff", label: "الفرق", render: r => r.forecast !== null ? <span className={Math.abs(r.actual - r.forecast) > r.actual * 0.1 ? "text-red-700" : "text-emerald-700"}>{sar(r.actual - r.forecast)}</span> : "—" },
      ]} />
    </Card>
  </div>;
}

/* ─── Scenario selector ─── */
type Scenario = "base" | "optimistic" | "pessimistic";
const SCENARIOS: Record<Scenario, { label: string; collectMult: number; salesMult: number; expenseMult: number }> = {
  optimistic: { label: "متفائل", collectMult: 1.1, salesMult: 1.2, expenseMult: 0.9 },
  base: { label: "عادي", collectMult: 1, salesMult: 1, expenseMult: 1 },
  pessimistic: { label: "متشائم", collectMult: 0.75, salesMult: 0.8, expenseMult: 1.1 },
};

/* ─── Main component ─── */
export function CashTab({ go }: { go: (t: Tab) => void }) {
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [inc, setInc] = useState(false);
  const [bal, setBal] = useState("");
  const [sub, setSub] = useState<SubTab>("forecast");
  const [scenario, setScenario] = useState<Scenario>("base");
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    const j = await fetch(`/api/admin/finance/cash${inc ? "?new=1" : ""}`).then(r => r.json()).catch(() => null);
    if (j?.forecast) { setD(j); setBal(j.cash_balance === null ? "" : String(j.cash_balance)); } else toast(j?.error || "تعذر تحميل السيولة", "error");
  }, [inc, toast]);
  useEffect(() => { void load(); }, [load]);

  async function saveBal() {
    const r = await fetch("/api/admin/finance/cash", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ cash_balance: Number(bal.replace(/,/g, "")) }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) toast(j?.error || "تعذر الحفظ", "error"); else { toast("اتحفظ الرصيد", "success"); await load(); }
  }

  async function saveSettings(key: string, value: unknown) {
    const r = await fetch("/api/admin/finance/cash", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ [key]: value }) });
    if (r.ok) { toast("اتحفظ", "success"); await load(); } else toast("تعذر الحفظ", "error");
  }

  if (!d) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  const sc = SCENARIOS[scenario];
  const f = useMemo(() => {
    const base = d.forecast;
    if (scenario === "base") return base;
    let bal = base.opening;
    const rows = base.rows.map(r => {
      const in_ar = Math.round(r.in_ar * sc.collectMult);
      const in_new = Math.round(r.in_new * sc.salesMult);
      const out_fixed = Math.round(r.out_fixed * sc.expenseMult);
      const out_var = Math.round(r.out_var * sc.expenseMult);
      const net = in_ar + in_new - r.out_ap - out_fixed - out_var - r.out_vat - r.out_cogs_new;
      bal += net;
      return { ...r, in_ar, in_new, out_fixed, out_var, net, balance: Math.round(bal) };
    });
    const lowest = rows.reduce((best, r, i) => r.balance < best.balance ? { balance: r.balance, week: i } : best, { balance: Infinity, week: -1 });
    const first_negative_week = rows.findIndex(r => r.balance < 0);
    return { ...base, rows, lowest, first_negative_week: first_negative_week >= 0 ? first_negative_week : null, closing: rows.length ? rows[rows.length - 1].balance : base.closing };
  }, [d.forecast, scenario, sc]);
  const a = f.assumptions, neg = f.first_negative_week;
  const stale = d.cash_as_of && (Date.parse(d.today) - Date.parse(d.cash_as_of)) / 864e5 > 7;

  // Decision banner
  const lowestWeek = f.lowest.week >= 0 ? f.rows[f.lowest.week] : null;
  const bannerText = neg !== null
    ? `السيولة هتخلص في ${dm(f.rows[neg].from)} — الرصيد هينزل لـ ${short(f.lowest.balance)} ر.س. حصّل المتأخر وأجّل اللي تقدر.`
    : f.lowest.balance < f.safety_line && lowestWeek
      ? `السيولة مغطية لكن هتنزل تحت حد الأمان في ${dm(lowestWeek.from)} — الرصيد ${short(f.lowest.balance)} ر.س مقابل حد أمان ${short(f.safety_line)} ر.س.`
      : `السيولة مريحة — أقل رصيد متوقع ${short(f.lowest.balance)} ر.س في ${lowestWeek ? dm(lowestWeek.from) : "—"}، وعندك ${f.days_of_cash ?? "—"} يوم فلوس.`;

  const bannerColor = neg !== null ? "border-red-200 bg-red-50 text-red-900"
    : f.lowest.balance < f.safety_line ? "border-amber-200 bg-amber-50 text-amber-900"
    : "border-emerald-200 bg-emerald-50 text-emerald-950";
  const bannerIcon = neg !== null ? "flag" : f.lowest.balance < f.safety_line ? "flag" : "check";
  const bannerIconColor = neg !== null ? "text-red-600" : f.lowest.balance < f.safety_line ? "text-amber-600" : "text-emerald-700";

  return <div className="space-y-4">
    {/* ── Balance input ── */}
    <Card title="رصيدك النهارده (بنك + خزنة)" hint="دفترة مش بتبعت أرصدة البنك، فاكتب رصيدك الفعلي النهارده وأنا أحسب منه السيولة. حدّثه كل أسبوع عشان نتابع دقة التوقع.">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1"><span className="text-xs text-[var(--muted)]">الرصيد بالريال</span><input value={bal} onChange={e => setBal(e.target.value)} inputMode="decimal" placeholder="مثلاً 250000" dir="ltr" className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold" /></label>
        <button type="button" onClick={() => void saveBal()} disabled={!bal || Number(bal.replace(/,/g, "")) === d.cash_balance} className="rounded-xl bg-[var(--navy)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">احفظ الرصيد</button>
        <span className="text-[11px] text-[var(--muted)]">{d.cash_as_of ? `آخر تحديث ${d.cash_as_of}` : "لسه ما اتسجلش رصيد — الحساب دلوقتي بيبدأ من صفر"}</span>
      </div>
      {stale && <p className="mt-2 rounded-xl bg-amber-50 p-2 text-[11.5px] text-amber-900 ring-1 ring-amber-200">الرصيد ده عمره أكتر من أسبوع — حدّثه عشان التوقع يبقى دقيق.</p>}
    </Card>

    {/* ── Decision banner ── */}
    <div className={`flex items-start gap-3 rounded-2xl border p-4 text-[13px] leading-6 ${bannerColor}`}>
      <span className={bannerIconColor}><Icon name={bannerIcon} size={20} /></span>
      <div className="font-bold">{bannerText}
        {neg !== null && <span className="ml-1 text-[12px] font-normal">(<button type="button" onClick={() => go("ar")} className="font-bold underline">ليا عند العملاء</button>)</span>}
      </div>
    </div>

    {/* ── 4 KPIs ── */}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="رصيدك النهارده" value={short(f.opening) + " ر.س"} icon="wallet" color={C.teal} />
      <Kpi label="الفلوس الحرة" value={short(f.free_cash) + " ر.س"} icon="time" color={f.free_cash < 0 ? C.red : C.green} hint={`الرصيد بعد حجز الضريبة (${short(d.vat_period)} ر.س) + احتياطي شهر مصاريف (${short(f.safety_line)} ر.س). اللي فاضل ده ممكن تصرفه أو تستثمره.`} tone={f.free_cash < 0 ? "bad" : "good"} />
      <Kpi label="أقل رصيد متوقع" value={short(f.lowest.balance) + " ر.س"} sub={lowestWeek ? `في ${dm(lowestWeek.from)}` : undefined} icon="flag" color={f.lowest.balance < 0 ? C.red : f.lowest.balance < f.safety_line ? C.amber : C.green} tone={f.lowest.balance < 0 ? "bad" : f.lowest.balance < f.safety_line ? "bad" : "good"} />
      <Kpi label="كام يوم الفلوس تكفي" value={f.days_of_cash !== null ? `${f.days_of_cash} يوم` : "—"} icon="trophy" color={f.days_of_cash !== null && f.days_of_cash < 30 ? C.red : f.days_of_cash !== null && f.days_of_cash < 60 ? C.amber : C.green} tone={f.days_of_cash !== null && f.days_of_cash < 30 ? "bad" : undefined} hint="كام يوم رصيدك الحالي يقدر يغطي المصاريف المتوقعة لو مفيش أي فلوس داخلة." />
    </div>

    {/* ── Sub-tabs ── */}
    <div className="flex gap-1 rounded-xl bg-[var(--bg)] p-1">
      {([["forecast", "التوقع"], ["plan", "خطة الإنقاذ"], ["accuracy", "دقة التوقع"]] as Array<[SubTab, string]>).map(([k, label]) =>
        <button key={k} type="button" onClick={() => setSub(k)} className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${sub === k ? "bg-white text-[var(--navy)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}>{label}</button>)}
    </div>

    {sub === "forecast" && <>
      {/* ── Controls bar ── */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--sky-light)] p-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
          <input type="checkbox" checked={inc} onChange={e => setInc(e.target.checked)} className="accent-[var(--sky)]" />
          ضيف مبيعات جديدة{inc && <Hint text={`من الأسبوع الخامس: ${sar(a.new_weekly)} تحصيل + ${sar(a.cogs_weekly)} تكلفة بضاعة = صافي ${sar(a.new_weekly - a.cogs_weekly)} في الأسبوع.`} />}
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
          نسبة التحصيل
          <select value={d.collect_pct} onChange={e => void saveSettings("collect_pct", Number(e.target.value))} className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs font-bold">
            {[70, 75, 80, 85, 90, 95, 100].map(v => <option key={v} value={v}>{v}%</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
          الضريبة
          <select value={d.vat_filing} onChange={e => void saveSettings("vat_filing", e.target.value)} className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs font-bold">
            <option value="quarterly">ربع سنوية</option>
            <option value="monthly">شهرية</option>
          </select>
        </label>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white p-0.5 text-[11px]">
          {(["optimistic", "base", "pessimistic"] as Scenario[]).map(s => <button key={s} type="button" onClick={() => setScenario(s)} className={`rounded-md px-2.5 py-1 font-bold transition ${scenario === s ? "bg-[var(--navy)] text-white" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}>{SCENARIOS[s].label}</button>)}
        </div>
      </div>

      {/* ── Chart ── */}
      <Card title="الرصيد أسبوع بأسبوع">
        <ForecastChart rows={f.rows} opening={f.opening} safetyLine={f.safety_line} />
      </Card>

      {/* ── Week detail table ── */}
      <Card>
        <div className="-mx-4 overflow-x-auto px-4"><table className="w-full min-w-[700px] text-[12.5px]">
          <thead className="bg-[var(--bg)] text-[11px] text-[var(--muted)]"><tr>
            <th className="p-2 text-right font-bold">الأسبوع</th>
            <th className="p-2 text-center">تحصيل</th>
            {inc && <th className="p-2 text-center">مبيعات جديدة</th>}
            <th className="p-2 text-center">موردين</th>
            <th className="p-2 text-center">مصاريف</th>
            {a.vat_total > 0 && <th className="p-2 text-center">ضريبة</th>}
            {inc && <th className="p-2 text-center">تكلفة بضاعة</th>}
            <th className="p-2 text-center">الصافي</th>
            <th className="p-2 text-center">الرصيد</th>
          </tr></thead>
          <tbody className="divide-y divide-[var(--border)]">{f.rows.map((r, i) => {
            const isExp = expanded === i;
            return [
              <tr key={r.i} onClick={() => setExpanded(isExp ? null : i)} className={`cursor-pointer transition ${isExp ? "bg-[var(--sky-light)]" : "hover:bg-[var(--bg)]"}`}>
                <td className="whitespace-nowrap p-2 text-right text-xs font-bold">{dm(r.from)}–{dm(r.to)}</td>
                <td className="p-2 text-center text-emerald-700">{r.in_ar ? short(r.in_ar) : "—"}</td>
                {inc && <td className="p-2 text-center text-emerald-600">{r.in_new ? short(r.in_new) : "—"}</td>}
                <td className="p-2 text-center text-red-700">{r.out_ap ? short(r.out_ap) : "—"}</td>
                <td className="p-2 text-center">{r.out_fixed + r.out_var ? short(r.out_fixed + r.out_var) : "—"}</td>
                {a.vat_total > 0 && <td className="p-2 text-center text-red-600">{r.out_vat ? short(r.out_vat) : "—"}</td>}
                {inc && <td className="p-2 text-center text-red-600">{r.out_cogs_new ? short(r.out_cogs_new) : "—"}</td>}
                <td className="p-2 text-center"><b className={r.net < 0 ? "text-red-700" : "text-emerald-700"}>{short(r.net)}</b></td>
                <td className="p-2 text-center"><b className={r.balance < 0 ? "text-red-700" : r.balance < f.safety_line ? "text-amber-700" : "text-[var(--navy)]"}>{sar(r.balance)}</b></td>
              </tr>,
              isExp && r.items.length > 0 && <tr key={`${r.i}-x`}><td colSpan={9} className="bg-[var(--bg)] p-3">
                <ul className="space-y-1 text-xs">{r.items.map((it, k) => <li key={k} className="flex justify-between gap-2">
                  <span dir="auto">{it.kind === "in" ? "⬇︎" : "⬆︎"} {it.label}</span>
                  <b className={it.kind === "in" ? "text-emerald-700" : "text-red-700"}>{sar(it.amount)}</b>
                </li>)}</ul>
              </td></tr>,
            ];
          })}</tbody>
        </table></div>
      </Card>

      {/* ── Smart decisions: who to call, who to defer ── */}
      {(f.calls.length > 0 || f.deferrals.length > 0) && <div className="grid gap-4 lg:grid-cols-2">
        {f.calls.length > 0 && <Card title="مين أكلّم الأسبوع ده" hint="العملاء المتأخرين مرتبين بالمبلغ واحتمال الدفع. اضغط على أي عميل لفتح رسالة واتساب.">
          <ul className="space-y-2">{f.calls.map((c, i) => <li key={i} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--bg)] p-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold" dir="auto">{c.name}</div>
              <div className="text-[11px] text-[var(--muted)]">متأخر {c.days_late} يوم{c.avg_days !== null ? ` · عادته ${c.avg_days} يوم` : ""}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <b className="text-sm text-red-700">{short(c.unpaid)} ر.س</b>
              <a href={`https://wa.me/?text=${encodeURIComponent(`السلام عليكم، هذا تذكير ودي بخصوص المبلغ المستحق ${c.unpaid.toLocaleString("en-US")} ر.س. نرجو التكرم بالسداد في أقرب وقت. شكراً لتعاونكم.`)}`} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 transition hover:bg-emerald-200" title="واتساب"><Icon name="send" size={14} /></a>
            </div>
          </li>)}</ul>
        </Card>}
        {f.deferrals.length > 0 && <Card title="مين أقدر أأجّله" hint="الموردين المتأخرين اللي لو أجّلت دفعتهم 4 أسابيع هيفرق معاك في السيولة.">
          <ul className="space-y-2">{f.deferrals.map((s, i) => <li key={i} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--bg)] p-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold" dir="auto">{s.name}</div>
              <div className="text-[11px] text-[var(--muted)]">متأخر {s.days_late} يوم</div>
            </div>
            <div className="text-left">
              <b className="text-sm text-[var(--navy)]">{short(s.unpaid)} ر.س</b>
              <div className="text-[10px] text-emerald-700">لو أجّلت 4 أسابيع → +{short(s.saving_if_defer_4w)} سيولة</div>
            </div>
          </li>)}</ul>
        </Card>}
      </div>}

      {/* ── Financial health indicators ── */}
      {(f.dso !== null || f.dpo !== null) && <Card title="صحة الدورة النقدية">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {f.dso !== null && <div className="rounded-xl bg-[var(--bg)] p-3 text-center">
            <div className="text-[11px] font-bold text-[var(--muted)]">متوسط أيام التحصيل (DSO)</div>
            <div className={`mt-1 text-2xl font-extrabold ${f.dso > 60 ? "text-red-700" : f.dso > 45 ? "text-amber-700" : "text-emerald-700"}`}>{f.dso} يوم</div>
            <div className="mt-0.5 text-[10px] text-[var(--muted)]">{f.dso <= 45 ? "ممتاز — أقل من 45 يوم" : f.dso <= 60 ? "مقبول — حاول تنزله تحت 45" : "عالي — محتاج تحصّل أسرع"}</div>
          </div>}
          {f.dpo !== null && <div className="rounded-xl bg-[var(--bg)] p-3 text-center">
            <div className="text-[11px] font-bold text-[var(--muted)]">متوسط أيام الدفع للموردين (DPO)</div>
            <div className="mt-1 text-2xl font-extrabold text-[var(--navy)]">{f.dpo} يوم</div>
            <div className="mt-0.5 text-[10px] text-[var(--muted)]">كل ما يزيد، الفلوس تفضل عندك أطول</div>
          </div>}
          {f.ccc !== null && <div className="rounded-xl bg-[var(--bg)] p-3 text-center">
            <div className="text-[11px] font-bold text-[var(--muted)]">دورة النقدية (CCC)<Hint text="الفلوس محبوسة كام يوم من ساعة ما تدفع للمورد لحد ما تحصّل من العميل. كل ما يقل أحسن." /></div>
            <div className={`mt-1 text-2xl font-extrabold ${f.ccc > 30 ? "text-red-700" : f.ccc > 15 ? "text-amber-700" : "text-emerald-700"}`}>{f.ccc} يوم</div>
            <div className="mt-0.5 text-[10px] text-[var(--muted)]">{f.ccc <= 0 ? "ممتاز — الموردين بيموّلوا الدورة" : f.ccc <= 15 ? "كويس" : "عالي — حصّل أسرع أو أجّل الدفع"}</div>
          </div>}
        </div>
      </Card>}

      {/* ── Assumptions ── */}
      <Card title="الافتراضات">
        <ul className="grid gap-2 text-[12px] leading-6 text-[var(--ink-soft)] sm:grid-cols-2">
          <li>• نسبة التحصيل <b>{a.collect_pct}%</b> من كل فاتورة، والتوقيت حسب عادة كل عميل في الدفع.</li>
          <li>• المصاريف الثابتة {sar(a.fixed_monthly)} في الشهر يوم 27 ({a.fixed_source === "list" ? "من قائمتك" : "متوسط من دفترة"}).</li>
          {a.variable_monthly > 0 && <li>• مصاريف متغيرة {sar(a.variable_monthly)} في الشهر موزعة أسبوعياً.</li>}
          {a.vat_total > 0 && <li>• الضريبة <b>{sar(a.vat_total)}</b> محسوبة كفلوس خارجة ({a.vat_filing === "quarterly" ? "ربع سنوية" : "شهرية"}).</li>}
          {a.include_new && <li>• مبيعات جديدة من الأسبوع الخامس: تحصيل {sar(a.new_weekly)} − تكلفة بضاعة {sar(a.cogs_weekly)} = صافي {sar(a.new_weekly - a.cogs_weekly)} أسبوعياً.</li>}
          {a.offsets_applied > 0 && <li>• المقاصة: اتخصم <b>{sar(a.offsets_applied)}</b> من المدفوع للموردين.</li>}
        </ul>
      </Card>
    </>}

    {sub === "plan" && <CashPlan />}

    {sub === "accuracy" && <AccuracyTab log={d.balance_log} />}
  </div>;
}
